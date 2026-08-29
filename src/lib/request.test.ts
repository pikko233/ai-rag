import assert from "node:assert/strict";
import test from "node:test";
import { readJsonBody } from "./request";

test("读取合法 JSON 请求体", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ message: "你好" }),
  });

  assert.deepEqual(await readJsonBody(request), { message: "你好" });
});

test("畸形 JSON 请求体返回 null", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: "{",
  });

  assert.equal(await readJsonBody(request), null);
});
