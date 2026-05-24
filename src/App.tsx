import { useState, useRef, useEffect, useCallback } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { useFileUpload } from "./hooks/useFileUpload";
import ReactMarkdown from "react-markdown";
import type { ChatMessage, ReportFile } from "./types";

// --- Report File Tree ---
function FileTree({ files, onFileClick, depth = 0 }: { files: ReportFile[]; onFileClick: (path: string) => void; depth?: number }) {
  return (
    <div>
      {files.map((f) => (
        <div key={f.path}>
          {f.type === "directory" ? (
            <div>
              <div className="px-2 py-1 text-xs text-gray-400 font-medium" style={{ paddingLeft: `${depth * 12 + 8}px` }}>
                📁 {f.name}
              </div>
              {f.children && <FileTree files={f.children} onFileClick={onFileClick} depth={depth + 1} />}
            </div>
          ) : (
            <button
              onClick={() => onFileClick(f.path)}
              className="w-full text-left px-2 py-1 text-xs text-gray-300 hover:bg-gray-800/50 truncate"
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              📄 {f.name}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Reports Sidebar ---
function ReportsSidebar({ files, previewPath, previewContent, onFileClick, onClosePreview, onRefresh, onCopyPreview }: {
  files: ReportFile[];
  previewPath: string | null;
  previewContent: string;
  onFileClick: (path: string) => void;
  onClosePreview: () => void;
  onRefresh: () => void;
  onCopyPreview: () => void;
}) {
  return (
    <aside className="w-[280px] border-r border-gray-800 bg-gray-900 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 shrink-0">
        <span className="text-sm font-medium text-gray-300">报告文件</span>
        <button onClick={onRefresh} className="text-xs text-gray-500 hover:text-gray-300">刷新</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {files.length === 0 && (
          <p className="text-xs text-gray-600 text-center mt-4 px-2">尚无报告，执行分析后将自动出现在这里</p>
        )}
        <FileTree files={files} onFileClick={onFileClick} />
      </div>
      {previewPath && (
        <div className="border-t border-gray-800 flex flex-col max-h-[50%]">
          <div className="flex items-center justify-between px-3 py-1 border-b border-gray-800/50 shrink-0">
            <span className="text-xs text-gray-400 truncate max-w-[180px]">{previewPath.split("/").pop()}</span>
            <div className="flex gap-1">
              <button onClick={onCopyPreview} className="text-[10px] text-gray-500 hover:text-gray-300 px-1">复制</button>
              <button onClick={onClosePreview} className="text-[10px] text-gray-500 hover:text-gray-300 px-1">关闭</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            <pre className="text-[11px] text-gray-300 whitespace-pre-wrap">{previewContent}</pre>
          </div>
        </div>
      )}
    </aside>
  );
}

// --- Tool Call Panel (right sidebar) ---
function ToolPanel({ messages }: { messages: ChatMessage[] }) {
  const toolCalls = messages.filter((m) => m.toolCall);
  if (toolCalls.length === 0) return null;

  return (
    <aside className="w-[220px] border-l border-gray-800 bg-gray-900 flex flex-col shrink-0">
      <div className="px-3 py-2 border-b border-gray-800 shrink-0">
        <span className="text-sm font-medium text-gray-300">执行日志</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {toolCalls.map((m, i) => (
          <div key={m.id} className="flex items-center gap-2 py-1.5 px-1">
            {m.toolCall!.status === "done" && <span className="text-xs">✅</span>}
            {m.toolCall!.status === "running" && (
              <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse shrink-0" />
            )}
            <span className={`text-xs ${m.toolCall!.status === "running" ? "text-yellow-300" : "text-gray-400"}`}>
              {m.toolCall!.name}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

// --- Message Bubble ---
function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-orange-600 text-white rounded-2xl rounded-br-sm px-4 py-2 max-w-[80%] whitespace-pre-wrap">
          {msg.content}
          {msg.files?.map((f) => (
            <div key={f.path} className="text-xs text-orange-200 mt-1">📎 {f.name}</div>
          ))}
        </div>
      </div>
    );
  }

  if (msg.role === "system" && msg.toolCall) {
    const tc = msg.toolCall;
    return (
      <div className="flex justify-start mb-2">
        <div className={`rounded-xl px-3 py-2 max-w-[85%] text-sm ${tc.status === "running" ? "bg-yellow-900/40 border border-yellow-700" : "bg-gray-800 border border-gray-700"}`}>
          <div className="flex items-center gap-2">
            {tc.status === "running" ? (
              <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            ) : (
              <span className="inline-block w-2 h-2 bg-green-400 rounded-full" />
            )}
            <span className="font-mono text-gray-300">{tc.name}</span>
          </div>
          {tc.status === "running" && tc.input !== undefined && tc.input !== null && (
            <pre className="text-xs text-gray-400 mt-1 max-h-20 overflow-hidden">
              {String(typeof tc.input === "string" 
                ? tc.input 
                : (JSON.stringify(tc.input as Record<string, unknown>, null, 2) || "")).slice(0, 200)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (msg.role === "system") {
    return (
      <div className="flex justify-center mb-2">
        <div className="bg-red-900/30 text-red-300 rounded-lg px-4 py-2 text-sm">{msg.content}</div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="bg-gray-800 text-gray-100 rounded-2xl rounded-bl-sm px-4 py-2 max-w-[85%] prose prose-invert prose-sm">
        <ReactMarkdown
          components={{
            table: ({ children }) => (
              <div className="overflow-x-auto my-2">
                <table className="min-w-full text-sm">{children}</table>
              </div>
            ),
          }}
        >
          {msg.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// --- Welcome Screen ---
function WelcomeScreen({ onSelect }: { onSelect: (text: string) => void }) {
  const templates = [
    { icon: "🔍", title: "竞品分析", desc: "输入ASIN，对竞品Listing进行四维穿透分析", prompt: "/amazon-analyse " },
    { icon: "📊", title: "品类选品", desc: "五维评分模型分析品类市场机会", prompt: "/category-selection " },
    { icon: "🔑", title: "关键词调研", desc: "2000+关键词采集与智能分类", prompt: "/keyword-research " },
    { icon: "💬", title: "评论分析", desc: "差评痛点分析与改进建议", prompt: "/review-analysis " },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
      <span className="text-5xl">📦</span>
      <p className="text-lg text-gray-300">AmazonChat — AI 亚马逊卖家调研助手</p>
      <p className="text-sm">输入 ASIN 或品类关键词开始分析，或选择一个模板</p>
      <div className="grid grid-cols-2 gap-3 mt-4 max-w-md">
        {templates.map((t) => (
          <button
            key={t.title}
            onClick={() => onSelect(t.prompt)}
            className="bg-gray-800/60 hover:bg-gray-700/60 rounded-xl px-4 py-3 text-left transition-colors border border-gray-700/50 hover:border-gray-600"
          >
            <span className="text-lg">{t.icon}</span>
            <p className="text-sm text-gray-200 mt-1">{t.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Main App ---
export default function App() {
  const { messages, sendMessage, isConnected, isThinking } = useWebSocket();
  const { uploading, uploadedFiles, upload, clearFiles } = useFileUpload();
  const [input, setInput] = useState("");
  const [reportFiles, setReportFiles] = useState<ReportFile[]>([]);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refreshReports = useCallback(async () => {
    try {
      const res = await fetch("/api/reports");
      if (res.ok) {
        const data = await res.json();
        setReportFiles(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refreshReports(); }, [messages, refreshReports]);

  const openPreview = useCallback(async (relPath: string) => {
    try {
      const res = await fetch(`/${relPath}`);
      const text = await res.text();
      setPreviewContent(text);
      setPreviewPath(relPath);
    } catch {
      setPreviewContent("无法加载文件内容");
      setPreviewPath(relPath);
    }
  }, []);

  const handleSend = useCallback((text?: string) => {
    const content = text || input.trim();
    if (!content && !uploadedFiles.length) return;
    sendMessage(content, uploadedFiles.length ? uploadedFiles : undefined);
    setInput("");
    clearFiles();
  }, [input, uploadedFiles, sendMessage, clearFiles]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) await upload(file);
  };

  return (
    <div className="h-screen flex bg-gray-950 text-gray-100">
      <ReportsSidebar
        files={reportFiles}
        previewPath={previewPath}
        previewContent={previewContent}
        onFileClick={openPreview}
        onClosePreview={() => setPreviewPath(null)}
        onRefresh={refreshReports}
        onCopyPreview={() => navigator.clipboard.writeText(previewContent)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">📦</span>
            <h1 className="text-lg font-semibold">AmazonChat</h1>
            <span className="text-xs text-gray-500">AI 亚马逊卖家调研助手</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400" : "bg-red-400"}`} />
            <span className="text-xs text-gray-500">{isConnected ? "已连接" : "断开"}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <WelcomeScreen onSelect={handleSend} />
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
          )}
          {isThinking && (
            <div className="flex justify-start mb-2">
              <div className="bg-gray-800 rounded-2xl px-4 py-2 text-gray-400 text-sm flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
                分析中...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </main>

        {uploadedFiles.length > 0 && (
          <div className="px-4 py-2 bg-gray-900 border-t border-gray-800 flex items-center gap-2 flex-wrap">
            {uploadedFiles.map((f) => (
              <span key={f.path} className="bg-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300">📎 {f.name}</span>
            ))}
            <button onClick={clearFiles} className="text-xs text-red-400 hover:text-red-300 ml-2">清除</button>
          </div>
        )}

        <div className="px-4 py-3 border-t border-gray-800 bg-gray-900 shrink-0">
          <div className="flex items-end gap-2">
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xlsx,.xls,.txt,.md" multiple onChange={(e) => handleFileSelect(e.target.files)} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors" title="上传文件">
              {uploading ? "⏳" : "📎"}
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入 ASIN 或品类关键词，如「/amazon-analyse B07PWTJ4H1 US」..."
              rows={1}
              className="flex-1 bg-gray-800 text-gray-100 rounded-xl px-4 py-2 resize-none outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500"
            />
            <button
              onClick={() => handleSend()}
              disabled={(!input.trim() && !uploadedFiles.length) || !isConnected}
              className="p-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
            >
              ➤
            </button>
          </div>
        </div>
      </div>

      <ToolPanel messages={messages} />
    </div>
  );
}
