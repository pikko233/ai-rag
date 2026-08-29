import "dotenv/config";

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { OpenAIEmbeddings } from "@langchain/openai";

const connectionString = process.env.DATABASE_URL;
const apiKey = process.env.OPENAI_KEY;

if (!connectionString || !apiKey) {
  throw new Error("缺少 DATABASE_URL 或 OPENAI_KEY");
}

const checkpointer = PostgresSaver.fromConnString(connectionString, {
  schema: "langgraph",
});
const store = PostgresStore.fromConnString(connectionString, {
  schema: "langgraph",
  index: {
    dims: 1536,
    embed: new OpenAIEmbeddings({
      apiKey,
      model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      dimensions: 1536,
    }),
    fields: ["text"],
    indexType: "hnsw",
    distanceMetric: "cosine",
  },
});

try {
  // 迁移只在部署时执行，聊天请求不再重复检查数据库结构。
  await Promise.all([checkpointer.setup(), store.setup()]);
  console.log("LangGraph memory tables are ready.");
} finally {
  await Promise.all([checkpointer.end(), store.stop()]);
}
