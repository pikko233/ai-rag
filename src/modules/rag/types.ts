export type RagDocumentStatus = "processing" | "ready" | "failed";

export type RagDocumentSummary = {
  id: string;
  fileId: string;
  filename: string;
  size: number;
  status: RagDocumentStatus;
  pageCount: number;
  chunkCount: number;
  error: string | null;
  createdAt: string;
};
