import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/request";
import { getCurrentUser } from "@/lib/server-session";
import {
  ingestRagDocument,
  RagIngestionError,
} from "@/modules/rag/server/documents";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({ fileId: z.string().uuid() });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const parsed = requestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "文件参数不正确" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await ingestRagDocument({ fileId: parsed.data.fileId, userId: user.id }),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof RagIngestionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "PDF 解析或向量化失败，请稍后重试" },
      { status: 500 },
    );
  }
}
