# Radar Web Crawler — 生产部署指南

## 目录结构

```
deploy/
├── docker-compose.yml   # 生产环境 Docker Compose
├── .env.production       # 环境变量模板（复制为 .env 使用）
└── README.md             # 本文件
```

## 快速部署

```bash
# 1. 进入部署目录
cd deploy

# 2. 配置环境变量
cp .env.production .env
# 编辑 .env 填入搜索引擎 API 密钥等

# 3. 启动服务
docker compose up -d

# 4. 确认运行
docker compose ps
curl http://127.0.0.1:3000/api/tasks

# 5. 查看日志
docker compose logs -f
```

## 配置说明

### 搜索引擎 API 密钥

关键词搜索模式需要至少一个搜索引擎的 API 密钥：

| 引擎 | 环境变量 | 获取方式 |
|------|----------|---------|
| Google | `GOOGLE_API_KEY` + `GOOGLE_CX` | [Programmable Search Engine](https://programmablesearchengine.google.com/) |
| Bing  | `BING_API_KEY` | [Azure Portal](https://portal.azure.com/) |

不需要关键词搜索时可以留空。

### 代理配置

设置 `HTTPS_PROXY` 可以让爬虫通过代理发送请求，有助于规避 IP 封禁：

```
HTTPS_PROXY=http://user:pass@proxy.example.com:8080
```

### CI/CD 自动部署

项目已在 `.github/workflows/radar_docker.yml` 中配置了 CI/CD 流水线，每次推送到 `main` 分支且修改 `Radar/docker/**` 时自动：

1. 运行单元测试（109+ 项）
2. 构建前端
3. 构建 Docker 镜像并推送到 `ghcr.io/cxiyuan/radar-web-crawler`
4. 运行集成验证（44 项 API 测试）

## 健康检查

部署后可通过以下端点检查服务状态：

```bash
curl -sf http://127.0.0.1:3000/api/tasks
```

Docker Compose 配置了 30s 间隔的健康检查，`docker ps` 会显示容器健康状态。

## 数据持久化

SQLite 数据库和配置保存在 Docker 命名卷 `radar_data` 中：

```bash
# 备份数据
docker run --rm -v radar_data:/data -v $(pwd):/backup alpine tar czf /backup/radar-backup.tar.gz -C /data .

# 恢复数据
docker run --rm -v radar_data:/data -v $(pwd):/backup alpine tar xzf /backup/radar-backup.tar.gz -C /data
```

## 升级

```bash
# 拉取最新镜像
docker compose pull

# 重新创建容器
docker compose up -d --force-recreate

# 清理旧镜像
docker image prune
```

## 常见问题

**Q: 容器启动后马上退出？**
A: 检查是否已存在同名容器：`docker rm radar` 后重试。也可能是端口冲突，修改 `HOST_PORT`。

**Q: 关键词搜索返回错误？**
A: 检查 `.env` 中的 API 密钥是否正确配置，以及搜索引擎 API 是否已启用。

**Q: 爬虫遇到大量 403 错误？**
A: 配置 `HTTPS_PROXY`，或降低并发数（在页面中调整），或启用反检测引擎的浏览器回退。
