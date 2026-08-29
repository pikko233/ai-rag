import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
const conversationId = "0189f38c-4ba7-451a-8384-b69b63e4d8d9";
let ownedConversation: { id: string } | null = { id: conversationId };
let transactionCalls = 0;
let streamChatAgentCalls = 0;

mock.module(moduleUrl("../../../db/index.ts"), {
  namedExports: {
    db: {
      transaction: async () => {
        transactionCalls += 1;
        return false;
      },
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                id: "message-1:assistant",
                conversationId,
                role: "assistant",
                status: "completed",
                parts: [{ type: "text", text: "你好，有什么可以帮你？" }],
              },
            ],
          }),
        }),
      }),
    },
  },
});
mock.module(moduleUrl("../../../lib/server-session.ts"), {
  namedExports: { getCurrentUser: async () => ({ id: "user-1" }) },
});
mock.module(moduleUrl("../../../modules/home/server/chat-agent.ts"), {
  namedExports: {
    extractLongTermMemories: async () => undefined,
    streamChatAgent: async () => {
      streamChatAgentCalls += 1;
    },
  },
});
mock.module(moduleUrl("../../../modules/home/server/conversations.ts"), {
  namedExports: {
    createConversation: async () => null,
    findOwnedConversation: async () => ownedConversation,
  },
});

beforeEach(() => {
  ownedConversation = { id: conversationId };
  transactionCalls = 0;
  streamChatAgentCalls = 0;
});

function chatRequest() {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId,
      message: {
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "你好" }],
      },
    }),
  });
}

test("用户不能向不属于自己的对话发送消息", async () => {
  ownedConversation = null;
  const { POST } = await import("./route");

  const response = await POST(chatRequest());

  assert.equal(response.status, 404);
  assert.equal(transactionCalls, 0);
  assert.equal(streamChatAgentCalls, 0);
});

test("重复消息返回已保存回答且不再次调用模型", async () => {
  const { POST } = await import("./route");

  const response = await POST(chatRequest());

  assert.equal(response.status, 200);
  assert.equal(streamChatAgentCalls, 0);
  assert.match(await response.text(), /你好，有什么可以帮你/);
});
