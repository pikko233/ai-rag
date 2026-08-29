import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { storedFile } from "@/db/schema";
import { readJsonBody } from "@/lib/request";
import { getCurrentUser } from "@/lib/server-session";
import { createUploadUrl } from "@/lib/storage";

const MAX_PDF_SIZE = 20 * 1024 * 1024;
const requestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.literal("application/pdf"),
  size: z.number().int().positive().max(MAX_PDF_SIZE),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const parsed = requestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "仅支持 20MB 以内的 PDF 文件" },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const objectKey = `users/${user.id}/attachments/${id}.pdf`;
  const uploadUrl = await createUploadUrl({
    objectKey,
    contentType: parsed.data.mimeType,
    checksum: parsed.data.checksum,
  });

  await db.insert(storedFile).values({
    id,
    userId: user.id,
    objectKey,
    filename: parsed.data.filename,
    mimeType: parsed.data.mimeType,
    size: parsed.data.size,
    checksum: parsed.data.checksum.toLowerCase(),
  });

  return NextResponse.json(
    {
      fileId: id,
      uploadUrl,
      headers: {
        "Content-Type": parsed.data.mimeType,
        "x-amz-meta-sha256": parsed.data.checksum.toLowerCase(),
      },
    },
    { status: 201 },
  );
}
