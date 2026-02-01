# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Router 是一个 Claude API 代理服务，提供用户管理、API Key 管理和请求日志功能。采用 pnpm monorepo 架构，包含三个 package。

## Common Commands

```bash
# 安装依赖
pnpm install

# 开发
pnpm dev:backend          # 启动后端 (localhost:3000)
pnpm dev:frontend         # 启动前端 (localhost:5173)

# 构建
pnpm build               # 构建所有包
pnpm build:shared        # 仅构建 shared 包（修改类型/schema 后需先执行）

# 数据库
pnpm db:generate         # 生成 Prisma Client
pnpm db:push             # 同步 schema 到数据库
pnpm db:migrate          # 创建迁移

# 测试
pnpm test                # 运行所有测试
pnpm --filter @claude-code-router/backend test  # 单独测试后端

# Docker
docker-compose up        # 启动开发环境 (含 PostgreSQL + Redis)
```

## Architecture

### Monorepo 结构

- **packages/shared**: 前后端共享的 TypeScript 类型、Zod Schema 和常量
- **packages/backend**: Express.js 后端，Prisma ORM，ioredis 缓存
- **packages/frontend**: React + Vite，shadcn/ui 组件，TanStack Query + Zustand

### 后端模块分层

每个业务模块 (`packages/backend/src/modules/*`) 遵循：
```
*.routes.ts      # 路由定义
*.controller.ts  # 请求响应处理
*.service.ts     # 业务逻辑
*.repository.ts  # 数据访问 + 缓存
```

### 认证系统

双登录模式：
- **普通用户**: GitHub OAuth 登录，首次登录自动创建账户
- **管理员**: 固定账号 `admin`，密码通过 `.env` 配置，不存数据库

关键路由：
- `POST /api/v1/auth/admin/login` - Admin 密码登录
- `GET /api/v1/auth/github` - 跳转 GitHub OAuth
- `GET /api/v1/auth/github/callback` - OAuth 回调
- `POST /api/v1/auth/refresh` - 刷新 Token
- `GET /api/v1/auth/me` - 获取当前用户

### 其他路由

- `/api/v1/users/*` - 用户管理（仅 admin）
- `/api/v1/api-keys/*` - API Key 管理
- `/api/v1/logs/*` - 请求日志查询
- `/proxy/*` - Claude API 代理（SSE 流式支持）
- `/api/docs` - Swagger UI

### 数据模型

四个核心表：User、ApiKey、RequestLog、RefreshToken（见 `packages/backend/prisma/schema.prisma`）

User 模型使用 GitHub OAuth 字段：`githubId`, `githubUsername`, `avatarUrl`

### 类型共享机制

修改 `packages/shared/src` 中的类型或 schema 后：
1. 运行 `pnpm build:shared`
2. 后端和前端通过 `@claude-code-router/shared` 导入

## Frontend Guidelines

### Tailwind CSS v4

项目使用 **Tailwind CSS v4** + `@tailwindcss/vite` 插件。

**CSS 语法要点：**
```css
/* 使用 @import 而非 @tailwind 指令 */
@import "tailwindcss";

/* 使用 @theme 定义主题变量 */
@theme {
  --color-primary: hsl(var(--primary));
  --font-sans: 'Roboto Variable', ui-sans-serif, system-ui, sans-serif;
}

/* CSS 变量直接在 :root 中定义，不使用 @layer base */
:root {
  --primary: 160 84% 39%;
}
```

**注意事项：**
- 不要使用 `@tailwind base/components/utilities`（这是 v3 语法）
- 不要使用 `@layer base { ... }` 包裹 CSS 变量
- 不要使用 `@apply` 指令（v4 中不推荐）
- 按钮等交互元素避免使用 `style={{ }}` 内联样式，会覆盖 hover/active 效果
- 使用 Tailwind 类设置颜色：`bg-[#24292F] hover:bg-[#3d4449] active:bg-[#1a1e22]`

### 组件库

使用 shadcn/ui 组件，位于 `packages/frontend/src/components/ui/`

## Environment Variables

后端配置示例见 `.env.docker.example`，必须配置：

```bash
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# JWT
JWT_SECRET=your-secret-at-least-32-chars
JWT_ACCESS_EXPIRES_IN=15m

# Server
PORT=3000
NODE_ENV=development

# Admin
ADMIN_PASSWORD=admin123

# GitHub OAuth
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/v1/auth/github/callback
FRONTEND_URL=http://localhost:5173

# Third Party Proxy (optional)
THIRD_PARTY_PROXY_ENABLED=false
THIRD_PARTY_PROXY_URL=http://proxy-host:port
```
