#!/bin/bash

# Claude Code Router 快速部署脚本

set -e

echo "========================================="
echo "  Claude Code Router - 快速部署脚本"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: 未找到 Docker，请先安装 Docker${NC}"
    exit 1
fi

# 检查 .env.production 是否存在
if [ ! -f .env.production ]; then
    echo -e "${RED}错误: .env.production 文件不存在${NC}"
    echo "请先创建 .env.production 文件并配置环境变量"
    exit 1
fi

# 菜单选项
echo "请选择操作:"
echo "1) 构建并启动服务"
echo "2) 启动服务"
echo "3) 停止服务"
echo "4) 重启服务"
echo "5) 查看日志"
echo "6) 更新并重新部署"
echo "7) 进入容器"
echo "8) 运行数据库迁移"
echo "0) 退出"
echo ""
read -p "请输入选项 [0-8]: " choice

case $choice in
    1)
        echo -e "${YELLOW}正在构建镜像...${NC}"
        docker compose -f docker-compose.local.yml build --no-cache
        echo -e "${GREEN}✓ 构建完成${NC}"
        echo ""
        echo -e "${YELLOW}正在启动服务...${NC}"
        docker compose -f docker-compose.local.yml up -d
        echo -e "${GREEN}✓ 服务已启动${NC}"
        echo ""
        echo -e "${GREEN}服务访问地址:${NC}"
        echo "  - http://localhost:3010"
        echo "  - http://nas.yanhaohub.com:3010"
        echo "  - API 文档: http://localhost:3010/api/docs"
        ;;
    2)
        echo -e "${YELLOW}正在启动服务...${NC}"
        docker compose -f docker-compose.local.yml up -d
        echo -e "${GREEN}✓ 服务已启动${NC}"
        ;;
    3)
        echo -e "${YELLOW}正在停止服务...${NC}"
        docker compose -f docker-compose.local.yml down
        echo -e "${GREEN}✓ 服务已停止${NC}"
        ;;
    4)
        echo -e "${YELLOW}正在重启服务...${NC}"
        docker compose -f docker-compose.local.yml restart
        echo -e "${GREEN}✓ 服务已重启${NC}"
        ;;
    5)
        echo -e "${YELLOW}查看日志 (按 Ctrl+C 退出)...${NC}"
        docker logs ccr-app -f
        ;;
    6)
        echo -e "${YELLOW}正在拉取最新代码...${NC}"
        git pull
        echo -e "${GREEN}✓ 代码已更新${NC}"
        echo ""
        echo -e "${YELLOW}正在重新构建镜像...${NC}"
        docker compose -f docker-compose.local.yml build --no-cache
        echo -e "${GREEN}✓ 构建完成${NC}"
        echo ""
        echo -e "${YELLOW}正在重启服务...${NC}"
        docker compose -f docker-compose.local.yml up -d --force-recreate
        echo -e "${GREEN}✓ 服务已重新部署${NC}"
        ;;
    7)
        echo -e "${YELLOW}进入容器 (输入 exit 退出)...${NC}"
        docker exec -it ccr-app sh
        ;;
    8)
        echo -e "${YELLOW}运行数据库迁移...${NC}"
        docker exec ccr-app sh -c "cd /app/packages/backend && npx prisma db push"
        echo -e "${GREEN}✓ 迁移完成${NC}"
        ;;
    0)
        echo "退出"
        exit 0
        ;;
    *)
        echo -e "${RED}无效选项${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}操作完成！${NC}"
