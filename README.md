# Claude Code Router

Claude Code Router 是一个 **Claude API 兼容** 的代理与调度系统：
- 对外提供 `POST /proxy/v1/messages`（兼容 Anthropic Claude Messages API）
- 对内支持把请求 **路由/转发** 到不同的平台账号池（Kiro / Antigravity / OpenAI 等）
- 同时提供一个管理后台，用于 **账号管理、API Key 管理、日志审计与用量统计**

适合这些场景：
- 你希望对外只暴露一套 Claude API 入口，但可以按规则把请求分发到多个上游
- 你需要给团队发放 API Key，并按 Key 维度看日志/统计/额度
- 你希望在同一套接口下使用不同供应商（Amazon Q / Antigravity / OpenAI）并保持流式体验

## 特性

- **Claude API 兼容代理**：对外使用 Claude Messages API 格式（当前聚焦 `POST /v1/messages`）
- **多平台路由**：同一套请求可转发到
  - **Kiro**（Amazon Q Developer，AWS SSE 流）
  - **Antigravity**（Gemini v1internal / Cloud Code Assist 风格接口）
  - **OpenAI**（Responses API：`/v1/responses`）
- **API Key 管理**：创建/禁用/过期时间、查看 Key 前缀与完整 Key
- **模型映射（Model Mapping）**：为每个 API Key 配置 `opus/sonnet/haiku` 三个 slot 的路由规则（平台 + target model）
- **账号池与调度**：第三方账号支持优先级、可调度开关、失败切换与重试
- **请求日志审计**：记录请求/响应、上游返回、状态码、耗时、目标模型、命中账号等（敏感头会脱敏）
- **用量/费用统计**：按模型与时间范围聚合统计（并提供排行榜/概览接口）
- **SSE 流式响应**：完整透传并在不同平台间做流式协议转换
- **Thinking / Reasoning 支持**：在不同平台之间做思考/推理配置的兼容转换（例如 effort/budget）
- **可选上游代理**：支持为第三方平台请求配置 HTTP(S) 代理（适配企业网络环境）

## 支持的平台

| Platform | 上游类型 | 说明 |
|---|---|---|
| **Kiro** | Amazon Q Developer | 支持 AWS 二进制 SSE → Anthropic SSE 转换；适合稳定的 Claude 模型转发 |
| **Antigravity** | Gemini v1internal 风格 | 支持工具调用/思考模式等转换；适合 Gemini / Cloud Code Assist 类接口 |
| **OpenAI** | Responses API | 支持 Responses SSE → Anthropic SSE；支持 tool/function call 映射 |

> 想新增平台：参考 `packages/backend/src/modules/proxy/channels/*` 的 channel 结构（models/converter/handler/index）。

## 系统如何路由（核心概念）

1. 客户端请求 `POST /proxy/v1/messages`，Header 带 `x-api-key`（或 `Authorization: Bearer <key>`）。
2. 服务端从请求里的 `model` 推断一个 **slot**：`opus` / `sonnet` / `haiku`。
3. 读取该 API Key 对应的 **Model Mapping**：`slot -> (platform, targetModel, reasoningEffort?)`。
4. 从对应平台的账号池里选择一个可用账号（支持失败切换与重试）。
5. 将 Claude 请求转换为目标平台协议并发起上游请求。
6. 把上游响应（含 SSE）转换回 Claude 的响应/事件格式返回。
7. 全链路记录日志与统计（并在管理后台展示）。

## 项目结构

这是一个 pnpm monorepo：

```
claude-code-router/
├── packages/
│   ├── shared/          # 前后端共享类型、Zod Schema、常量
│   ├── backend/         # Express + Prisma + Redis
│   └── frontend/        # React + Vite + Tailwind v4 + shadcn/ui
└── docker-compose*.yml
```

后端业务模块结构：

```
packages/backend/src/modules/*
├── *.routes.ts
├── *.controller.ts
├── *.service.ts
└── *.repository.ts
```

## 快速开始（本地开发）

### 环境要求

- Node.js **20+**
- pnpm **8+**（项目使用 `pnpm@9.x` 也可）
- PostgreSQL 14+
- Redis 7+

### 1) 安装依赖

```bash
pnpm install
```

### 2) 配置环境变量

```bash
cp packages/backend/.env.example packages/backend/.env
```

编辑 `packages/backend/.env`：

```bash
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/claude_code_router?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-jwt-key-at-least-32-chars"
JWT_ACCESS_EXPIRES_IN="15m"

# Server
PORT=3000
NODE_ENV="development"

# Admin
ADMIN_PASSWORD=your-secure-admin-password

# GitHub OAuth (用于普通用户登录)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/v1/auth/github/callback
FRONTEND_URL=http://localhost:5173

# Third Party Account Proxy (optional)
THIRD_PARTY_PROXY_ENABLED=false
THIRD_PARTY_PROXY_URL=http://127.0.0.1:7890
```

备注：当前后端启动时会校验 GitHub OAuth 相关变量（即使你只使用管理员登录，也需要提供值；可以先填入占位值，后续再配置真实 OAuth）。

### 3) 初始化数据库

```bash
pnpm db:push
```

### 4) 启动后端与前端

```bash
# 终端 1
pnpm dev:backend

# 终端 2
pnpm dev:frontend
```

- 前端管理后台：http://localhost:5173
- 后端 API（含 Swagger）：http://localhost:3000/api/docs

## Docker 部署

仓库内提供多套 compose：

- `docker-compose.yml`：Postgres + Redis + backend + frontend（常用于本地一键启动）
- `docker-compose.prod.yml`：偏生产配置（带网络隔离/资源限制）
- `docker-compose.local.yml`：打包成单容器对外暴露（例如映射到 3010）

示例（开发环境一键启动）：

```bash
export JWT_SECRET="your-super-secret-jwt-key-at-least-32-chars"
export CLAUDE_API_KEY="your-claude-api-key" # 如果你使用官方 Claude 直连能力（可选）

docker-compose up -d
```

更多细节可参考 `DEPLOYMENT.md`。

## 使用方式

### 1) 登录管理后台

- 管理员：账号固定为 `admin`，密码来自 `ADMIN_PASSWORD`
- 普通用户：GitHub OAuth 登录（首次登录自动创建用户）

### 2) 创建 API Key + 配置模型映射

在后台的「API Keys」中创建 Key，并为三个 slot 配置映射：

- `opus` → (platform, targetModel)
- `sonnet` → (platform, targetModel)
- `haiku` → (platform, targetModel)

可选：为某些平台设置 `reasoningEffort`（例如 OpenAI 的 reasoning effort），用于覆盖请求中的推理强度。

### 3) 调用代理接口（Claude Messages API 兼容）

将 API Key 放到 `x-api-key` 或 `Authorization: Bearer`：

```bash
curl -X POST http://localhost:3000/proxy/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "model": "claude-sonnet-4-5-20250514",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

说明：服务端会从 `model` 推断 `opus/sonnet/haiku` slot 并按映射转发；因此你可以继续沿用你现有的 Claude 客户端/SDK。

## 第三方账号管理（平台接入）

第三方账号管理接口位于：`/api/v1/accounts/*`（需要管理员权限）。

### 1) Antigravity 账号（OAuth）

流程（概念上）：
1. 后台获取 OAuth URL
2. 浏览器打开授权
3. 拿到回调 URL（包含 `code`/`state`）
4. 将回调 URL 提交给后端 exchange，创建账号

相关接口：
- `GET /api/v1/accounts/antigravity/oauth-url`
- `POST /api/v1/accounts/antigravity/exchange`

### 2) Kiro 账号导入

接口：`POST /api/v1/accounts/kiro/import`

请求体字段：
- `refreshToken`：refresh token
- `clientId` / `clientSecret`：Kiro(OIDC) client credentials
- `clientIdHash`：用于生成平台唯一 ID（你可以自定义为不包含敏感信息的 hash）
- `region`：如 `us-east-1`

### 3) OpenAI 账号导入

接口：`POST /api/v1/accounts/openai/import`

请求体字段：
- `apiBaseUrl`：如 `https://api.openai.com`
- `apiKey`：OpenAI API Key

完整文档：启动后访问 http://localhost:3000/api/docs

## 常用命令

```bash
# 开发
pnpm dev:backend
pnpm dev:frontend

# 构建
pnpm build
pnpm build:shared

# 数据库
pnpm db:generate
pnpm db:push
pnpm db:migrate

# 测试
pnpm test
pnpm --filter @claude-code-router/backend test
```

## 安全建议

- 不要把 `.env` / `.env.production` 提交到仓库
- 把 API Key 当作密钥管理，定期轮换；发现泄露立即禁用
- 生产环境建议：开启 HTTPS、限制后台访问来源、使用更强 JWT_SECRET、配置日志与数据库备份

## 贡献指南

欢迎 Issue 和 PR！

1. Fork 本仓库
2. 创建分支：`git checkout -b feature/your-feature`
3. 提交：`git commit -m "feat: ..."`
4. 推送：`git push origin feature/your-feature`
5. 提交 Pull Request

## License

[MIT License](LICENSE)

## 致谢

- [Anthropic](https://www.anthropic.com) - Claude API
- [OpenAI](https://openai.com) - Responses API
- [shadcn/ui](https://ui.shadcn.com) - UI 组件库
- [Prisma](https://prisma.io) - ORM
