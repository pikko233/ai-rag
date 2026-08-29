import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { conversation, message } from "@/db/schema";
import { readJsonBody } from "@/lib/request";
import { getCurrentUser } from "@/lib/server-session";
import {
  createConversation,
  findOwnedConversation,
} from "@/modules/home/server/conversations";
import {
  extractLongTermMemories,
  streamChatAgent,
} from "@/modules/home/server/chat-agent";
import {
  isSimpleGreeting,
  messageText,
} from "@/modules/home/server/chat-context";

const requestSchema = z.object({
  conversationId: z.string().uuid(),
  createConversation: z.boolean().optional(),
  title: z.string().trim().min(1).max(40).optional(),
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z
      .array(
        z.union([
          z.object({ type: z.literal("text"), text: z.string().max(50_000) }),
          z.object({
            type: z.literal("file"),
            mediaType: z.literal("application/pdf"),
            filename: z.string().max(255).optional(),
            url: z.string().regex(/^file:[0-9a-f-]{36}$/i),
          }),
        ]),
      )
      .min(1)
      .max(10),
  }),
});

function completedMessageResponse(
  originalMessages: UIMessage[],
  assistant: UIMessage,
) {
  const text = assistant.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const stream = createUIMessageStream({
    originalMessages,
    execute: ({ writer }) => {
      const textId = `${assistant.id}:text`;
      writer.write({ type: "start", messageId: assistant.id });
      writer.write({ type: "text-start", id: textId });
      if (text) writer.write({ type: "text-delta", id: textId, delta: text });
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish", finishReason: "stop" });
      writer.setOutcome({ status: "completed" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const parsed = requestSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    return NextResponse.json({ error: "消息格式不正确" }, { status: 400 });
  }

  const conversationId = parsed.data.conversationId;
  const incoming = parsed.data.message as UIMessage;
  const ownedConversation = parsed.data.createConversation
    ? ((await createConversation({
        id: conversationId,
        userId: user.id,
        title: parsed.data.title ?? "新对话",
      })) ?? (await findOwnedConversation(conversationId, user.id)))
    : await findOwnedConversation(conversationId, user.id);
  if (!ownedConversation) {
    return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }

  const assistantId = `${incoming.id}:assistant`;
  const inserted = await db.transaction(async (tx) => {
    const [newUserMessage] = await tx
      .insert(message)
      .values({
        id: incoming.id,
        conversationId,
        role: "user",
        status: "completed",
        parts: incoming.parts,
      })
      .onConflictDoNothing()
      .returning();

    if (!newUserMessage) {
      const [existing] = await tx
        .select()
        .from(message)
        .where(eq(message.id, incoming.id))
        .limit(1);
      if (
        !existing ||
        existing.conversationId !== conversationId ||
        existing.role !== "user"
      ) {
        throw new Error("消息 ID 已被占用");
      }
    }

    const [newAssistant] = await tx
      .insert(message)
      .values({
        id: assistantId,
        conversationId,
        role: "assistant",
        status: "in_progress",
        parts: [],
      })
      .onConflictDoNothing()
      .returning();

    if (newUserMessage) {
      await tx
        .update(conversation)
        .set({ updatedAt: new Date() })
        .where(eq(conversation.id, conversationId));
    }

    return Boolean(newAssistant);
  });

  if (!inserted) {
    const [existingAssistant] = await db
      .select()
      .from(message)
      .where(eq(message.id, assistantId))
      .limit(1);
    // 占位消息让相同请求具备幂等性：刷新或重试不会再次调用模型。
    if (
      existingAssistant?.conversationId === conversationId &&
      existingAssistant.status === "completed"
    ) {
      return completedMessageResponse([incoming], {
        id: existingAssistant.id,
        role: "assistant",
        parts: existingAssistant.parts,
      });
    }
    return NextResponse.json(
      { error: "这条消息仍在处理中，请稍后再试" },
      { status: 409 },
    );
  }

  // 记忆提取放到响应结束后，避免与主回答争用模型请求。
  if (!isSimpleGreeting(messageText(incoming))) {
    after(() => extractLongTermMemories(user.id, incoming));
  }
  const stream = createUIMessageStream({
    originalMessages: [incoming],
    execute: async ({ writer }) => {
      const textId = `${assistantId}:text`;
      writer.write({ type: "start", messageId: assistantId });
      writer.write({ type: "text-start", id: textId });

      try {
        await streamChatAgent({
          conversationId,
          userId: user.id,
          incoming,
          signal: req.signal,
          onText: (delta) =>
            writer.write({ type: "text-delta", id: textId, delta }),
        });
        writer.write({ type: "text-end", id: textId });
        writer.write({ type: "finish", finishReason: "stop" });
        writer.setOutcome({ status: "completed" });
      } catch (error) {
        if (req.signal.aborted) {
          writer.write({ type: "abort" });
          writer.setOutcome({ status: "aborted" });
          return;
        }
        writer.setOutcome({ status: "failed", error });
        throw error;
      }
    },
    onError: () => "生成回答时遇到问题，请稍后重试。",
    onEnd: async ({ responseMessage, outcome, finishReason }) => {
      const status =
        outcome.status === "completed"
          ? "completed"
          : outcome.status === "aborted"
            ? "aborted"
            : "failed";

      // 流结束后一次性保存完整回答，避免每个 token 都写数据库。
      await db.transaction(async (tx) => {
        await tx
          .update(message)
          .set({
            status,
            parts: responseMessage.parts,
            metadata: { finishReason, outcome: outcome.status },
            error: status === "failed" ? "模型生成失败" : null,
            updatedAt: new Date(),
          })
          .where(eq(message.id, assistantId));
        await tx
          .update(conversation)
          .set({ updatedAt: new Date() })
          .where(eq(conversation.id, conversationId));
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
