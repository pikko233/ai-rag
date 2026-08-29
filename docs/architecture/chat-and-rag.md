# 对话持久化与 RAG 演进方案

## 当前已实现

当前版本先建立稳定的聊天产品数据层：

```text
AI SDK useChat
    │ 只发送本轮最新消息
    ▼
POST /api/chat
    ├── 校验登录用户和 conversation 归属
    ├── message 表保存用户消息与 assistant 占位
    ├── PostgresSaver 恢复 thread 短期记忆，过长时自动摘要
    ├── PostgresStore 语义召回跨对话用户记忆
    ├── pgvector 语义检索当前用户的 RAG chunks
    ├── 私有附件 ID 转换为短效签名 URL
    ├── 按实际命中结果动态构建 system prompt
    ├── OpenAI 流式生成
    └── 流结束后保存 assistant，响应完成后提取可复用长期记忆
```

- `conversation`：对话所有权、标题和排序时间。
- `message`：AI SDK `parts`、角色、生成状态、错误与顺序。
- `file`：私有对象的稳定引用；数据库和消息中不保存 base64。
- `/home`：首次发送立即更新到动态路由并显示 loading，再由 `/api/chat` 创建 conversation、保存消息并流式回复。
- `/home/[conversationId]`：历史对话页；对话和消息均使用游标分页。
- `message.id`：客户端生成并作为幂等键；assistant 使用确定性 ID，重复请求不会再次调用模型。

对象存储使用私有 S3 兼容桶。浏览器通过预签名 URL 直传 PDF，服务端随后使用 HEAD 请求核对大小、MIME 和 SHA-256 元数据。当前限制为单个 20MB 以内的 PDF。

## 数据职责

| 存储 | 权威数据 | 用途 |
| --- | --- | --- |
| Drizzle 业务表 | conversation、message、file | UI 历史、权限、审计、附件状态 |
| LangGraph PostgresSaver | graph state/checkpoints | 单个 thread 的短期记忆与恢复 |
| LangGraph PostgresStore | 用户级 memory 文档 | 跨对话长期记忆与语义召回 |
| pgvector 文档表 | chunk 与 embedding | RAG 知识库的相似度搜索 |

不要用 LangGraph checkpoint 表替代业务消息表。两者使用同一个关联键：

```text
conversation.id = LangGraph configurable.thread_id
```

## 当前记忆策略

1. `PostgresSaver` 的 `thread_id` 直接使用 `conversation.id`，自管表位于 `langgraph` schema。
2. API 每轮只向 `createAgent` 提交当前消息，由 `PostgresSaver` 自动恢复完整 thread state；超过 4000 tokens 时，由 summarization middleware 压缩较早消息并保留最近 20 条。
3. `PostgresStore` 以 `[userId, "memories"]` 为 namespace，自动提取用户明确陈述的稳定偏好和事实，并按语义召回。
4. 删除 conversation 时同步调用 `checkpointer.deleteThread(conversation.id)`；用户级长期记忆不会随单个对话删除。
5. 业务 `message` 表仍是 UI 和审计的权威数据，checkpoint 不替代它。
6. `npm run db:setup-memory` 负责创建或升级 LangGraph 自管表，运行时请求不执行数据库迁移。

## 当前 RAG 策略

1. PDF 按页解析并切块后，使用 `text-embedding-3-small` 写入 `rag_chunk.vector(1536)`。
2. 除简单问候外，用户消息会临时向量化，并只搜索 metadata 中 `userId` 匹配的 chunks；向量存储连接在进程内复用。
3. 只有高于 `RAG_MIN_SIMILARITY` 的结果才进入 `<knowledge>`；无命中时 system prompt 退化为通用 AI 助手。
4. 注入的片段保留文件名和页码，模型被要求在使用资料时标注来源。
5. 一次性聊天附件只参与当前 conversation，不自动进入长期知识库。

LangGraph checkpointer 与长期记忆的官方依据和具体选型见 [调研文档](../research/langgraph-memory.md)。
