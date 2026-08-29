<h1 align="center">
  <img src="public/icons/single-logo.svg" alt="AI RAG Logo" width="48" />
  <br>
  AI-RAG
</h1>

<p align="center">
  一个面向中文场景的私有 AI 对话与 RAG 应用，支持流式聊天、对话持久化、跨对话长期记忆、PDF 知识库与语义检索。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.1-black?logo=next.js" alt="Next.js 16.1" />
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?logo=react&amp;logoColor=black" alt="React 19.2" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&amp;logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&amp;logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/LangGraph-1.4-1C3C3C" alt="LangGraph 1.4" />
  <img src="https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&amp;logoColor=white" alt="PostgreSQL with pgvector" />
</p>

## 项目简介

AI RAG 将聊天产品所需的业务数据、Agent 记忆和知识库检索分开管理：

- Drizzle 业务表保存对话、消息、文件及其所有权，是 UI 历史和审计的权威数据源。
- LangGraph `PostgresSaver` 按对话恢复短期上下文，并在上下文过长时自动摘要。
- LangGraph `PostgresStore` 保存用户明确表达的稳定偏好，实现跨对话语义记忆。
- pgvector 保存 PDF 切块和 embedding，只检索当前登录用户的知识库内容。
- 私有 S3 兼容对象存储保存 PDF；数据库和消息中只保留稳定文件引用。

## 功能特性

- **流式 AI 对话**：基于 AI SDK 和 LangGraph Agent，逐步返回模型回答。
- **对话持久化**：保存用户消息、Assistant 回答、生成状态和错误信息。
- **消息幂等**：客户端消息 ID 作为幂等键，重复请求不会再次调用模型。
- **短期记忆**：按 `conversation.id` 恢复 LangGraph checkpoint，超过 4,000 tokens 时自动摘要。
- **长期记忆**：提取用户明确陈述的稳定事实与偏好，并在后续对话中按语义召回。
- **PDF 附件**：浏览器通过预签名 URL 直传私有对象存储，单个文件最大 20MB。
- **RAG 知识库**：按页解析 PDF、切分文本、生成 embedding，并通过 pgvector 相似度检索。
- **权限隔离**：对话、附件、长期记忆和 RAG chunks 均按当前登录用户隔离。
- **历史记录**：对话列表和历史消息均支持游标分页。
- **Google 登录**：使用 Better Auth 管理 OAuth 登录和 Session。
- **Markdown 展示**：支持 GFM、数学公式和代码高亮。
- **深色模式与响应式布局**：基于 Tailwind CSS 和 shadcn/ui。

## 工作流程

```text
浏览器
  ├── Google OAuth ───────────────> Better Auth
  ├── PDF 预签名直传 ─────────────> 私有 S3 兼容对象存储
  └── POST /api/chat
        ├── 校验用户与对话归属
        ├── 保存用户消息与 Assistant 占位
        ├── 恢复 LangGraph 短期记忆
        ├── 召回用户长期记忆
        ├── 检索当前用户的 RAG chunks
        ├── 将私有文件 ID 转为短效下载 URL
        ├── 流式生成回答
        └── 保存完整回答并异步提取长期记忆
```

## 技术栈

| 分类     | 技术                                                           |
| -------- | -------------------------------------------------------------- |
| Web      | Next.js 16、React 19、TypeScript 5                             |
| UI       | Tailwind CSS 4、shadcn/ui、Base UI、Lucide                     |
| AI       | AI SDK 7、LangChain、LangGraph、OpenAI                         |
| 数据库   | PostgreSQL、Drizzle ORM、pgvector                              |
| 认证     | Better Auth、Google OAuth                                      |
| 对象存储 | AWS SDK、Cloudflare R2                                         |
| 文档处理 | pdf-parse、LangChain PDFLoader、RecursiveCharacterTextSplitter |
| 内容渲染 | react-markdown、GFM、KaTeX、Prism                              |
| 测试     | Node.js Test Runner、tsx                                       |

## 快速开始

### 环境要求

- Node.js 22 或更高版本
- PostgreSQL，并已允许安装 `vector` 扩展
- OpenAI API Key
- Google OAuth 应用
- Cloudflare R2 或其他 S3 兼容的私有对象存储

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 并补全配置：

| 变量                     | 必需 | 说明                                                    |
| ------------------------ | ---- | ------------------------------------------------------- |
| `DATABASE_URL`           | 是   | PostgreSQL 连接地址                                     |
| `BETTER_AUTH_SECRET`     | 是   | Better Auth 签名密钥                                    |
| `BETTER_AUTH_URL`        | 是   | 应用公开地址，本地默认为 `http://localhost:3000`        |
| `GOOGLE_CLIENT_ID`       | 是   | Google OAuth Client ID                                  |
| `GOOGLE_CLIENT_SECRET`   | 是   | Google OAuth Client Secret                              |
| `OPENAI_KEY`             | 是   | OpenAI API Key                                          |
| `OPENAI_MODEL`           | 否   | 聊天模型，默认 `gpt-5.6-luna`                           |
| `OPENAI_MEMORY_MODEL`    | 否   | 长期记忆提取模型，默认复用聊天模型                      |
| `OPENAI_EMBEDDING_MODEL` | 否   | Embedding 模型，默认 `text-embedding-3-small`           |
| `RAG_MIN_SIMILARITY`     | 否   | RAG 最低相似度，示例配置为 `0.65`，未设置时回退到 `0.7` |
| `MEMORY_MIN_SIMILARITY`  | 否   | 长期记忆最低相似度，默认 `0.65`                         |
| `S3_ENDPOINT`            | 是   | S3 兼容服务 Endpoint                                    |
| `S3_REGION`              | 否   | 对象存储 Region，默认 `auto`                            |
| `S3_BUCKET`              | 是   | 私有 Bucket 名称                                        |
| `S3_ACCESS_KEY_ID`       | 是   | 对象存储 Access Key                                     |
| `S3_SECRET_ACCESS_KEY`   | 是   | 对象存储 Secret Key                                     |
| `S3_FORCE_PATH_STYLE`    | 否   | 是否使用 path-style URL，默认 `false`                   |

> `text-embedding-3-small` 使用 1,536 维向量。若更换 embedding 模型，需要同步调整数据库向量维度和 LangGraph Store 配置。

### 3. 初始化数据库

```bash
npm run db:migrate
npm run db:setup-memory
```

两个命令职责不同：

- `db:migrate` 创建或升级业务表、RAG 表及 pgvector 索引。
- `db:setup-memory` 创建或升级 LangGraph checkpoint 与长期记忆表。

`db:setup-memory` 可以重复执行，但只应在本地初始化或部署阶段运行，不应放入聊天请求路径。

### 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)。

## 常用命令

| 命令                      | 说明                         |
| ------------------------- | ---------------------------- |
| `npm run dev`             | 启动 Next.js 开发服务器      |
| `npm run build`           | 创建生产构建                 |
| `npm start`               | 启动生产服务器               |
| `npm test`                | 运行全部测试                 |
| `npm run lint`            | 运行 ESLint                  |
| `npm run db:generate`     | 根据 Drizzle Schema 生成迁移 |
| `npm run db:migrate`      | 执行 Drizzle 数据库迁移      |
| `npm run db:setup-memory` | 初始化 LangGraph 记忆表      |

## 项目结构

```text
src/
├── app/
│   ├── (private)/             # 需要登录的聊天与 RAG 页面
│   ├── (public)/              # 登录页面
│   └── api/                   # Auth、聊天、对话、文件和 RAG API
├── components/                # 通用组件与 UI 基础组件
├── db/                        # Drizzle 连接、Schema 与关系
├── lib/                       # Auth、Session、对象存储等基础能力
└── modules/
    ├── auth/                  # 登录 UI
    ├── files/                 # PDF 上传客户端
    ├── home/                  # 聊天 Agent、对话服务与聊天 UI
    └── rag/                   # PDF 导入、向量检索与知识库 UI

drizzle/                       # PostgreSQL 迁移与快照
docs/                          # 架构说明和技术调研
scripts/                       # 部署与初始化脚本
```

## 数据与安全边界

- 所有业务查询都使用当前 Session 的 `user.id` 校验数据归属。
- RAG 检索通过 metadata 中的 `userId` 过滤候选 chunks。
- 长期记忆使用 `[userId, "memories"]` 作为 namespace。
- PDF Bucket 必须保持私有；浏览器只获得短效的上传或下载签名 URL。
- 服务端在直传完成后通过 HEAD 请求核对对象大小、MIME 和 SHA-256 元数据。
- 删除对话时会先清理对应 LangGraph thread，再删除业务消息。
- 数据库和消息记录不保存 PDF base64 或长期有效的对象存储 URL。

## 部署

生产环境需要可持久化的 PostgreSQL、pgvector 扩展及 S3 兼容对象存储。部署新版本时执行：

```bash
npm run db:migrate
npm run db:setup-memory
npm run build
npm start
```

应用实例可以横向扩展；业务状态、Agent checkpoint、长期记忆和向量数据均保存在外部服务中。

## 文档

- [对话持久化与 RAG 架构](docs/architecture/chat-and-rag.md)
- [LangGraph 记忆方案调研](docs/research/langgraph-memory.md)
