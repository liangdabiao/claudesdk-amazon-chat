# AmazonChat — 技术方案文档

## 一、项目概述

基于 **Claude Agent SDK** 构建的 AI 亚马逊卖家调研助手 Web 应用。用户通过自然语言对话即可调用 5 个专业亚马逊运营技能，完成竞品分析、品类选品、关键词调研、选品决策、评论分析等全链路运营工作。

### 核心价值

| 对比项 | 传统方式 | AmazonChat |
|--------|----------|------------|
| 调研工具 | 分散的多个工具/脚本 | 统一对话界面 |
| 操作门槛 | 需手动配置API、运行脚本 | 自然语言触发，AI自动执行 |
| 数据来源 | 需自行拼接 | Sorftime MCP 统一数据源 |
| 输出格式 | 各技能格式不一 | 统一文件树管理 + 预览 |

---

## 二、技能架构（核心）

### 2.1 五大专业技能

| # | 技能名 | 类型 | 触发命令 | 核心功能 | 输出 |
|---|--------|------|----------|----------|------|
| 1 | **amazon-analyse** | 竞品分析 | `/amazon-analyse {ASIN} {站点}` | 竞品Listing四维穿透分析（文案+表现+评论+市场） | Markdown报告 |
| 2 | **category-selection** | 品类选品 | `/category-selection {品类} {站点}` | 五维评分模型品类分析（市场+增长+竞争+壁垒+利润） | Excel + Markdown + HTML看板 |
| 3 | **keyword-research** | 关键词调研 | `/keyword-research {ASIN} {站点}` | 2000+关键词采集 + LLM 8维度智能分类 | CSV词库 + Markdown + HTML看板 |
| 4 | **product-research** | 选品决策 | `/product-research {关键词} {站点}` | 两阶段深度选品（数据采集+LLM分析） | data.json + HTML看板 + Markdown |
| 5 | **review-analysis** | 评论分析 | `/review-analysis {ASIN} {站点}` | 差评痛点分类 + 6维分析 + 改进建议 | Markdown报告 + JSON数据 |

### 2.2 技能依赖关系

```
category-selection (品类选品)
    ↓ 提供品类方向
product-research (选品决策)
    ↓ 确定目标ASIN
    ├──→ amazon-analyse (竞品穿透)
    ├──→ keyword-research (关键词词库)
    └──→ review-analysis (评论痛点)
```

### 2.3 数据源：Sorftime MCP API

所有技能共享 Sorftime MCP 作为唯一数据源，通过 HTTP POST + SSE 协议调用：

```bash
curl -s -X POST "https://mcp.sorftime.com?key={API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":N,"method":"tools/call","params":{"name":"TOOL_NAME","arguments":{...}}}'
```

覆盖 **34 个 API 端点**：
- 亚马逊产品接口 (9个)：product_detail, product_reviews, product_trend 等
- 亚马逊类目接口 (7个)：category_report, category_trend 等
- 亚马逊关键词接口 (4个)：keyword_detail, keyword_related_words 等
- 关键词词库管理 (5个)
- 1688 采购平台 (1个)
- TikTok 电商接口 (8个)

### 2.4 allowedTools 设计

```typescript
allowedTools: [
  "Skill",      // 跨技能调用
  "Task",       // 并行子任务
  "Bash",       // 关键！curl API调用 + Python脚本执行
  "Read",       // 读取配置(.mcp.json)和脚本
  "Write",      // 保存报告文件
  "Glob",       // 查找已生成的报告
  "Grep",       // 搜索报告内容
  "WebSearch",  // 补充市场信息搜索
  "TodoWrite",  // 多步骤任务追踪
]
```

**Bash 是本项目的关键工具**：所有 Sorftime API 调用都通过 `curl` 发起，数据采集和报告生成依赖 Python 脚本执行。

---

## 三、系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     用户浏览器 (React)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ 报告文件树    │  │  对话主区域   │  │  任务进度面板    │  │
│  │ (左侧 280px) │  │  (中间 flex)  │  │ (右侧 200px)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ WebSocket + REST API
┌────────────────────────┴────────────────────────────────────┐
│                  Express Server (port 3005)                   │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────────────┐ │
│  │ REST API │  │ WebSocket Hub │  │ AgentSession (SDK)    │ │
│  │ /api/*   │  │ /ws           │  │ query() + MessageQueue│ │
│  └──────────┘  └───────────────┘  └──────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │ Claude Agent SDK
┌────────────────────────┴────────────────────────────────────┐
│              Claude AI + 5 Amazon Skills                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Sorftime MCP API ←── curl (Bash) ──→ 数据采集       │   │
│  │  Python Scripts (Bash) ──→ 数据处理 + 报告生成        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 18 + Tailwind CSS 4 + Vite 6 | 同系列项目统一技术栈 |
| 后端 | Express + WebSocket (ws) | 实时双向通信 |
| AI | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) | `query()` + MessageQueue 模式 |
| 数据 | Sorftime MCP API | 34 个亚马逊/TikTok/1688 数据接口 |
| 脚本 | Python 3 (已有脚本) | category-selection 19个, keyword-research 10个, product-research 6个 |
| 部署 | `.claude/skills/` + `settingSources: ["project"]` | SDK 自动加载技能 |

---

## 四、后端设计

### 4.1 server/agent-client.ts

```typescript
// 关键配置
allowedTools: ["Skill", "Task", "Bash", "Read", "Write", "Glob", "Grep", "WebSearch", "TodoWrite"],

systemPrompt: `你是 AmazonChat，一个专业的 AI 亚马逊卖家调研助手。

你拥有 5 个专业技能：

一、竞品分析
- amazon-analyse：对竞品Listing进行四维穿透分析（文案逻辑、产品表现、评论洞察、市场动态）

二、品类与选品
- category-selection：基于五维评分模型的品类自动化选品分析
- product-research：LLM驱动的两阶段深度选品（数据采集+分析决策）

三、关键词与评论
- keyword-research：2000+关键词深度采集与8维度LLM智能分类
- review-analysis：差评痛点分类、6维分析、改进建议和客服模板

工作原则：
1. 所有数据通过 Sorftime MCP API 获取（使用 curl 调用）
2. API Key 从 .mcp.json 文件读取
3. 使用 Python 脚本处理数据和生成报告
4. 报告输出到 reports/ 目录，按技能类型组织
5. 用中文回复用户

文件输出：
- 竞品分析 → reports/analysis_{ASIN}_{site}_{date}.md
- 品类选品 → reports/{category}_analysis_{date}/ (md + html + xlsx)
- 关键词   → reports/keyword_analysis_{ASIN}_{date}/ (md + csv + html)
- 选品决策 → reports/product_research_{keyword}_{date}/ (json + html)
- 评论分析 → review-analysis-reports/{ASIN}_{site}_{date}/ (md + json)`,

maxTurns: 80,
permissionMode: "bypassPermissions",
```

### 4.2 server/index.ts

端口 `3005`，关键路由：

| 路由 | 方法 | 功能 |
|------|------|------|
| `/ws` | WebSocket | 实时双向通信 |
| `/api/upload` | POST | 文件上传（支持 .csv, .xlsx, .xls, .txt, .md） |
| `/api/reports` | GET | 报告文件树（扫描 reports/ + review-analysis-reports/） |
| `/api/sessions` | GET | 活跃会话列表 |
| `/api/health` | GET | 健康检查 + 环境变量状态 |
| `/reports/*` | Static | 报告文件静态服务 |
| `/review-analysis-reports/*` | Static | 评论分析报告静态服务 |

### 4.3 报告目录扫描

需扫描两个报告根目录：
- `reports/` — 竞品分析、品类选品、关键词、选品决策
- `review-analysis-reports/` — 评论分析

### 4.4 文件上传支持

| 格式 | 用途 |
|------|------|
| .csv | 亚马逊销售数据、广告数据 |
| .xlsx/.xls | 产品列表、竞品数据 |
| .txt/.md | 研究笔记、需求文档 |

---

## 五、前端设计

### 5.1 三栏布局

```
┌─────────────┬──────────────────────────┬──────────────┐
│  报告文件树   │        对话主区域          │  任务进度面板  │
│  (280px)     │        (flex-1)           │  (200px)     │
│             │                          │             │
│ 📁 reports/ │  🟢 AmazonChat           │ ⏳ 执行中... │
│  📁 analysis│                          │             │
│   📄 report │  [AI消息 / 工具调用卡片]   │ ✅ 数据采集  │
│  📁 keyword │                          │ ✅ 分析完成  │
│   📄 csv    │                          │             │
│             │                          │             │
│ ┌─────────┐│                          │             │
│ │文件预览  ││  ─────────────────────── │             │
│ │(底部展开)││  📎 [输入框] [发送]       │             │
│ └─────────┘│                          │             │
└─────────────┴──────────────────────────┴──────────────┘
```

### 5.2 欢迎页模板

4 个快速启动模板：

| 模板 | 图标 | Prompt |
|------|------|--------|
| 竞品分析 | 🔍 | `/amazon-analyse ` |
| 品类选品 | 📊 | `/category-selection ` |
| 关键词调研 | 🔑 | `/keyword-research ` |
| 评论分析 | 💬 | `/review-analysis ` |

### 5.3 进度追踪

根据工具调用追踪任务进度：
- `Bash` tool running → 数据采集中
- `Skill` tool running → 技能执行中
- `Write` tool done → 报告已保存
- 按技能类型显示不同进度阶段

### 5.4 配色方案

采用 **橙色系** 主题（区别于 data-chat 蓝、seedance-chat 紫、stock-chat 绿），呼应亚马逊品牌色：

- 主色调: `orange-600` / `orange-500`
- 发送按钮: `bg-orange-600 hover:bg-orange-500`
- Focus ring: `focus:ring-orange-500`

---

## 六、项目结构

```
amazon-chat/
├── .claude/skills/                    # 5个AI技能
│   ├── amazon-analyse/                # 竞品分析
│   │   ├── SKILL.md
│   │   └── references/               # API文档
│   ├── category-selection/            # 品类选品
│   │   ├── SKILL.md
│   │   ├── scripts/                  # 19个Python脚本
│   │   ├── references/
│   │   └── assets/
│   ├── keyword-research/              # 关键词调研
│   │   ├── SKILL.md
│   │   ├── scripts/                  # 10个Python脚本
│   │   ├── references/
│   │   └── templates/
│   ├── product-research/              # 选品决策
│   │   ├── SKILL.md
│   │   └── scripts/                  # 6个Python脚本
│   └── review-analysis/              # 评论分析
│       └── SKILL.md
├── server/
│   ├── index.ts                       # Express + WebSocket (port 3005)
│   ├── agent-client.ts                # SDK封装 + systemPrompt
│   ├── message-queue.ts               # 异步消息队列
│   └── logger.ts                      # 文件日志
├── src/
│   ├── App.tsx                        # 三栏布局 + 组件
│   ├── types.ts                       # TypeScript类型
│   └── hooks/
│       ├── useWebSocket.ts            # WebSocket管理
│       └── useFileUpload.ts           # 文件上传
├── reports/                           # 报告输出目录（自动创建）
├── uploads/                           # 上传目录（自动创建）
├── package.json
├── tsconfig.json / tsconfig.server.json
├── vite.config.ts                     # 代理 → localhost:3005
├── tailwind.config.ts
├── .env                               # API密钥 + 端口配置
└── README.md
```

---

## 七、与已有项目的差异对比

| 特性 | data-chat | seedance-chat | stock-chat | **amazon-chat** |
|------|-----------|---------------|------------|-----------------|
| 端口 | 3002 | 3003 | 3004 | **3005** |
| 技能数 | 1 | 1 | 7 | **5** |
| Bash工具 | ✅ | ❌ | ❌ | **✅（核心）** |
| Python脚本 | ❌ | ❌ | ❌ | **✅（35+个）** |
| 外部API | ❌ | ❌ | ❌ | **✅ Sorftime MCP** |
| 报告格式 | 文本 | 脚本文档 | Markdown | **MD+HTML+CSV+Excel+JSON** |
| 报告目录 | 1个 | 1个 | 1个 | **2个** |
| 上传格式 | txt/md | txt/md/doc | pdf/xlsx/csv/txt/md | **csv/xlsx/xls/txt/md** |
| 配色 | 蓝色 | 紫色 | 绿色 | **橙色** |

**核心差异**：amazon-chat 是唯一重度依赖 **Bash**（curl API调用 + Python脚本执行）和**外部数据源**（Sorftime MCP）的项目。

---

## 八、实施步骤

1. **创建项目骨架** — package.json, tsconfig, vite.config, tailwind, .env
2. **创建后端** — server/ 目录（agent-client.ts 定制 systemPrompt + allowedTools）
3. **创建前端** — src/ 目录（三栏布局，橙色主题，报告双目录扫描）
4. **部署 Skills** — 复制 amazon-skills/ 全部内容到 `.claude/skills/`
5. **安装依赖并验证** — npm install + npm run build + 端到端测试

---

## 九、注意事项

1. **Python 环境**：category-selection 和 keyword-research 的脚本需要 Python 3，确保运行环境已安装
2. **API Key 安全**：Sorftime API Key 存储在 `.mcp.json`，技能通过 Read 工具读取
3. **SSE 响应处理**：Sorftime MCP 使用 Server-Sent Events 协议，大数据响应需特殊处理
4. **脚本路径**：Python 脚本使用相对路径 `.claude/skills/{skill-name}/scripts/`，需确保工作目录正确
5. **报告目录**：需同时扫描 `reports/` 和 `review-analysis-reports/` 两个根目录
6. **maxTurns**：设为 80，部分技能（如 category-selection）流程较长
