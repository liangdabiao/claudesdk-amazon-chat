# Amazon-Chat Cloudflare 上线操作文档

## 前提条件

1. **Cloudflare 账户** — https://dash.cloudflare.com/sign-up
2. **Node.js 18+**

> 不需要本地安装 Docker。容器镜像由 Cloudflare 在其基础设施上构建。

---

## 一、架构说明

```
用户浏览器 ←WebSocket→ Cloudflare Worker (DO) ←sandbox.fetch(WS)→ Docker 容器
                                                                               │
                                                                    Express + claude-agent-sdk
                                                                    + Python 脚本 + Skills
```

**所有配置（API Key 等）通过 `.env` 文件打包进 Docker 镜像**，不需要 `wrangler secret put`。

---

## 二、上线步骤

### Step 1: 确认 .env 文件

确保 `amazon-chat/.env` 文件存在且包含正确的配置：

```env
ANTHROPIC_API_KEY=sk-你的key
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
MODEL=deepseek-v4-flash
TIKHUB_TOKEN=你的Sorftime-Key
PORT=3000
```

> `.env` 文件会被打包进 Docker 镜像，不会提交到 git（已在 .gitignore 中）。

### Step 2: 构建前端

```bash
cd amazon-chat
npm install
npm run build
```

### Step 3: 安装 Worker 依赖

```bash
cd cloudflare
npm install
```

### Step 4: 部署

```bash
cd cloudflare
npx wrangler deploy
```

首次部署会构建 Docker 镜像（约 3-5 分钟）。

部署成功后输出：
```
Published amazon-chat (x.xx sec)
  https://amazon-chat.<your-subdomain>.workers.dev
```

### Step 5: 等待容器就绪

首次部署后等待 **2-3 分钟**，让容器镜像构建并启动。

### Step 6: 验证

1. 打开 Worker URL
2. 确认页面加载（前端 UI 出现）
3. 确认 WebSocket 连接（右上角显示绿色"已连接"）
4. 发送测试消息
5. 测试技能：输入 `/amazon-analyse B07PWTJ4H1 US`

---

## 三、环境变量说明

| 变量 | 说明 | 从哪来 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | DeepSeek/Anthropic API Key | `.env` 文件 |
| `ANTHROPIC_BASE_URL` | API 基础 URL | `.env` 文件 |
| `MODEL` | 模型名称 | `.env` 文件 |
| `TIKHUB_TOKEN` | Sorftime 市场 API Key | `.env` 文件 |
| `PORT` | 服务端口（固定 3000） | `.env` 文件 |

**不需要 `wrangler secret put`。** 所有配置通过 `.env` 文件管理。

---

## 四、更新部署

当代码有修改时：

```bash
cd amazon-chat
npm run build                  # 重新构建前端
cd cloudflare
npx wrangler deploy            # 重新部署（会重建容器镜像）
```

如果只改了前端（`src/`），不改后端（`server/`）或配置（`.env`），部署会更快。

如果改了 `.env` 配置，必须重新部署才能生效。

---

## 五、查看日志

```bash
cd cloudflare
npx wrangler tail
```

实时查看 Worker 和容器的日志输出。

---

## 六、常见问题

### Q: 页面加载了但 WebSocket 显示"断开"？
容器可能还在启动中。等待 1-2 分钟后刷新页面。首次请求会触发容器启动。

### Q: 报告文件丢失？
容器文件系统是临时的。容器重启后 `reports/` 和 `uploads/` 目录会清空。生产环境建议迁移到 R2 存储。

### Q: Python 脚本执行失败？
容器内已安装 `python3`、`requests`、`openpyxl`。如需额外包，修改 `Dockerfile` 中的 `pip3 install` 行后重新部署。

### Q: 如何换 API Key？
修改 `.env` 文件中的值，然后重新执行 `npx wrangler deploy`。

### Q: 本地如何测试？
需要安装 Docker Desktop，然后：
```bash
cd amazon-chat && npm run build
cd cloudflare && npm run dev
# 访问 http://localhost:8787
```

---

## 七、费用估算

| 资源 | 免费额度 | 说明 |
|------|---------|------|
| Workers 请求 | 100,000 次/天 | 足够开发测试 |
| Durable Objects | 100万请求/月 | WebSocket 连接 |
| 容器运行时间 | 按用量计费 | 测试阶段费用极低 |

---

## 八、一键部署（从项目根目录）

```bash
cd amazon-chat

# 1. 确认 .env 配置正确
cat .env

# 2. 构建前端 + 安装 Worker 依赖 + 部署
npm run build && cd cloudflare && npm install && npx wrangler deploy
```
