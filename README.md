# Claude Code Router

一个功能强大的 Claude API 代理服务，支持多平台模型路由、用户管理、API Key 管理和详细的请求日志统计。

## 特性

- **多平台模型路由** - 将 Claude API 请求智能路由到不同的后端平台（Antigravity、Kiro 等）
- **灵活的模型映射** - 为每个 API Key 配置独立的模型映射规则
- **用户管理** - 支持 GitHub OAuth 登录，管理员后台管理
- **API Key 管理** - 创建、编辑、启用/禁用 API Key
- **请求日志** - 详细记录每次 API 调用，支持筛选和搜索
- **费用统计** - 按 API Key、模型、时间维度统计 Token 用量和费用
- **流式响应** - 完整支持 SSE 流式输出
- **Thinking 模式** - 支持 Claude 和 Gemini 的思考模式

## 技术栈

- **后端**: Express.js + TypeScript + Prisma ORM + ioredis
- **前端**: React + Vite + Tailwind CSS v4 + shadcn/ui
- **数据库**: PostgreSQL + Redis
- **架构**: pnpm Monorepo

## 快速开始

### 环境要求

- Node.js 18+
- pnpm 8+
- PostgreSQL 14+
- Redis 7+

### 1. 克隆项目

```bash
git clone https://github.com/your-username/claude-code-router.git
cd claude-code-router
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

```bash
cp packages/backend/.env.example packages/backend/.env
```

编辑 `packages/backend/.env`，填入你的配置：

```bash
# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/claude_code_router"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT 密钥（至少 32 字符）
JWT_SECRET="your-super-secret-jwt-key-at-least-32-chars"

# 管理员密码
ADMIN_PASSWORD="your-secure-admin-password"

# GitHub OAuth（可选，用于用户登录）
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
GITHUB_CALLBACK_URL="http://localhost:3000/api/v1/auth/github/callback"
FRONTEND_URL="http://localhost:5173"
```

### 4. 初始化数据库

```bash
pnpm db:push
```

### 5. 启动开发服务器

```bash
# 终端 1 - 启动后端
pnpm dev:backend

# 终端 2 - 启动前端
pnpm dev:frontend
```

访问 http://localhost:5173 即可看到管理界面。

## Docker 部署

使用 Docker Compose 一键启动：

```bash
# 设置环境变量
export JWT_SECRET="your-super-secret-jwt-key-at-least-32-chars"
export CLAUDE_API_KEY="your-claude-api-key"

# 启动所有服务
docker-compose up -d
```

## 使用方式

### 1. 登录管理后台

- **管理员登录**: 使用账号 `admin` 和配置的 `ADMIN_PASSWORD`
- **用户登录**: 通过 GitHub OAuth 登录

### 2. 创建 API Key

1. 进入「API Keys」页面
2. 点击「Create Key」
3. 配置模型映射（将 Opus/Sonnet/Haiku 映射到目标平台和模型）
4. 保存生成的 API Key

### 3. 使用 API

将生成的 API Key 作为 `x-api-key` 或 `Authorization: Bearer` 头部发送请求：

```bash
curl -X POST http://localhost:3000/proxy/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "model": "claude-sonnet-4-5-20250514",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## 项目结构

```
claude-code-router/
├── packages/
│   ├── shared/          # 共享类型、Schema、常量
│   ├── backend/         # Express.js 后端
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/      # 认证模块
│   │   │   │   ├── user/      # 用户管理
│   │   │   │   ├── api-key/   # API Key 管理
│   │   │   │   ├── proxy/     # 代理核心
│   │   │   │   └── log/       # 请求日志
│   │   │   └── ...
│   │   └── prisma/      # 数据库 Schema
│   └── frontend/        # React 前端
│       └── src/
│           ├── features/      # 功能模块
│           └── components/    # 通用组件
├── docker-compose.yml
└── package.json
```

## API 文档

启动后端后访问 http://localhost:3000/api/docs 查看 Swagger 文档。

### 主要接口

| 接口 | 说明 |
|------|------|
| `POST /proxy/v1/messages` | Claude API 代理（兼容官方格式） |
| `GET /api/v1/auth/me` | 获取当前用户信息 |
| `GET /api/v1/api-keys` | 获取 API Key 列表 |
| `POST /api/v1/api-keys` | 创建 API Key |
| `GET /api/v1/logs` | 获取请求日志 |

## 常用命令

```bash
# 开发
pnpm dev:backend          # 启动后端
pnpm dev:frontend         # 启动前端

# 构建
pnpm build                # 构建所有包
pnpm build:shared         # 构建共享包

# 数据库
pnpm db:generate          # 生成 Prisma Client
pnpm db:push              # 同步 Schema 到数据库
pnpm db:migrate           # 创建数据库迁移

# 类型检查
pnpm --filter @claude-code-router/backend exec tsc --noEmit
pnpm --filter @claude-code-router/frontend exec tsc --noEmit
```

## 支持的模型平台

### Antigravity
- Claude Opus 4.5 Thinking
- Claude Sonnet 4.5 Thinking
- Gemini 3 Pro
- Gemini 3 Flash

### Kiro
- Claude Opus 4.5
- Claude Sonnet 4.5
- Claude Haiku 4.5

## 配置说明

### 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 连接字符串 |
| `REDIS_URL` | 是 | Redis 连接字符串 |
| `JWT_SECRET` | 是 | JWT 签名密钥（≥32 字符） |
| `ADMIN_PASSWORD` | 是 | 管理员登录密码 |
| `GITHUB_CLIENT_ID` | 否 | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | 否 | GitHub OAuth Client Secret |
| `GITHUB_CALLBACK_URL` | 否 | GitHub OAuth 回调地址 |
| `FRONTEND_URL` | 否 | 前端地址（OAuth 跳转用） |

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 开源协议

[MIT License](LICENSE)

## 致谢

- [Anthropic](https://anthropic.com) - Claude API
- [shadcn/ui](https://ui.shadcn.com) - UI 组件库
- [Prisma](https://prisma.io) - 数据库 ORM
