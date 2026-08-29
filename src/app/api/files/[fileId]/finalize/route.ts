import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { storedFile } from "@/db/schema";
import { getCurrentUser } from "@/lib/server-session";
import { readObjectMetadata } from "@/lib/storage";

type RouteContext = { params: Promise<{ fileId: string }> };

export async function POST(_: Request, { params }: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { fileId } = await params;
  const [file] = await db
    .select()
    .from(storedFile)
    .where(and(eq(storedFile.id, fileId), eq(storedFile.userId, user.id)))
    .limit(1);
  if (!file) return NextResponse.json({ error: "文件不存在" }, { status: 404 });

  const metadata = await readObjectMetadata(file.objectKey);
  const checksum = metadata.Metadata?.sha256?.toLowerCase();
  const isValid =
    metadata.ContentLength === file.size &&
    metadata.ContentType === "application/pdf" &&
    checksum === file.checksum;

  // 预签名上传不经过应用服务器，因此这里必须再次核对对象信息。
  if (!isValid) {
    await db
      .update(storedFile)
      .set({ status: "failed" })
      .where(eq(storedFile.id, file.id));
    return NextResponse.json({ error: "文件校验失败" }, { status: 400 });
  }

  await db
    .update(storedFile)
    .set({ status: "uploaded" })
    .where(eq(storedFile.id, file.id));

  return NextResponse.json({
    id: file.id,
    filename: file.filename,
    mimeType: file.mimeType,
    size: file.size,
  });
}

