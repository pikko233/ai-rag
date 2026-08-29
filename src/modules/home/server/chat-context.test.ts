import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemPrompt, isSimpleGreeting } from "./chat-context";

test("只把完整的简单问候识别为快速通道", () => {
  assert.equal(isSimpleGreeting("你好！"), true);
  assert.equal(isSimpleGreeting(" Hello "), true);
  assert.equal(isSimpleGreeting("你好，退款流程是什么"), false);
});

test("没有检索结果时只使用通用 AI 助手提示词", () => {
  const prompt = buildSystemPrompt({ memories: [], ragResults: [] });

  assert.match(prompt, /你是一位 AI 助手/);
  assert.doesNotMatch(prompt, /<knowledge>/);
  assert.doesNotMatch(prompt, /<user_memories>/);
});

test("只在有结果时加入长期记忆和知识库上下文", () => {
  const prompt = buildSystemPrompt({
    memories: [{ text: "用户偏好简短回答" }],
    ragResults: [
      {
        content: "退款申请需要在七天内提交。",
        filename: "售后规则.pdf",
        pageNumber: 3,
        similarity: 0.88,
      },
    ],
  });

  assert.match(prompt, /用户偏好简短回答/);
  assert.match(prompt, /退款申请需要在七天内提交/);
  assert.match(prompt, /售后规则\.pdf，第 3 页/);
});
