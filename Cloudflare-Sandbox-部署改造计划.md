Amazon-Chat Cloudflare Sandbox 部署改造计划

 Context

 amazon-chat 是一个 AI 亚马逊卖家调研助手，使用 Express + WebSocket + claude-agent-sdk + Python 脚本。当前部署在 VPS
 上。目标是改造为 Cloudflare Sandbox SDK 部署，采用 WebSocket + DO 代理 方案（详见 SSE vs WebSocket方案对比.md）。

 核心思路：容器内运行现有后端代码（零改动），Worker/DO 做透明代理，前端零改动。

 改动总览

 新增文件 (7):
   cloudflare/src/index.ts       — Worker + DO 代理（~120行）
   cloudflare/wrangler.jsonc      — Cloudflare 部署配置
   cloudflare/package.json        — Worker 依赖
   cloudflare/tsconfig.json       — Worker TS 配置
   Dockerfile                     — 容器镜像定义
   entrypoint.sh                  — 容器启动脚本（生成 .mcp.json）
   .dockerignore                  — Docker 忽略文件

 修改文件 (1):
   package.json                   — 添加 docker:build 脚本

 不变文件:
   server/*                       — 容器内运行，零改动
   src/*                          — 前端相对URL，零改动
   .claude/skills/*               — Skills 零改动

 ---
 Step 1: 创建 Dockerfile

 文件: amazon-chat/Dockerfile

 基于 cloudflare/sandbox:0.10.3，安装 Python + Node 依赖：

 FROM docker.io/cloudflare/sandbox:0.10.3

 RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*
 RUN pip3 install --no-cache-dir requests openpyxl

 WORKDIR /app
 COPY package*.json ./
 RUN npm install
 COPY server/ ./server/
 COPY tsconfig.server.json ./
 COPY .claude/ ./.claude/
 COPY entrypoint.sh ./
 RUN chmod +x entrypoint.sh
 RUN mkdir -p uploads reports review-analysis-reports

 EXPOSE 3000
 ENTRYPOINT ["./entrypoint.sh"]

 Step 2: 创建 entrypoint.sh

 文件: amazon-chat/entrypoint.sh

 启动时生成 .mcp.json（从环境变量读取 Sorftime API Key）：

 #!/bin/bash
 cat > .mcp.json << EOF
 {
   "mcpServers": {
     "sorftime": {
       "url": "https://mcp.sorftime.com?key=${SORFTIME_API_KEY}"
     }
   }
 }
 EOF
 exec npx tsx server/index.ts

 Step 3: 创建 .dockerignore

 文件: amazon-chat/.dockerignore

 排除 node_modules、dist、reports 等不需要的文件。

 Step 4: 创建 cloudflare/ 目录

 4a: cloudflare/package.json

 依赖：@cloudflare/sandbox、wrangler、typescript

 4b: cloudflare/tsconfig.json

 标准 Workers TS 配置

 4c: cloudflare/wrangler.jsonc

 关键配置：
 - containers: 引用 Dockerfile，instance_type: "basic"
 - durable_objects: ChatProxy DO
 - durable_objects: ChatSandbox (from @cloudflare/sandbox)
 - assets: 指向 ../dist（前端构建产物）
 - migrations: new_sqlite_classes

 4d: cloudflare/src/index.ts — 核心 Worker + DO

 ChatSandbox 类：继承 @cloudflare/sandbox 的 Sandbox，配置网络（需要外网访问 Sorftime API + DeepSeek API）

 ChatProxy DO：
 1. 接受浏览器 WebSocket（WebSocketPair）
 2. 通过 sandbox.fetch(WS) 连接容器内 WebSocket
 3. 双向代理消息

 Worker fetch handler：
 - /ws → 委托给 ChatProxy DO
 - /api/* → sandbox.fetch() 代理到容器
 - /reports/*, /review-analysis-reports/* → sandbox.fetch() 代理
 - 其他 → ASSETS（前端静态文件）

 Step 5: 修改 package.json

 添加构建脚本："build:cloudflare": "vite build && cd cloudflare && npm install"

 Step 6: 验证

 1. cd amazon-chat && npm run build — 构建前端
 2. cd cloudflare && npm run dev — 本地测试（wrangler dev 会构建 Docker 镜像并启动）
 3. 访问 http://localhost:8787 测试功能
 4. npx wrangler deploy — 部署到 Cloudflare

 关键设计决策

 1. 前端零改动：所有 URL 使用相对路径，Vite proxy（本地）/ Worker 路由（线上）自动处理
 2. server/ 零改动：Express+WS+claude-agent-sdk 在容器内运行，完全保留
 3. Skills 零改动：.claude/skills/ 目录完整复制到容器
 4. Python 零改动：requests + openpyxl 在容器内安装，脚本直接运行
 5. 凭证代理：通过 entrypoint.sh 生成 .mcp.json，环境变量由 Worker 传入
 6. 文件存储：reports 和 uploads 在容器文件系统内（测试阶段可用，生产环境需迁移 R2）




❯ 请问需要本地安装docker吗 ?

● 本地测试需要，生产部署不需要。

  ┌─────────────────────────────┬───────────────┬───────────────────────────────────────┐
  │            场景             │ 需要 Docker？ │                 原因                  │
  ├─────────────────────────────┼───────────────┼───────────────────────────────────────┤
  │ wrangler dev（本地调试）    │ 需要          │ 在本地构建并运行容器                  │
  ├─────────────────────────────┼───────────────┼───────────────────────────────────────┤
  │ wrangler deploy（线上部署） │ 不需要        │ Cloudflare 在他们的基础设施上构建镜像 │
  └─────────────────────────────┴───────────────┴───────────────────────────────────────┘

● 现在回答你的问题：

  不需要 wrangler secret put。 我简化了方案——所有配置直接通过 .env 文件打包进 Docker 镜像：

  ┌────────────────────┬────────────────────────────────────┬───────────────────────────────────────────────┐
  │        变量        │                 值                 │                     说明                      │
  ├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
  │ ANTHROPIC_API_KEY  │ sk-8518979...                      │ DeepSeek API Key（已在 .env）                 │
  ├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
  │ ANTHROPIC_BASE_URL │ https://api.deepseek.com/anthropic │ API 地址（已在 .env）                         │
  ├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
  │ MODEL              │ deepseek-v4-flash                  │ 模型名（已在 .env）                           │
  ├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
  │ TIKHUB_TOKEN       │ vZdfXsQa...                        │ Sorftime Key（已在 .env，用于生成 .mcp.json） │
  ├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
  │ PORT               │ 3000                               │ 容器内端口（已在 .env）                       │
  └────────────────────┴────────────────────────────────────┴───────────────────────────────────────────────┘

  部署只需三步：

  cd amazon-chat
  npm run build
  cd cloudflare && npm install && npx wrangler deploy

  你的 .env 已经包含了所有需要的参数，不需要额外填写任何东西。