import assert from "node:assert/strict";
import { mock, test } from "node:test";

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
let ragIngestionInput: { fileId: string; userId: string } | undefined;

mock.module(moduleUrl("../../db/index.ts"), {
  namedExports: { db: {} },
});
mock.module(moduleUrl("../../lib/server-session.ts"), {
  namedExports: { getCurrentUser: async () => ({ id: "user-1" }) },
});
mock.module(moduleUrl("../../lib/storage.ts"), {
  namedExports: { createUploadUrl: async () => "https://upload.example" },
});
mock.module(moduleUrl("../../modules/home/server/chat-agent.ts"), {
  namedExports: {
    extractLongTermMemories: async () => undefined,
    streamChatAgent: async () => undefined,
  },
});
mock.module(moduleUrl("../../modules/home/server/conversations.ts"), {
  namedExports: {
    createConversation: async () => null,
    findOwnedConversation: async () => null,
  },
});
mock.module(moduleUrl("../../modules/rag/server/documents.ts"), {
  namedExports: {
    ingestRagDocument: async (input: { fileId: string; userId: string }) => {
      ragIngestionInput = input;
      return { id: "document-1" };
    },
    RagIngestionError: class RagIngestionError extends Error {},
  },
});

const malformedRequest = () =>
  new Request("http://localhost", { method: "POST", body: "{" });

test("聊天接口拒绝畸形 JSON", async () => {
  const { POST } = await import("./chat/route");

  const response = await POST(malformedRequest());

  assert.equal(response.status, 400);
});

test("文件预签名接口拒绝畸形 JSON", async () => {
  const { POST } = await import("./files/presign/route");

  const response = await POST(malformedRequest());

  assert.equal(response.status, 400);
});

test("RAG 导入接口拒绝畸形 JSON", async () => {
  const { POST } = await import("./rag/documents/route");

  const response = await POST(malformedRequest());

  assert.equal(response.status, 400);
});

test("RAG 导入只使用当前登录用户的身份", async () => {
  const { POST } = await import("./rag/documents/route");
  const fileId = "0189f38c-4ba7-451a-8384-b69b63e4d8d9";

  const response = await POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(ragIngestionInput, { fileId, userId: "user-1" });
});
