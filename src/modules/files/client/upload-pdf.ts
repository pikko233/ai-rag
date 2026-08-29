import type { FileUIPart } from "ai";

const MAX_PDF_SIZE = 20 * 1024 * 1024;

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? "请求失败，请稍后重试";
}

export async function uploadPdf(
  file: File,
  onUploaded?: () => void,
): Promise<{ fileId: string; part: FileUIPart }> {
  if (file.type !== "application/pdf") throw new Error("仅支持 PDF 文件");
  if (file.size > MAX_PDF_SIZE) throw new Error("PDF 不能超过 20MB");

  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const checksum = Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");

  const presign = await fetch("/api/files/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: "application/pdf",
      size: file.size,
      checksum,
    }),
  });
  if (!presign.ok) throw new Error(await readError(presign));
  const upload = (await presign.json()) as {
    fileId: string;
    uploadUrl: string;
    headers: Record<string, string>;
  };

  const uploaded = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: upload.headers,
    body: bytes,
  });
  if (!uploaded.ok) throw new Error("PDF 上传失败");

  const finalized = await fetch(`/api/files/${upload.fileId}/finalize`, {
    method: "POST",
  });
  if (!finalized.ok) throw new Error(await readError(finalized));
  onUploaded?.();

  return {
    fileId: upload.fileId,
    part: {
      type: "file",
      mediaType: "application/pdf",
      filename: file.name,
      url: `file:${upload.fileId}`,
    },
  };
}
