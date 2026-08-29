import "server-only";

import type { UIMessage } from "ai";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { conversation, message } from "@/db/schema";
import type {
  ConversationPage,
  ConversationSummary,
  MessagePage,
} from "@/modules/home/types";

const PAGE_SIZE = 50;

function encodeConversationCursor(value: { updatedAt: Date; id: string }) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeConversationCursor(cursor: string) {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { updatedAt: string; id: string };
    const updatedAt = new Date(value.updatedAt);
    return Number.isNaN(updatedAt.valueOf()) ? null : { ...value, updatedAt };
  } catch {
    return null;
  }
}

function toSummary(row: typeof conversation.$inferSelect): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listConversations(
  userId: string,
  cursor?: string | null,
): Promise<ConversationPage> {
  const decoded = cursor ? decodeConversationCursor(cursor) : null;
  const rows = await db
    .select()
    .from(conversation)
    .where(
      and(
        eq(conversation.userId, userId),
        decoded
          ? or(
              lt(conversation.updatedAt, decoded.updatedAt),
              and(
                eq(conversation.updatedAt, decoded.updatedAt),
                lt(conversation.id, decoded.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(conversation.updatedAt), desc(conversation.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);
  const last = items.at(-1);

  return {
    items: items.map(toSummary),
    nextCursor:
      hasMore && last
        ? encodeConversationCursor({ updatedAt: last.updatedAt, id: last.id })
        : null,
  };
}

export async function findOwnedConversation(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createConversation(input: {
  id: string;
  userId: string;
  title: string;
}) {
  const [row] = await db
    .insert(conversation)
    .values(input)
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function listMessages(
  conversationId: string,
  cursor?: string | null,
): Promise<MessagePage> {
  const parsedCursor = cursor ? Number(cursor) : null;
  const rows = await db
    .select()
    .from(message)
    .where(
      and(
        eq(message.conversationId, conversationId),
        parsedCursor && Number.isSafeInteger(parsedCursor)
          ? lt(message.sequence, parsedCursor)
          : undefined,
      ),
    )
    .orderBy(desc(message.sequence))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  const oldest = page.at(-1);

  return {
    items: page.reverse().map((row) => ({
      id: row.id,
      role: row.role,
      parts: row.parts,
      metadata: { ...row.metadata, status: row.status },
    })) satisfies UIMessage[],
    nextCursor: hasMore && oldest ? String(oldest.sequence) : null,
  };
}
