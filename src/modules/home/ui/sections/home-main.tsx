"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMemo, useState } from "react";
import type {
  ConversationSummary,
  MessagePage,
} from "@/modules/home/types";
import { uploadPdf } from "@/modules/files/client/upload-pdf";
import { HomeChatComposer } from "./home-chat-composer";
import { HomeChatContent } from "./home-chat-content";

type HomeMainProps = {
  conversationId?: string;
  initialMessages?: UIMessage[];
  initialMessageCursor?: string | null;
};

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? "请求失败，请稍后重试";
}

export const HomeMain = ({
  conversationId,
  initialMessages = [],
  initialMessageCursor = null,
}: HomeMainProps) => {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            conversationId: body?.conversationId,
            createConversation: body?.createConversation,
            title: body?.title,
            message: messages.at(-1),
          },
        }),
      }),
    [],
  );
  const { messages, sendMessage, setMessages, status, error, clearError } =
    useChat({
      id: conversationId ?? "new-conversation",
      messages: initialMessages,
      transport,
    });
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [newConversationId, setNewConversationId] = useState<string>();
  const [isConversationCreated, setIsConversationCreated] = useState(
    Boolean(conversationId),
  );
  const activeConversationId = conversationId ?? newConversationId;
  const [messageCursor, setMessageCursor] = useState(initialMessageCursor);
  const [localError, setLocalError] = useState<string | null>(null);
  const isResponding =
    isPreparing || status === "submitted" || status === "streaming";
  const isAwaitingAssistant = status === "submitted" || status === "streaming";

  const submitMessage = async (suggestedPrompt?: string) => {
    const prompt =
      suggestedPrompt ??
      (input.trim() ||
        (selectedFile ? `请分析文档：${selectedFile.name}` : ""));
    if (!prompt || isResponding) return;

    setIsPreparing(true);
    setLocalError(null);
    clearError();
    let pendingConversationId: string | undefined;
    try {
      const files = selectedFile
        ? [(await uploadPdf(selectedFile)).part]
        : undefined;

      setInput("");
      setSelectedFile(null);

      const shouldCreateConversation = !isConversationCreated;
      const targetConversationId =
        activeConversationId ?? crypto.randomUUID();

      if (shouldCreateConversation) {
        pendingConversationId = targetConversationId;
        const created: ConversationSummary = {
          id: targetConversationId,
          title: prompt.slice(0, 40),
          updatedAt: new Date().toISOString(),
        };
        setNewConversationId(targetConversationId);
        // 先同步 URL 和侧栏，再让较慢的数据库请求在后台继续。
        window.history.replaceState(null, "", `/home/${targetConversationId}`);
        window.dispatchEvent(
          new CustomEvent<ConversationSummary>("conversation-created", {
            detail: created,
          }),
        );
      }

      setIsPreparing(false);
      await sendMessage(
        { text: prompt, files },
        {
          body: {
            conversationId: targetConversationId,
            createConversation: shouldCreateConversation,
            title: prompt.slice(0, 40),
          },
        },
      );
      setIsConversationCreated(true);
    } catch (caught) {
      if (pendingConversationId) {
        window.history.replaceState(null, "", "/home");
        window.dispatchEvent(
          new CustomEvent<string>("conversation-creation-failed", {
            detail: pendingConversationId,
          }),
        );
      }
      setLocalError(caught instanceof Error ? caught.message : "发送失败");
    } finally {
      setIsPreparing(false);
    }
  };

  const loadOlderMessages = async () => {
    if (!activeConversationId || !messageCursor) return;
    const response = await fetch(
      `/api/conversations/${activeConversationId}/messages?cursor=${encodeURIComponent(messageCursor)}`,
    );
    if (!response.ok) {
      setLocalError(await readError(response));
      return;
    }
    const page = (await response.json()) as MessagePage;
    setMessages((current) => [...page.items, ...current]);
    setMessageCursor(page.nextCursor);
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <HomeChatContent
        messages={messages}
        isResponding={isAwaitingAssistant}
        hasOlderMessages={Boolean(messageCursor)}
        onLoadOlder={loadOlderMessages}
        onSelect={submitMessage}
      />

      <div className="border-t bg-background/95 px-4 py-3 backdrop-blur">
        <HomeChatComposer
          input={input}
          isResponding={isResponding}
          error={localError ?? error?.message ?? null}
          selectedFile={selectedFile}
          onFileChange={setSelectedFile}
          onInputChange={setInput}
          onSend={() => submitMessage()}
        />
      </div>
    </main>
  );
};
