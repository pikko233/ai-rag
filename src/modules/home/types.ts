import type { UIMessage } from "ai";

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type ConversationPage = {
  items: ConversationSummary[];
  nextCursor: string | null;
};

export type MessagePage = {
  items: UIMessage[];
  nextCursor: string | null;
};

