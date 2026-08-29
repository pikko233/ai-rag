"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileText,
  Layers3,
  LoaderCircle,
  UploadCloud,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { uploadPdf } from "@/modules/files/client/upload-pdf";
import type { RagDocumentSummary } from "@/modules/rag/types";

type UploadStage = "idle" | "uploading" | "processing";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusBadge(document: RagDocumentSummary) {
  if (document.status === "ready") {
    return (
      <Badge variant="secondary">
        <CheckCircle2 data-icon="inline-start" /> 已完成
      </Badge>
    );
  }
  if (document.status === "failed") {
    return (
      <Badge variant="destructive">
        <AlertCircle data-icon="inline-start" /> 失败
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <LoaderCircle className="animate-spin" data-icon="inline-start" />
      处理中
    </Badge>
  );
}

export function RagView({
  initialDocuments,
}: {
  initialDocuments: RagDocumentSummary[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [error, setError] = useState<string | null>(null);

  const readyDocuments = documents.filter(
    (document) => document.status === "ready",
  );
  const totalChunks = readyDocuments.reduce(
    (total, document) => total + document.chunkCount,
    0,
  );

  const chooseFile = (file?: File) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      setSelectedFile(null);
      setError("仅支持 PDF 文件");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setSelectedFile(null);
      setError("PDF 不能超过 20MB");
      return;
    }
    setSelectedFile(file);
    setError(null);
  };

  const ingestDocument = async () => {
    if (!selectedFile || stage !== "idle") return;
    setStage("uploading");
    setError(null);

    try {
      const uploaded = await uploadPdf(selectedFile, () =>
        setStage("processing"),
      );
      const response = await fetch("/api/rag/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: uploaded.fileId }),
      });
      const body = (await response.json().catch(() => null)) as
        | RagDocumentSummary
        | { error?: string }
        | null;
      if (!response.ok || !body || !("id" in body)) {
        throw new Error(
          body && "error" in body && body.error
            ? body.error
            : "文档处理失败，请稍后重试",
        );
      }

      setDocuments((current) => [
        body,
        ...current.filter((document) => document.id !== body.id),
      ]);
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "文档处理失败");
    } finally {
      setStage("idle");
    }
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">RAG 文档</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            上传 PDF 后自动解析、切分并向量化，用于后续语义检索和问答。
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>可检索文档</CardTitle>
              <CardDescription>已完成向量化的 PDF 数量</CardDescription>
              <CardAction className="rounded-lg bg-primary/10 p-2 text-primary">
                <Database className="size-5" />
              </CardAction>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">
              {readyDocuments.length}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>文本切块</CardTitle>
              <CardDescription>存入 pgvector 的内容片段</CardDescription>
              <CardAction className="rounded-lg bg-primary/10 p-2 text-primary">
                <Layers3 className="size-5" />
              </CardAction>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">
              {totalChunks}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>上传 PDF</CardTitle>
            <CardDescription>
              单个文件最大 20MB，文字型 PDF 的检索效果最佳。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <button
              type="button"
              disabled={stage !== "idle"}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                chooseFile(event.dataTransfer.files[0]);
              }}
            >
              <span className="rounded-full bg-primary/10 p-3 text-primary">
                <UploadCloud className="size-6" />
              </span>
              <span>
                <span className="font-medium">点击选择或拖入 PDF</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  文件会保存到私有对象存储
                </span>
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />

            {selectedFile && (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <FileText className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(selectedFile.size)}
                  </p>
                </div>
                {stage === "idle" && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="移除文件"
                    onClick={() => {
                      setSelectedFile(null);
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                  >
                    <X />
                  </Button>
                )}
              </div>
            )}

            {stage !== "idle" && (
              <Progress value={stage === "uploading" ? 35 : 75}>
                <ProgressLabel>
                  {stage === "uploading"
                    ? "正在上传 PDF..."
                    : "正在解析、切分并生成向量..."}
                </ProgressLabel>
              </Progress>
            )}
            {error && (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="size-4" /> {error}
              </p>
            )}
            <Button
              className="w-full sm:w-auto"
              disabled={!selectedFile || stage !== "idle"}
              onClick={ingestDocument}
            >
              {stage === "idle" ? (
                <UploadCloud />
              ) : (
                <LoaderCircle className="animate-spin" />
              )}
              {stage === "idle" ? "上传并向量化" : "正在处理"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>文档列表</CardTitle>
            <CardDescription>已上传到当前知识库的 PDF</CardDescription>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <FileText className="size-8" />
                <p className="text-sm">还没有文档，上传第一份 PDF 吧。</p>
              </div>
            ) : (
              <div className="divide-y">
                {documents.map((document) => (
                  <div
                    key={document.id}
                    className="flex items-center gap-3 py-4 first:pt-0 last:pb-0"
                  >
                    <span className="rounded-lg bg-muted p-2">
                      <FileText className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {document.filename}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatBytes(document.size)} · {document.pageCount} 页 ·{" "}
                        {document.chunkCount} 个切块
                      </p>
                      {document.error && (
                        <p className="mt-1 truncate text-xs text-destructive">
                          {document.error}
                        </p>
                      )}
                    </div>
                    {statusBadge(document)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
