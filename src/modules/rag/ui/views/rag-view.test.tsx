import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RagView } from "./rag-view";

test("展示已向量化文档和切块统计", () => {
  const markup = renderToStaticMarkup(
    <RagView
      initialDocuments={[
        {
          id: "document-1",
          fileId: "file-1",
          filename: "产品手册.pdf",
          size: 2048,
          status: "ready",
          pageCount: 12,
          chunkCount: 36,
          error: null,
          createdAt: "2026-08-28T00:00:00.000Z",
        },
      ]}
    />,
  );

  assert.match(markup, /产品手册\.pdf/);
  assert.match(markup, /12 页/);
  assert.match(markup, /36 个切块/);
  assert.match(markup, /上传并向量化/);
});
