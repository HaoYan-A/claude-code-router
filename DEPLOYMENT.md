# Docker 本地部署说明

## 部署状态 ✅

服务已成功部署到本机 Docker，映射到端口 **3010**

## 访问地址

- **本地访问**: http://localhost:3010
- **外部访问**: http://nas.yanhaohub.com:3010
- **API 文档**: http://localhost:3010/api/docs

## 环境配置

配置文件位于: `.env.production`

### 重要配置项

1. **CLAUDE_API_KEY**: 需要设置真实的 Claude API Key
   ```bash
   # 编辑配置文件
   nano .env.production

   # 修改这一行
   CLAUDE_API_KEY="sk-ant-xxxxx"  # 替换为真实的 API Key
   ```

2. **数据库连接**: 使用外部 PostgreSQL (192.168.100.182:5432)
3. **Redis 连接**: 使用外部 Redis (192.168.100.182:6379)
4. **第三方代理**: 已启用 (192.168.100.208:3128)

## 常用命令

### 启动/停止服务

```bash
# 启动服务
docker compose -f docker-compose.local.yml up -d

# 停止服务
docker compose -f docker-compose.local.yml down

# 重启服务
docker compose -f docker-compose.local.yml restart

# 查看日志
docker logs ccr-app -f

# 查看容器状态
docker ps | grep ccr-app
```

### 更新代码并重新部署

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建镜像
docker compose -f docker-compose.local.yml build --no-cache

# 3. 重启容器
docker compose -f docker-compose.local.yml up -d --force-recreate
```

### 数据库迁移

如果数据库中没有表，需要运行迁移：

```bash
# 进入容器
docker exec -it ccr-app sh

# 在容器内运行
cd /app/packages/backend
npx prisma migrate deploy
# 或者
npx prisma db push

# 退出容器
exit
```

## 默认登录信息

### 管理员账户
- 用户名: `admin`
- 密码: `admin123` (在 .env.production 中配置的 ADMIN_PASSWORD)

### 普通用户
- 通过 GitHub OAuth 登录

## 服务状态检查

```bash
# 检查服务是否运行
curl http://localhost:3010/api/docs

# 检查数据库连接
docker logs ccr-app | grep "Database connected"

# 检查 Redis 连接
docker logs ccr-app | grep "Redis connected"
```

## 故障排查

### 1. 容器无法启动

```bash
# 查看详细日志
docker logs ccr-app

# 检查环境变量
docker exec ccr-app env | grep -E "(DATABASE_URL|REDIS_URL|CLAUDE_API_KEY)"
```

### 2. 数据库连接失败

- 确保 PostgreSQL 服务正在运行 (192.168.100.182:5432)
- 检查防火墙设置
- 验证数据库用户名和密码

### 3. Redis 连接失败

- 确保 Redis 服务正在运行 (192.168.100.182:6379)
- 检查 Redis 密码是否正确

### 4. GitHub OAuth 登录失败

- 确保 GitHub OAuth App 的回调 URL 设置为: `http://nas.yanhaohub.com:3010/api/v1/auth/github/callback`
- 检查 GITHUB_CLIENT_ID 和 GITHUB_CLIENT_SECRET 是否正确

## 安全建议

1. **修改默认密码**: 更改 .env.production 中的 ADMIN_PASSWORD
2. **保护配置文件**: 不要将 .env.production 提交到 Git
3. **定期更新**: 定期拉取最新代码并重新部署
4. **监控日志**: 定期查看日志文件，发现异常及时处理

## 性能优化

当前 Docker 资源限制：
- CPU: 2 核
- 内存: 1GB

如需调整，修改 `docker-compose.local.yml` 中的 `deploy.resources.limits` 配置。

## 技术栈

- **后端**: Node.js 20 + Express + Prisma
- **前端**: React + Vite (已构建为静态文件)
- **数据库**: PostgreSQL 16
- **缓存**: Redis 7
- **容器**: Docker + Docker Compose
