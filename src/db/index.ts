import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const globalForDb = globalThis as typeof globalThis & {
  aiRagDbPool?: Pool;
};

const pool =
  globalForDb.aiRagDbPool ??
  new Pool({ connectionString: process.env.DATABASE_URL! });

// Next.js 开发热更新会重复加载模块，复用连接池可避免再次建立 TLS 连接。
if (process.env.NODE_ENV !== "production") globalForDb.aiRagDbPool = pool;

export const db = drizzle({ client: pool, schema });
