"use client";

import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { MarkdownContent } from "@/components/markdown-content";
import { Spinner } from "@/components/ui/spinner";
import type { FileUIPart, UIMessage } from "ai";
import { FileSearch, FileText, Lightbulb, Sparkles } from "lucide-react";

const suggestions = [
  "帮我总结一份 PDF 文档",
  "解释 RAG 的工作原理",
  "如何提高知识库检索质量？",
];

function getMessageContent(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
}

function PdfAttachment({ part }: { part: FileUIPart }) {
  const filename = part.filename ?? "PDF 文档";
  // 对话中只保存稳定的 file: 引用，预览时再通过鉴权接口获取短效地址。
  const previewUrl = part.url.startsWith("file:")
    ? `/api/files/${encodeURIComponent(part.url.slice(5))}`
    : part.url;

  return (
    <Dialog>
      <Attachment className="max-w-72 bg-background/80">
        <AttachmentMedia>
          <FileText />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{filename}</AttachmentTitle>
          <AttachmentDescription>PDF · 点击预览</AttachmentDescription>
        </AttachmentContent>
        <DialogTrigger
          aria-label={`预览 ${filename}`}
          render={
            <button
              type="button"
              className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        />
      </Attachment>
      <DialogContent className="h-[85vh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{filename}</DialogTitle>
          <DialogDescription>PDF 文件预览</DialogDescription>
        </DialogHeader>
        <iframe
          src={previewUrl}
          title={`${filename} 预览`}
          className="h-full min-h-0 w-full rounded-lg border bg-white"
        />
      </DialogContent>
    </Dialog>
  );
}

function EmptyChat({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <Empty className="m-auto max-w-2xl border-0 py-12">
      <EmptyHeader>
        <EmptyMedia className="size-12 rounded-2xl bg-primary text-primary-foreground">
          <Sparkles className="size-6" />
        </EmptyMedia>
        <EmptyTitle className="text-xl">今天想了解什么？</EmptyTitle>
        <EmptyDescription>
          直接提问，或者上传 PDF 后结合知识库获取更准确的回答。
        </EmptyDescription>
      </EmptyHeader>
      <div className="grid w-full gap-2 sm:grid-cols-3">
        {suggestions.map((suggestion, index) => (
          <Button
            key={suggestion}
            variant="outline"
            className="h-auto justify-start gap-2 whitespace-normal px-3 py-3 text-left"
            onClick={() => onSelect(suggestion)}
          >
            {index === 0 ? <FileSearch /> : <Lightbulb />}
            <span>{suggestion}</span>
          </Button>
        ))}
      </div>
    </Empty>
  );
}

function ChatMessage({
  message,
  isResponding = false,
}: {
  message: UIMessage;
  isResponding?: boolean;
}) {
  const isUser = message.role === "user";
  const content = getMessageContent(message);
  const attachments = message.parts.filter(
    (part): part is FileUIPart => part.type === "file",
  );

  if (isUser) {
    return (
      <Message align="end">
        <MessageContent className="w-auto max-w-[70%] items-end gap-2">
          {attachments.length > 0 && (
            <AttachmentGroup className="justify-end py-0">
              {attachments.map((part, index) => (
                <PdfAttachment key={`${part.url}-${index}`} part={part} />
              ))}
            </AttachmentGroup>
          )}
          {content && (
            <Bubble align="end" className="max-w-full">
              <BubbleContent className="whitespace-pre-wrap">
                {content}
              </BubbleContent>
            </Bubble>
          )}
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message className="gap-3">
      <MessageAvatar className="size-8 self-start bg-muted">
        <Sparkles className="size-4" />
      </MessageAvatar>
      <MessageContent className="max-w-none gap-0">
        <Bubble variant="ghost" className="w-full max-w-none">
          <BubbleContent className="min-h-8 w-full">
            {!content && isResponding ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Spinner /> 正在思考...
              </span>
            ) : (
              <MarkdownContent text={content} />
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

type HomeChatContentProps = {
  messages: UIMessage[];
  isResponding: boolean;
  hasOlderMessages: boolean;
  onLoadOlder: () => void;
  onSelect: (prompt: string) => void;
};

export function HomeChatContent({
  messages,
  isResponding,
  hasOlderMessages,
  onLoadOlder,
  onSelect,
}: HomeChatContentProps) {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller>
        <MessageScrollerViewport aria-label="聊天记录">
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
            {hasOlderMessages && (
              <div className="mb-4 flex justify-center">
                <Button size="sm" variant="ghost" onClick={onLoadOlder}>
                  加载更早消息
                </Button>
              </div>
            )}
            {messages.length === 0 ? (
              <EmptyChat onSelect={onSelect} />
            ) : (
              messages.map((message, index) => (
                <MessageScrollerItem key={message.id} messageId={message.id}>
                  <ChatMessage
                    message={message}
                    isResponding={
                      isResponding && index === messages.length - 1
                    }
                  />
                </MessageScrollerItem>
              ))
            )}
            {isResponding && messages.at(-1)?.role !== "assistant" && (
              <MessageScrollerItem scrollAnchor>
                <ChatMessage
                  message={{
                    id: "pending-assistant",
                    role: "assistant",
                    parts: [],
                  }}
                  isResponding
                />
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
