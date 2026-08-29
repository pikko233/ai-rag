import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
let deleteConversationCalls = 0;
let deleteThreadCalls = 0;
let ownedConversation: { id: string } | null = { id: "conversation-1" };
let checkpointError: Error | null = null;

mock.module(moduleUrl("../../../db/index.ts"), {
  namedExports: {
    db: {
      delete: () => {
        deleteConversationCalls += 1;
        return {
          where: () => ({ returning: async () => [{ id: "conversation-1" }] }),
        };
      },
    },
  },
});
mock.module(moduleUrl("../../../lib/server-session.ts"), {
  namedExports: { getCurrentUser: async () => ({ id: "user-1" }) },
});
mock.module(moduleUrl("../../../modules/home/server/chat-agent.ts"), {
  namedExports: {
    deleteChatAgentThread: async () => {
      deleteThreadCalls += 1;
      if (checkpointError) throw checkpointError;
    },
  },
});
mock.module(moduleUrl("../../../modules/home/server/conversations.ts"), {
  namedExports: {
    findOwnedConversation: async () => ownedConversation,
  },
});

beforeEach(() => {
  deleteConversationCalls = 0;
  deleteThreadCalls = 0;
  ownedConversation = { id: "conversation-1" };
  checkpointError = null;
});

test("checkpoint 清理失败时保留业务对话", async (context) => {
  context.mock.method(console, "error", () => undefined);
  checkpointError = new Error("checkpoint unavailable");
  const { DELETE } = await import("./[conversationId]/route");

  const response = await DELETE(new Request("http://localhost"), {
    params: Promise.resolve({ conversationId: "conversation-1" }),
  });

  assert.equal(response.status, 503);
  assert.equal(deleteConversationCalls, 0);
});

test("用户不能删除不属于自己的对话", async () => {
  ownedConversation = null;
  const { DELETE } = await import("./[conversationId]/route");

  const response = await DELETE(new Request("http://localhost"), {
    params: Promise.resolve({ conversationId: "conversation-1" }),
  });

  assert.equal(response.status, 404);
  assert.equal(deleteThreadCalls, 0);
  assert.equal(deleteConversationCalls, 0);
});

test("checkpoint 清理成功后删除业务对话", async () => {
  const { DELETE } = await import("./[conversationId]/route");

  const response = await DELETE(new Request("http://localhost"), {
    params: Promise.resolve({ conversationId: "conversation-1" }),
  });

  assert.equal(response.status, 204);
  assert.equal(deleteThreadCalls, 1);
  assert.equal(deleteConversationCalls, 1);
});
