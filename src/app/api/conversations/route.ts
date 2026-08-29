import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server-session";
import { listConversations } from "@/modules/home/server/conversations";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const cursor = new URL(request.url).searchParams.get("cursor");
  return NextResponse.json(await listConversations(user.id, cursor));
}
