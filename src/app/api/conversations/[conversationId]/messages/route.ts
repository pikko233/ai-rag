import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server-session";
import {
  findOwnedConversation,
  listMessages,
} from "@/modules/home/server/conversations";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { conversationId } = await params;
  // 每次读取都校验归属，避免用户通过猜 ID 看到别人的对话。
  const ownedConversation = await findOwnedConversation(conversationId, user.id);
  if (!ownedConversation) {
    return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }

  const cursor = new URL(request.url).searchParams.get("cursor");
  return NextResponse.json(await listMessages(conversationId, cursor));
}

