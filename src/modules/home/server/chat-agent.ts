import "server-only";

import { createHash } from "node:crypto";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  isHumanMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { and, eq, inArray } from "drizzle-orm";
import {
  createAgent,
  createMiddleware,
  dynamicSystemPromptMiddleware,
  summarizationMiddleware,
} from "langchain";
import type { UIMessage } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { storedFile } from "@/db/schema";
import { createDownloadUrl } from "@/lib/storage";
import {
  buildSystemPrompt,
  isSimpleGreeting,
  messageText,
  type UserMemory,
} from "@/modules/home/server/chat-context";
import { searchRagDocuments } from "@/modules/rag/server/documents";

const EMBEDDING_DIMENSIONS = 1536;
const MEMORY_SCHEMA = "langgraph";
const DEFAULT_MEMORY_SIMILARITY = 0.65;

const chatContextSchema = z.object({
  userId: z.string(),
  query: z.string(),
});

const extractedMemoriesSchema = z.object({
  memories: z.array(z.string().trim().min(1).max(300)).max(3),
});

type StableFileBlock = {
  type: "file";
  url: string;
  mimeType: "application/pdf";
  metadata: { filename: string };
};

function requiredEnvironment() {
  const apiKey = process.env.OPENAI_KEY;
  const connectionString = process.env.DATABASE_URL;
  if (!apiKey || !connectionString) {
    throw new Error("AI 记忆服务尚未配置完整");
  }
  return { apiKey, connectionString };
}

function configuredNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

async function searchLongTermMemories(
  store: PostgresStore,
  userId: string,
  query: string,
) {
  if (!query) return [];

  try {
    const matches = await store.search([userId, "memories"], {
      query,
      limit: 3,
      mode: "vector",
      similarityThreshold: configuredNumber(
        "MEMORY_MIN_SIMILARITY",
        DEFAULT_MEMORY_SIMILARITY,
      ),
    });

    return matches.flatMap((item): UserMemory[] => {
      const text = item.value.text;
      return typeof text === "string" ? [{ text }] : [];
    });
  } catch (error) {
    console.error("Failed to search long-term memory", error);
    return [];
  }
}

function stableFileIds(messages: BaseMessage[]) {
  return messages.flatMap((item) =>
    Array.isArray(item.content)
      ? item.content.flatMap((block) => {
          if (
            block.type === "file" &&
            "url" in block &&
            typeof block.url === "string" &&
            block.url.startsWith("file:")
          ) {
            return [block.url.slice(5)];
          }
          return [];
        })
      : [],
  );
}

const privateFileMiddleware = createMiddleware({
  name: "PrivateFileMiddleware",
  contextSchema: chatContextSchema,
  wrapModelCall: async (request, handler) => {
    const fileIds = [...new Set(stableFileIds(request.messages))];
    if (fileIds.length === 0) return handler(request);

    const files = await db
      .select()
      .from(storedFile)
      .where(
        and(
          inArray(storedFile.id, fileIds),
          eq(storedFile.userId, request.runtime.context.userId),
          eq(storedFile.status, "uploaded"),
        ),
      );
    if (files.length !== fileIds.length) {
      throw new Error("附件不存在或无权访问");
    }

    const filesById = new Map(files.map((file) => [file.id, file]));
    const messages = await Promise.all(
      request.messages.map(async (item) => {
        if (!isHumanMessage(item) || !Array.isArray(item.content)) return item;

        const content = await Promise.all(
          item.content.map(async (block) => {
            if (
              block.type !== "file" ||
              !("url" in block) ||
              typeof block.url !== "string" ||
              !block.url.startsWith("file:")
            ) {
              return block;
            }

            const file = filesById.get(block.url.slice(5));
            if (!file) throw new Error("附件不存在");
            return {
              ...block,
              url: await createDownloadUrl(file.objectKey),
              // Responses API 的 file_url 与 filename 互斥，文件名仍保留在 checkpoint 中。
              metadata: undefined,
            };
          }),
        );

        return new HumanMessage({
          id: item.id,
          name: item.name,
          content,
          additional_kwargs: item.additional_kwargs,
          response_metadata: {
            ...item.response_metadata,
            output_version: "v1",
          },
        });
      }),
    );

    // checkpoint 只保存 file:<id>；短效签名 URL 仅存在于这次模型请求中。
    return handler({ ...request, messages });
  },
});

async function createChatResources() {
  const { apiKey, connectionString } = requiredEnvironment();
  const model = new ChatOpenAI({
    apiKey,
    model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
    useResponsesApi: true,
  });
  const memoryModel = new ChatOpenAI({
    apiKey,
    model:
      process.env.OPENAI_MEMORY_MODEL ??
      process.env.OPENAI_MODEL ??
      "gpt-5.6-luna",
    useResponsesApi: true,
  });
  const embeddings = new OpenAIEmbeddings({
    apiKey,
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    dimensions: EMBEDDING_DIMENSIONS,
  });
  const checkpointer = PostgresSaver.fromConnString(connectionString, {
    schema: MEMORY_SCHEMA,
  });
  const store = PostgresStore.fromConnString(connectionString, {
    schema: MEMORY_SCHEMA,
    // 表结构由 db:setup-memory 负责，聊天请求只做读写。
    ensureTables: false,
    index: {
      dims: EMBEDDING_DIMENSIONS,
      embed: embeddings,
      fields: ["text"],
      indexType: "hnsw",
      distanceMetric: "cosine",
    },
  });

  const dynamicPrompt = dynamicSystemPromptMiddleware<
    z.infer<typeof chatContextSchema>
  >(async (_state, runtime) => {
    // 简单问候不需要向量化，直接进入模型可以显著缩短首 token 时间。
    if (isSimpleGreeting(runtime.context.query)) {
      return buildSystemPrompt({ memories: [], ragResults: [] });
    }

    const [memories, ragResults] = await Promise.all([
      searchLongTermMemories(store, runtime.context.userId, runtime.context.query),
      searchRagDocuments({
        query: runtime.context.query,
        userId: runtime.context.userId,
      }).catch((error) => {
        console.error("Failed to search RAG documents", error);
        return [];
      }),
    ]);

    return buildSystemPrompt({ memories, ragResults });
  });

  const agent = createAgent({
    model,
    tools: [],
    contextSchema: chatContextSchema,
    checkpointer,
    store,
    middleware: [
      summarizationMiddleware({
        model,
        trigger: { tokens: 4_000 },
        keep: { messages: 20 },
      }),
      dynamicPrompt,
      privateFileMiddleware,
    ],
  });

  return { agent, checkpointer, memoryModel, store };
}

let resourcesPromise: ReturnType<typeof createChatResources> | undefined;

function getChatResources() {
  resourcesPromise ??= createChatResources().catch((error) => {
    resourcesPromise = undefined;
    throw error;
  });
  return resourcesPromise;
}

function toLangChainMessage(item: UIMessage) {
  const textParts = item.parts.flatMap((part) =>
    part.type === "text" ? [{ type: "text" as const, text: part.text }] : [],
  );
  const fileParts = item.parts.flatMap((part): StableFileBlock[] => {
    if (part.type !== "file" || !part.url.startsWith("file:")) return [];
    return [
      {
        type: "file",
        url: part.url,
        mimeType: "application/pdf",
        metadata: { filename: part.filename ?? "附件.pdf" },
      },
    ];
  });

  if (item.role === "user") {
    // contentBlocks 会标记 LangChain v1 标准格式，OpenAI 才会保留 PDF block。
    return new HumanMessage({
      id: item.id,
      contentBlocks: [...textParts, ...fileParts],
    });
  }
  return new AIMessage({ id: item.id, content: messageText(item) });
}

export async function streamChatAgent(input: {
  conversationId: string;
  userId: string;
  incoming: UIMessage;
  signal: AbortSignal;
  onText: (delta: string) => void;
}) {
  const { agent } = await getChatResources();
  const config = {
    configurable: { thread_id: input.conversationId },
    context: {
      userId: input.userId,
      query: messageText(input.incoming),
    },
    signal: input.signal,
  };
  // 每轮只提交新增消息，PostgresSaver 会按 thread_id 自动恢复此前状态。
  const run = await agent.streamEvents(
    { messages: [toLangChainMessage(input.incoming)] },
    { ...config, version: "v3" },
  );
  for await (const streamedMessage of run.messages) {
    for await (const delta of streamedMessage.text) input.onText(delta);
  }
  // 完整消费 output 后 checkpoint 才保证已经写入。
  await run.output;
}

export async function extractLongTermMemories(
  userId: string,
  userMessage: UIMessage,
) {
  const text = messageText(userMessage);
  if (!text || !userMessage.parts.some((part) => part.type === "text")) return;

  try {
    const { memoryModel, store } = await getChatResources();
    const extractionModel = memoryModel.withStructuredOutput(
      extractedMemoriesSchema,
      {
        name: "extract_user_memories",
        strict: true,
      },
    );
    const result = await extractionModel.invoke([
      new SystemMessage(
        "从用户消息中提取可跨对话复用、且由用户明确陈述的稳定事实或偏好，例如称呼、语言、回答风格、长期项目背景。不要推测；不要保存密码、密钥、身份号码、健康或财务等敏感信息；不要保存一次性问题。没有合适内容时返回空数组。每条记忆写成独立、简短的中文陈述。",
      ),
      new HumanMessage(text),
    ]);
    if (result.memories.length === 0) return;

    await Promise.all(
      result.memories.map((memory) => {
        const normalized = memory.trim();
        // 相同文本使用相同 key，避免重复表达生成完全相同的记忆副本。
        const key = createHash("sha256").update(normalized).digest("hex");
        return store.put(
          [userId, "memories"],
          key,
          { text: normalized, createdAt: new Date().toISOString() },
          ["text"],
        );
      }),
    );
  } catch (error) {
    // 记忆提取失败不应打断主回答。
    console.error("Failed to extract long-term memory", error);
  }
}

export async function deleteChatAgentThread(conversationId: string) {
  const { checkpointer } = await getChatResources();
  await checkpointer.deleteThread(conversationId);
}
