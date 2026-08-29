import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { storedFile } from "@/db/schema";
import { getCurrentUser } from "@/lib/server-session";
import { createDownloadUrl } from "@/lib/storage";

type RouteContext = { params: Promise<{ fileId: string }> };

export async function GET(_: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { fileId } = await params;
  const [file] = await db
    .select()
    .from(storedFile)
    .where(
      and(
        eq(storedFile.id, fileId),
        eq(storedFile.userId, user.id),
        eq(storedFile.status, "uploaded"),
      ),
    )
    .limit(1);
  if (!file) return NextResponse.json({ error: "文件不存在" }, { status: 404 });

  return NextResponse.redirect(await createDownloadUrl(file.objectKey));
}

