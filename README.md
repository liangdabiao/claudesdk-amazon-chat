# AmazonChat — AI 亚马逊卖家调研助手

基于 **Claude Agent SDK** 构建的 AI 亚马逊卖家调研 Web 应用。用户通过自然语言对话即可调用 5 个专业运营技能，完成竞品分析、品类选品、关键词调研、选品决策、评论分析等全链路工作。

## 架构

```
用户浏览器 (React + Tailwind)
    ↕ WebSocket + REST API
Express Server (port 3005)
    ↕ Claude Agent SDK
Claude AI + 5 Amazon Skills
    ↕ Bash (curl)
Sorftime MCP API (34个数据接口)
```

## 核心功能

- **竞品分析** — 输入 ASIN，对竞品 Listing 进行四维穿透分析（文案逻辑、产品表现、评论洞察、市场动态）
- **品类选品** — 五维评分模型分析品类市场机会（市场规模、增长潜力、竞争烈度、进入壁垒、利润空间）
- **关键词调研** — 2000+ 关键词深度采集 + LLM 8 维度智能分类
- **选品决策** — 两阶段深度选品（数据采集 + LLM 分析决策）
- **评论分析** — 差评痛点分类、6 维分析、改进建议和客服回复模板
- **文件上传** — 支持 CSV、Excel、TXT、MD
- **报告文件树** — 左侧边栏实时展示生成的报告目录结构
- **执行日志** — 右侧面板显示工具调用实时状态

## 5 个专业技能

| 技能 | 触发命令 | 说明 | 输出 |
|------|----------|------|------|
| amazon-analyse | `/amazon-analyse {ASIN} {站点}` | 竞品四维穿透分析 | Markdown 报告 |
| category-selection | `/category-selection {品类} {站点}` | 五维评分品类选品 | MD + HTML + Excel |
| keyword-research | `/keyword-research {ASIN} {站点}` | 2000+ 关键词采集分类 | MD + CSV + HTML |
| product-research | `/product-research {关键词} {站点}` | LLM 驱动深度选品 | JSON + HTML |
| review-analysis | `/review-analysis {ASIN} {站点}` | 差评痛点分析 | MD + JSON |

## 数据源：Sorftime MCP API

所有技能共享 Sorftime MCP 作为统一数据源，覆盖 **34 个 API 端点**：

- 亚马逊产品接口 (9个)：product_detail, product_reviews, product_trend 等
- 亚马逊类目接口 (7个)：category_report, category_trend 等
- 亚马逊关键词接口 (4个)：keyword_detail, keyword_related_words 等
- 关键词词库管理 (5个)
- 1688 采购平台 (1个)
- TikTok 电商接口 (8个)

## 技术栈

- **后端**: Express + WebSocket + Claude Agent SDK
- **前端**: React 18 + Tailwind CSS 4 + Vite 6
- **AI**: Claude Agent SDK（支持 DeepSeek API 兼容模式）
- **数据**: Sorftime MCP API
- **脚本**: Python 3（35+ 数据处理和报告生成脚本）

## 快速开始

### 1. 安装依赖

```bash
cd amazon-chat
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
ANTHROPIC_API_KEY=your-api-key
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
MODEL=deepseek-v4-flash
PORT=3005
```

### 3. 启动开发服务器

```bash
npm run dev
```

浏览器访问 Vite 显示的地址（自动代理到 3005 端口）。

### 4. 生产构建

```bash
npm run build
npm start
```

## 项目结构

```
amazon-chat/
├── .claude/skills/                # 5 个 AI 技能
│   ├── amazon-analyse/            # 竞品分析
│   │   ├── SKILL.md
│   │   └── references/            # API 文档
│   ├── category-selection/        # 品类选品
│   │   ├── SKILL.md
│   │   ├── scripts/               # 19 个 Python 脚本
│   │   └── references/
│   ├── keyword-research/          # 关键词调研
│   │   ├── SKILL.md
│   │   ├── scripts/               # 10 个 Python 脚本
│   │   └── templates/
│   ├── product-research/          # 选品决策
│   │   ├── SKILL.md
│   │   └── scripts/               # 6 个 Python 脚本
│   └── review-analysis/          # 评论分析
│       └── SKILL.md
├── server/
│   ├── index.ts                   # Express + WebSocket (port 3005)
│   ├── agent-client.ts            # SDK 封装 + systemPrompt
│   ├── message-queue.ts           # 异步消息队列
│   └── logger.ts                  # 文件日志
├── src/
│   ├── App.tsx                    # 三栏布局主界面
│   ├── types.ts                   # TypeScript 类型定义
│   └── hooks/
│       ├── useWebSocket.ts        # WebSocket 连接管理
│       └── useFileUpload.ts       # 文件上传管理
├── reports/                       # 分析报告（自动创建）
├── review-analysis-reports/       # 评论分析报告（自动创建）
├── uploads/                       # 上传文件（自动创建）
└── package.json
```

## 使用方法

1. 打开浏览器，看到欢迎页面和 4 个模板卡片
2. 在输入框输入命令或自然语言，如「/amazon-analyse B07PWTJ4H1 US」
3. 或直接说「帮我分析这个产品 B07PWTJ4H1 US」，AI 会自动识别意图
4. 或点击模板卡片快速开始
5. 左侧边栏实时展示生成的报告文件，点击可预览
6. 右侧面板追踪工具调用状态（Bash、Skill、Write 等）
7. 支持上传 CSV/Excel 文件辅助分析

## 支持的亚马逊站点

US、GB、DE、FR、IN、CA、JP、ES、IT、MX、AE、AU、BR、SA

## 注意事项

- 部分技能（category-selection、keyword-research）依赖 Python 3 脚本，确保运行环境已安装 Python
- Sorftime API Key 存储在项目根目录的 `.mcp.json` 中，技能通过 Read 工具自动读取
- Sorftime MCP 使用 SSE (Server-Sent Events) 协议，大数据响应由 Python 脚本处理
- 本工具仅做结构化数据分析辅助，不提供商业决策建议


## 感谢和参考
https://linux.do/  感谢佬友，

https://github.com/liangdabiao/claudesdk-skill  AI生成claude-agent-sdk 项目