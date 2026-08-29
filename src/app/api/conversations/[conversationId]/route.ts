import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation } from "@/db/schema";
import { getCurrentUser } from "@/lib/server-session";
import { deleteChatAgentThread } from "@/modules/home/server/chat-agent";
import { findOwnedConversation } from "@/modules/home/server/conversations";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function DELETE(_: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { conversationId } = await params;
  const ownedConversation = await findOwnedConversation(conversationId, user.id);
  if (!ownedConversation) {
    return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }

  try {
    await deleteChatAgentThread(conversationId);
  } catch (error) {
    console.error("Failed to delete chat agent thread", error);
    return NextResponse.json(
      { error: "暂时无法删除对话，请稍后重试" },
      { status: 503 },
    );
  }

  // 删除条件包含用户 ID，确保无法通过猜测对话 ID 删除他人的数据。
  const deleted = await db
    .delete(conversation)
    .where(
      and(
        eq(conversation.id, conversationId),
        eq(conversation.userId, user.id),
      ),
    )
    .returning({ id: conversation.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
