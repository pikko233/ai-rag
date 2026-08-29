import assert from "node:assert/strict";
import test from "node:test";
import type { UIMessage } from "ai";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeChatContent } from "./home-chat-content";

test("流开始但还没有文本时只显示一个 AI loading 消息", () => {
  const messages: UIMessage[] = [
    { id: "user-1", role: "user", parts: [{ type: "text", text: "你好" }] },
    { id: "assistant-1", role: "assistant", parts: [] },
  ];
  const markup = renderToStaticMarkup(
    <HomeChatContent
      messages={messages}
      isResponding
      hasOlderMessages={false}
      onLoadOlder={() => undefined}
      onSelect={() => undefined}
    />,
  );

  assert.equal(markup.match(/lucide-sparkles/g)?.length, 1);
  assert.match(markup, /正在思考/);
});

test("PDF 附件显示在用户消息气泡上方", () => {
  const messages: UIMessage[] = [
    {
      id: "user-1",
      role: "user",
      parts: [
        { type: "text", text: "请总结这份文档" },
        {
          type: "file",
          mediaType: "application/pdf",
          filename: "产品说明.pdf",
          url: "file:0189f38c-4ba7-451a-8384-b69b63e4d8d9",
        },
      ],
    },
  ];
  const markup = renderToStaticMarkup(
    <HomeChatContent
      messages={messages}
      isResponding={false}
      hasOlderMessages={false}
      onLoadOlder={() => undefined}
      onSelect={() => undefined}
    />,
  );

  assert.ok(markup.indexOf("产品说明.pdf") < markup.indexOf("请总结这份文档"));
  assert.match(markup, /PDF · 点击预览/);
  assert.doesNotMatch(markup, /附件：产品说明.pdf/);
});

test("AI 消息使用 MarkdownContent 渲染", () => {
  const messages: UIMessage[] = [
    {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "这是 **重点内容**" }],
    },
  ];
  const markup = renderToStaticMarkup(
    <HomeChatContent
      messages={messages}
      isResponding={false}
      hasOlderMessages={false}
      onLoadOlder={() => undefined}
      onSelect={() => undefined}
    />,
  );

  assert.match(markup, /<strong>重点内容<\/strong>/);
});
