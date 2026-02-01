# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm@9.1.0

# 复制 workspace 配置文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# 复制各个包的 package.json
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
COPY packages/frontend ./packages/frontend

# 构建 shared
RUN pnpm build:shared

# 构建前端
RUN pnpm build:frontend

# 生成 Prisma Client 并构建后端
RUN pnpm db:generate && pnpm build:backend

# Stage 2: Production
FROM node:20-alpine AS production

# 安装 OpenSSL（Prisma 需要）
RUN apk add --no-cache openssl

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm@9.1.0

# 复制 workspace 配置文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 复制各个包的 package.json
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# 安装所有依赖（包括 devDependencies 中的 prisma CLI）
RUN pnpm install --frozen-lockfile

# 从 builder 复制构建产物
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/src/config/*.json ./packages/backend/dist/config/

# 复制 Prisma schema
COPY --from=builder /app/packages/backend/prisma ./packages/backend/prisma

# 复制前端构建产物到后端的 public 目录
COPY --from=builder /app/packages/frontend/dist ./packages/backend/public

# 生成 Prisma Client
RUN pnpm db:generate

# 设置工作目录为后端
WORKDIR /app/packages/backend

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["node", "dist/server.js"]
