import "server-only";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ragDocument, storedFile } from "@/db/schema";
import { readObjectBytes } from "@/lib/storage";
import type { RagDocumentSummary } from "@/modules/rag/types";

const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_RAG_SIMILARITY = 0.7;

export type RagSearchResult = {
  content: string;
  filename: string;
  pageNumber: number;
  similarity: number;
};

type DocumentRow = {
  id: string;
  fileId: string;
  filename: string;
  size: number;
  status: "processing" | "ready" | "failed";
  pageCount: number;
  chunkCount: number;
  error: string | null;
  createdAt: Date;
};

function toSummary(row: DocumentRow): RagDocumentSummary {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function listRagDocuments(
  userId: string,
): Promise<RagDocumentSummary[]> {
  const rows = await db
    .select({
      id: ragDocument.id,
      fileId: ragDocument.fileId,
      filename: storedFile.filename,
      size: storedFile.size,
      status: ragDocument.status,
      pageCount: ragDocument.pageCount,
      chunkCount: ragDocument.chunkCount,
      error: ragDocument.error,
      createdAt: ragDocument.createdAt,
    })
    .from(ragDocument)
    .innerJoin(storedFile, eq(storedFile.id, ragDocument.fileId))
    .where(eq(ragDocument.userId, userId))
    .orderBy(desc(ragDocument.createdAt));

  return rows.map(toSummary);
}

export class RagIngestionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function createVectorStore() {
  const apiKey = process.env.OPENAI_KEY;
  const connectionString = process.env.DATABASE_URL;
  if (!apiKey || !connectionString) {
    throw new Error("RAG 服务尚未配置完整");
  }

  const embeddings = new OpenAIEmbeddings({
    apiKey,
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    dimensions: EMBEDDING_DIMENSIONS,
    batchSize: 128,
  });

  return PGVectorStore.initialize(embeddings, {
    postgresConnectionOptions: { connectionString, max: 5 },
    tableName: "rag_chunk",
    columns: {
      idColumnName: "id",
      contentColumnName: "content",
      metadataColumnName: "metadata",
      vectorColumnName: "embedding",
    },
    distanceStrategy: "cosine",
    scoreNormalization: "similarity",
    dimensions: EMBEDDING_DIMENSIONS,
    // 表和索引由 Drizzle migration 创建，不在每次查询时重复检查 DDL。
    skipInitializationCheck: true,
  });
}

let vectorStorePromise: ReturnType<typeof createVectorStore> | undefined;

function getVectorStore() {
  vectorStorePromise ??= createVectorStore().catch((error) => {
    vectorStorePromise = undefined;
    throw error;
  });
  return vectorStorePromise;
}

export async function searchRagDocuments(input: {
  query: string;
  userId: string;
  limit?: number;
}): Promise<RagSearchResult[]> {
  if (!input.query.trim()) return [];

  const configuredThreshold = Number(process.env.RAG_MIN_SIMILARITY);
  const minimumSimilarity = Number.isFinite(configuredThreshold)
    ? configuredThreshold
    : DEFAULT_RAG_SIMILARITY;
  const vectorStore = await getVectorStore();

  // PGVectorStore 会先向量化 query，再只检索当前用户自己的文档。
  const matches = await vectorStore.similaritySearchWithScore(
    input.query,
    input.limit ?? 5,
    { userId: input.userId },
  );

  // 最近邻总会返回结果，必须再过阈值，避免把“不相关但最接近”的内容塞给 AI。
  return matches.flatMap(([document, similarity]) => {
    if (similarity < minimumSimilarity) return [];
    const metadata = document.metadata as Partial<{
      filename: string;
      pageNumber: number;
    }>;
    if (!metadata.filename || !metadata.pageNumber) return [];

    return [
      {
        content: document.pageContent,
        filename: metadata.filename,
        pageNumber: metadata.pageNumber,
        similarity,
      },
    ];
  });
}

export async function ingestRagDocument(input: {
  fileId: string;
  userId: string;
}): Promise<RagDocumentSummary> {
  const [file] = await db
    .select()
    .from(storedFile)
    .where(
      and(
        eq(storedFile.id, input.fileId),
        eq(storedFile.userId, input.userId),
        eq(storedFile.status, "uploaded"),
      ),
    )
    .limit(1);
  if (!file) throw new RagIngestionError("PDF 不存在或尚未上传完成", 404);

  const [existing] = await db
    .select()
    .from(ragDocument)
    .where(
      and(
        eq(ragDocument.fileId, file.id),
        eq(ragDocument.userId, input.userId),
      ),
    )
    .limit(1);

  if (existing?.status === "ready") {
    return toSummary({ ...existing, filename: file.filename, size: file.size });
  }

  const documentId = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await db
      .update(ragDocument)
      .set({
        status: "processing",
        pageCount: 0,
        chunkCount: 0,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(ragDocument.id, documentId));
  } else {
    await db.insert(ragDocument).values({
      id: documentId,
      userId: input.userId,
      fileId: file.id,
    });
  }

  let vectorStore: Awaited<ReturnType<typeof createVectorStore>> | null = null;
  try {
    const bytes = await readObjectBytes(file.objectKey);
    const loader = new PDFLoader(
      new Blob([Buffer.from(bytes)], { type: "application/pdf" }),
      { splitPages: true },
    );
    const pages = await loader.load();
    const textPages = pages.filter((page) => page.pageContent.trim().length > 0);
    if (textPages.length === 0) {
      throw new RagIngestionError("PDF 中没有可提取的文字", 400);
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 150,
      separators: ["\n\n", "\n", "。", "！", "？", ".", " ", ""],
    });
    const chunks = await splitter.splitDocuments(textPages);
    const pageCount = Number(
      pages[0]?.metadata.pdf?.totalPages ?? pages.length,
    );
    const documents = chunks.map((chunk, chunkIndex) => ({
      pageContent: chunk.pageContent,
      metadata: {
        userId: input.userId,
        documentId,
        fileId: file.id,
        filename: file.filename,
        pageNumber: Number(chunk.metadata.loc?.pageNumber ?? 1),
        chunkIndex,
      },
    }));

    vectorStore = await getVectorStore();
    // 重试前先清理旧切块，保证同一个文档只保留一套有效向量。
    await vectorStore.delete({ filter: { documentId } });
    await vectorStore.addDocuments(documents, {
      ids: documents.map(() => crypto.randomUUID()),
    });

    const [completed] = await db
      .update(ragDocument)
      .set({
        status: "ready",
        pageCount,
        chunkCount: documents.length,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(ragDocument.id, documentId))
      .returning();

    return toSummary({ ...completed, filename: file.filename, size: file.size });
  } catch (error) {
    if (vectorStore) {
      await vectorStore.delete({ filter: { documentId } }).catch(() => undefined);
    }
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "文档处理失败";
    await db
      .update(ragDocument)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(ragDocument.id, documentId));
    throw error;
  }
}
