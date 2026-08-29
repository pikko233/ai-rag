import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const moduleUrl = (path: string) => new URL(path, import.meta.url).href;
const checksum = "a".repeat(64);
const file = {
  id: "file-1",
  userId: "user-1",
  objectKey: "users/user-1/attachments/file-1.pdf",
  filename: "说明.pdf",
  mimeType: "application/pdf",
  size: 1024,
  checksum,
};
let objectMetadata: {
  ContentLength?: number;
  ContentType?: string;
  Metadata?: Record<string, string>;
};
let savedStatus: string | undefined;

mock.module(moduleUrl("../../../db/index.ts"), {
  namedExports: {
    db: {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [file] }) }),
      }),
      update: () => ({
        set: (values: { status: string }) => ({
          where: async () => {
            savedStatus = values.status;
          },
        }),
      }),
    },
  },
});
mock.module(moduleUrl("../../../lib/server-session.ts"), {
  namedExports: { getCurrentUser: async () => ({ id: "user-1" }) },
});
mock.module(moduleUrl("../../../lib/storage.ts"), {
  namedExports: { readObjectMetadata: async () => objectMetadata },
});

beforeEach(() => {
  objectMetadata = {
    ContentLength: file.size,
    ContentType: file.mimeType,
    Metadata: { sha256: file.checksum },
  };
  savedStatus = undefined;
});

async function finalizeFile() {
  const { POST } = await import("./[fileId]/finalize/route");
  return POST(new Request("http://localhost"), {
    params: Promise.resolve({ fileId: file.id }),
  });
}

test("finalize 拒绝大小不一致的对象", async () => {
  objectMetadata.ContentLength = file.size + 1;

  const response = await finalizeFile();

  assert.equal(response.status, 400);
  assert.equal(savedStatus, "failed");
});

test("finalize 拒绝 MIME 不一致的对象", async () => {
  objectMetadata.ContentType = "text/plain";

  const response = await finalizeFile();

  assert.equal(response.status, 400);
  assert.equal(savedStatus, "failed");
});

test("finalize 拒绝 checksum 元数据不一致的对象", async () => {
  objectMetadata.Metadata = { sha256: "b".repeat(64) };

  const response = await finalizeFile();

  assert.equal(response.status, 400);
  assert.equal(savedStatus, "failed");
});
