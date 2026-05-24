import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "path";
import dotenv from "dotenv";
import { MessageQueue } from "./message-queue.js";
import { fileLog } from "./logger.js";

dotenv.config({ override: true });

export interface SDKMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: {
    role: string;
    content: any;
  };
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
}

export class AgentSession {
  private queue: MessageQueue;
  private outputIterator: AsyncIterator<SDKMessage> | null = null;
  public sdkSessionId: string | null = null;
  private started = false;

  constructor() {
    this.queue = new MessageQueue();
  }

  private ensureStarted() {
    if (this.started) return;
    this.started = true;

    fileLog("Agent", "Starting SDK | MODEL:", process.env.MODEL || "sonnet", "| BASE_URL:", process.env.ANTHROPIC_BASE_URL || "(default)");

    try {
      const stream = query({
        prompt: this.queue as any,
        options: {
          cwd: path.resolve(process.cwd()),
          settingSources: ["project"],
          allowedTools: [
            "Skill", "Task", "Bash",
            "Read", "Write", "Glob", "Grep",
            "WebSearch", "TodoWrite",
          ],
          systemPrompt: `你是 AmazonChat，一个专业的 AI 亚马逊卖家调研助手。

你拥有 5 个专业技能：

一、竞品分析
- amazon-analyse：对竞品Listing进行四维穿透分析（文案逻辑、产品表现、评论洞察、市场动态）。触发：/amazon-analyse {ASIN} {站点}

二、品类与选品
- category-selection：基于五维评分模型的品类自动化选品分析。触发：/category-selection {品类} {站点}
- product-research：LLM驱动的两阶段深度选品（数据采集+分析决策）。触发：/product-research {关键词} {站点}

三、关键词与评论
- keyword-research：2000+关键词深度采集与8维度LLM智能分类。触发：/keyword-research {ASIN} {站点}
- review-analysis：差评痛点分类、6维分析、改进建议和客服模板。触发：/review-analysis {ASIN} {站点}

工作原则：
1. 所有数据通过 Sorftime MCP API 获取（使用 curl 调用）
2. API Key 从 .mcp.json 文件读取
3. 使用 Python 脚本处理数据和生成报告
4. 报告输出到 reports/ 目录，按技能类型组织
5. 用中文回复用户
6. 支持的亚马逊站点：US, GB, DE, FR, IN, CA, JP, ES, IT, MX, AE, AU, BR, SA

文件输出：
- 竞品分析 → reports/analysis_{ASIN}_{site}_{date}.md
- 品类选品 → reports/{category}_analysis_{date}/ (md + html + xlsx)
- 关键词   → reports/keyword_analysis_{ASIN}_{date}/ (md + csv + html)
- 选品决策 → reports/product_research_{keyword}_{date}/ (json + html)
- 评论分析 → review-analysis-reports/{ASIN}_{site}_{date}/ (md + json)

用户上传的文件在 uploads/ 目录下。`,
          maxTurns: 80,
          model: process.env.MODEL || "sonnet",
          permissionMode: "bypassPermissions",
          stderr: (data: string) => {
            fileLog("SDK.stderr", data.replace(/\n$/, ""));
          },
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
            ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
          },
        },
      });

      this.outputIterator = stream[Symbol.asyncIterator]();
    } catch (e) {
      fileLog("Agent", "FAILED to start:", e);
      this.started = false;
    }
  }

  sendMessage(content: string) {
    fileLog("UserMsg", content);
    this.ensureStarted();
    this.queue.push(content);
  }

  async *getOutputStream(): AsyncGenerator<SDKMessage> {
    while (!this.outputIterator) {
      await new Promise((r) => setTimeout(r, 50));
    }

    while (true) {
      try {
        const { value, done } = await this.outputIterator.next();
        if (done) break;
        if (value?.type === "system" && value?.subtype === "init") {
          this.sdkSessionId = value.session_id ?? null;
          fileLog("Agent", "Session init:", this.sdkSessionId);
        } else {
          this.logSDKMessage(value);
        }
        yield value;
      } catch (e) {
        fileLog("Agent", "Stream error:", e);
        break;
      }
    }
  }

  private logSDKMessage(msg: SDKMessage) {
    if (msg.type === "assistant" && msg.message) {
      for (const block of msg.message.content) {
        if (block.type === "text" && block.text) {
          fileLog("AI", block.text.substring(0, 200));
        }
        if (block.type === "tool_use") {
          fileLog("ToolCall", block.name, JSON.stringify(block.input));
        }
      }
    }
    if (msg.type === "result") {
      fileLog("Result", msg.subtype || "", "cost:", msg.total_cost_usd, "duration:", msg.duration_ms + "ms");
    }
  }

  close() {
    this.queue.close();
  }
}
