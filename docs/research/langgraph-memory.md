# LangGraph checkpointer 与记忆机制调研

调研日期：2026-08-28  
范围：LangChain / LangGraph JavaScript/TypeScript 官方文档、官方源码与官方 npm 包说明。

## 结论

1. **checkpointer 正是 LangGraph 用来实现短期记忆的机制。** 它把 agent/graph 的状态按 `thread_id` 分组，并在每个 graph step 完成时保存 checkpoint。后续请求复用相同 `thread_id`，LangGraph 会恢复该线程的状态，因此可以继续使用之前的 `messages`。
2. **checkpointer 不会自动裁剪或摘要历史。** 它负责保存和恢复状态；长上下文治理需要显式使用 `trimMessages`、自定义 middleware、删除消息，或 `summarizationMiddleware`。
3. **PostgresSaver 适合本项目的 Next.js/TypeScript 服务端，但应限定在 Node.js runtime。** 官方将它列为生产环境 checkpointer；它使用 `pg` 的 TCP/TLS 连接，标准 Node.js 可直接使用，Edge/Cloudflare Workers 则有运行时限制。
4. **不建议用 checkpoint 表取代本项目的 `conversation` / `message` 业务表。** checkpoint 是 LangGraph 的执行状态和恢复日志，不是面向聊天产品查询、权限、标题、附件、消息状态与审计的数据模型。这一点是基于官方定义和存储接口得出的架构判断。
5. **长期记忆使用 Store，不使用 checkpointer。** Store 保存跨 thread 的 JSON 文档，并可通过 embeddings 做语义搜索；checkpointer 只负责单个 thread 内的短期状态。

## 1. checkpointer 如何管理短期记忆

LangChain 官方把短期记忆定义为“单个 thread / conversation 内的历史”。创建 agent 时传入 `checkpointer`，调用时传入 `configurable.thread_id`：

```ts
const agent = createAgent({
  model,
  tools,
  checkpointer,
});

await agent.invoke(
  { messages: [{ role: "user", content: "Hi" }] },
  { configurable: { thread_id: conversationId } },
);
```

状态会在 agent 被调用或 graph step 完成时更新，并在每个 step 开始时读取。复用相同 `thread_id` 就会恢复同一段对话的状态；换一个 `thread_id` 就是新的短期记忆空间。

来源：

- [LangChain JS: Short-term memory](https://docs.langchain.com/oss/javascript/langchain/short-term-memory)
- [LangGraph JS: Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph.js 官方源码文档：checkpoint 基础接口](https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint/README.md)

## 2. `thread_id`、checkpoint、state、messages 的关系

关系可以理解为：

```text
conversation.id
      │ 可直接映射
      ▼
thread_id
      └── checkpoint 1  ── state snapshot
          checkpoint 2  ── state snapshot
          checkpoint 3  ── state snapshot（latest）
                                  └── values.messages
```

- **`thread_id`**：由应用提供的线程标识，是 checkpoint 的分组键。它代表一系列 graph runs 的累计状态，而不是一条消息。PostgresSaver 的 `thread_id` 应控制在 255 字符以内，UUID 很合适。
- **checkpoint**：某个 super-step 边界上的 graph state 快照。同一次用户问答可能产生多个 checkpoint，例如输入、模型节点、工具节点各自完成后都可能产生快照。因此 checkpoint 与 message 不是一对一关系。
- **state / `StateSnapshot.values`**：checkpoint 恢复出来的 graph 状态。除 `messages` 外，还可包含用户 ID、摘要、工具中间结果或其他自定义字段。
- **`messages`**：只是 state 的一个 channel。使用 LangChain agent 或 `MessagesValue` / message reducer 时，新消息会合并到该 channel；后续使用同一 `thread_id` 时，agent 能读取累计消息历史。
- **`checkpoint_id`**：thread 内某个具体快照的版本标识。省略时读取最新状态；指定后可查看或从历史点继续执行。checkpoint 还记录父 checkpoint，因此支持 state history、time travel 和恢复。

官方 `StateSnapshot` 还包括 `next`、`metadata`、`createdAt`、`parentConfig` 和 `tasks`；这再次说明 checkpoint 是执行引擎状态，不只是聊天消息。

来源：

- [LangGraph JS: Persistence — threads、checkpoints 与 StateSnapshot](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph JS: Functional API — 查看 thread state](https://docs.langchain.com/oss/javascript/langgraph/use-functional-api)
- [LangGraph.js 官方源码：BaseCheckpointSaver](https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint/src/base.ts)

## 3. PostgresSaver 是否适合 Next.js / TypeScript

**适合，但仅放在服务端 Node.js runtime，并注意连接与初始化生命周期。**

有利条件：

- `@langchain/langgraph-checkpoint-postgres` 是官方 TypeScript 包，官方将 PostgresSaver 定位为生产用途。
- 它可由 PostgreSQL connection string 创建，也支持接收现有的 `pg.Pool`。
- 当前项目已经使用 PostgreSQL 和 `pg`，技术栈匹配。
- 可以通过 `{ schema: "langgraph" }` 把 LangGraph 自管表隔离到单独 schema，避免和 Drizzle 业务表混在一起。

约束：

- 第一次使用必须执行 `checkpointer.setup()` 创建/迁移自管表。官方建议把数据库 migrations 作为独立部署步骤或服务启动步骤，不要在每个 API 请求中重复执行。
- PostgresSaver 底层使用 `node-postgres`，依赖 Node 的 TCP/TLS。Next.js Route Handler 应显式或实际运行在 Node.js runtime；不要把这条链路放到 Edge runtime。
- LangGraph 会在 `invoke()` 返回前或 graph stream 被完整消费后等待 checkpoint 写入完成。若启动 stream 后没有完整消费，就可能遗留未完成的持久化工作。
- 长会话会积累 checkpoints，应设计 retention / pruning 策略。

来源：

- [官方 npm 包：@langchain/langgraph-checkpoint-postgres](https://www.npmjs.com/package/@langchain/langgraph-checkpoint-postgres)
- [LangChain JS: Short-term memory — production PostgresSaver](https://docs.langchain.com/oss/javascript/langchain/short-term-memory#in-production)
- [LangGraph JS: Persistence — 生产后端与 checkpoint retention](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph JS: Memory — 数据库 setup/migrations 建议](https://docs.langchain.com/oss/javascript/langgraph/add-memory#database-management)

## 4. 它是否替代应用自己的 `conversation` / `message` 表

### 官方事实

checkpointer 的公开职责是：

- `put`：写 graph checkpoint；
- `putWrites`：写 graph step 的中间结果；
- `getTuple`：按 thread/checkpoint 恢复状态；
- `list`：列 checkpoint 历史；
- `deleteThread`：删除一个 thread 的 checkpoints/writes。

Postgres 后端的实际数据是序列化的 graph state、checkpoint metadata、channel blobs 和 pending writes。它不是以“一行一条产品消息”的形式提供稳定业务查询接口。

来源：

- [LangGraph JS: Checkpointer interface](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph.js 官方源码：checkpoint README](https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint/README.md)
- [LangGraph.js 官方源码：BaseCheckpointSaver](https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint/src/base.ts)

### 对本项目的架构判断（明确属于推论）

**保留 `conversation` 与 `message` 业务表，同时引入 PostgresSaver；两者职责不同。**

| 数据层 | 应负责 | 不应负责 |
| --- | --- | --- |
| `conversation` | 用户所有权、标题、创建/更新时间、归档/删除状态、对话列表 | graph step 恢复、pending tool writes |
| `message` | UI 历史、role、AI SDK parts、附件引用、生成状态、错误状态、引用来源、审计 | LangGraph time travel、node state |
| PostgresSaver | thread 内 graph state、短期记忆、工具执行恢复、interrupt、time travel | 产品对话列表、用户权限与可检索消息 API |

推荐直接使用 `conversation.id` 作为 LangGraph `thread_id`。删除对话时，在同一应用流程里：

1. 校验 `conversation.userId`；
2. 删除业务 conversation/messages；
3. 调用 `checkpointer.deleteThread(conversation.id)` 清理 LangGraph 状态。

需要避免的设计是把两个存储层都当成同一份聊天历史的权威来源。推荐：

- **产品展示与审计的 source of truth：`message` 表**；
- **agent 下一步执行的 source of truth：checkpointer 中的 graph state**；
- 用同一个 `conversation.id` / `thread_id` 关联；
- assistant 流式响应完成后再把最终消息写入业务表，失败或取消时写明确状态；
- 若发生写入失败，提供可重试/对账机制，而不是直接查询 LangGraph 的内部表拼 UI。

对于只有最简单聊天、无需对话列表/标题/权限/附件/消息状态的 demo，checkpoint state 可以独自保存消息；但不满足当前产品需求。

## 5. 长期记忆 Store 与 checkpointer 的区别

| 维度 | Checkpointer | Store |
| --- | --- | --- |
| 保存内容 | graph state snapshots | 应用定义的 JSON documents |
| 范围 | 单个 `thread_id` | 跨 threads |
| 典型用途 | 对话连续性、恢复、interrupt、time travel | 用户偏好、事实、经验、规则、共享知识 |
| 定位方式 | `thread_id` + 可选 `checkpoint_id` | `namespace[]` + `key` |
| 语义搜索 | 不是其职责 | 可配置 embeddings 后使用 `search(query)` |

长期记忆可以按用户隔离，例如：

```ts
const namespace = [userId, "memories"];
await store.put(namespace, memoryId, { text: "用户喜欢简短回答" });
await store.search(namespace, { query: latestUserText, limit: 3 });
```

`PostgresStore` 可以和 `PostgresSaver` 使用同一个 PostgreSQL 实例，但二者仍是两个独立接口和存储职责。Store 支持 embeddings 索引和按语义相似度搜索，这更接近长期记忆召回；checkpointer 本身不做跨对话召回。

来源：

- [LangGraph JS: Persistence — Checkpointer vs. Store](https://docs.langchain.com/oss/javascript/langgraph/persistence#checkpointer-vs-store)
- [LangChain JS: Long-term memory](https://docs.langchain.com/oss/javascript/langchain/long-term-memory)
- [LangGraph JS: Add memory — semantic search](https://docs.langchain.com/oss/javascript/langgraph/add-memory#use-semantic-search)
- [LangGraph.js 官方源码：PostgresStore](https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint-postgres/src/store/index.ts)

## 6. checkpointer 是否自动裁剪或摘要上下文

**不会。** Checkpointer 默认会持久化 thread state；对话变长后，消息仍可能超过模型上下文、增加成本并降低效果。官方把以下能力列为需要应用显式选择的策略：

- `trimMessages` 或 `beforeModel` middleware：按 token / 边界保留最近消息；
- `RemoveMessage`：从 graph state 永久删除消息；
- `summarizationMiddleware`：到达 token 阈值后调用模型总结旧消息，并保留指定数量的近期消息；
- 自定义过滤策略。

例如官方的摘要配置是显式挂载 middleware：

```ts
summarizationMiddleware({
  model: summaryModel,
  trigger: { tokens: 4000 },
  keep: { messages: 20 },
})
```

因此，对 Q12 更准确的方案是：

> 使用 PostgresSaver 管理 thread 级短期状态；同时显式配置 token-aware 的 trimming 或 summarization middleware。Checkpointer 解决“保存和恢复”，middleware 解决“哪些历史进入模型上下文”。

来源：

- [LangChain JS: Short-term memory — common patterns](https://docs.langchain.com/oss/javascript/langchain/short-term-memory#common-patterns)
- [LangChain JS: Short-term memory — summarize messages](https://docs.langchain.com/oss/javascript/langchain/short-term-memory#summarize-messages)

## 对 Q11 / Q12 的推荐修订

### Q11：AI SDK 与 LangChain/LangGraph 的边界

若要真正采用 checkpointer，聊天的 agent 执行与短期状态应进入 LangChain/LangGraph；前端仍可保留 AI SDK 的 `useChat` 和 UI message 协议。也就是说：

- AI SDK：React 聊天 UI、请求/流式传输协议；
- LangChain/LangGraph：模型节点、retriever/tools、checkpointer、Store、memory middleware；
- 业务数据库：conversation/message、用户权限、附件和产品查询。

不建议一边让 AI SDK 直接调用模型、一边期望 LangGraph checkpointer 自动接管历史；checkpointer 只有在模型调用实际位于 graph/agent 执行链路中时才会保存并恢复对应 state。

### Q12：短期记忆策略

推荐组合：

1. `conversation.id === thread_id`；
2. `PostgresSaver` 保存完整可恢复 graph state；
3. `summarizationMiddleware` 达到 token 阈值时生成滚动摘要，并保留最近若干完整消息；
4. 对极端单条大消息再加 `trimMessages` / 输入大小限制作为兜底；
5. 业务 `message` 表仍保留完整原始历史，不因 agent 上下文摘要而丢失产品记录。

这比固定“最近 N 条”更稳健，也比把 `conversation.summary` 当成唯一短期记忆更贴合 LangGraph 官方机制。
