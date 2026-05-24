import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage, WSMessage } from "../types";

const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", chatId: "default" }));
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (!mountedRef.current) return;
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onmessage = (event) => {
      const data: WSMessage = JSON.parse(event.data);

      switch (data.type) {
        case "user_message":
          break;

        case "assistant_message":
          setIsThinking(false);
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: data.content || "",
              timestamp: Date.now(),
            },
          ]);
          break;

        case "tool_use":
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "system",
              content: "",
              toolCall: {
                name: data.toolName || "unknown",
                input: data.toolInput,
                status: "running",
              },
              timestamp: Date.now(),
            },
          ]);
          break;

        case "result":
          setIsThinking(false);
          setMessages((prev) => {
            const idx = [...prev].reverse().findIndex((m) => m.toolCall);
            if (idx === -1) return prev;
            const actualIdx = prev.length - 1 - idx;
            const updated = [...prev];
            updated[actualIdx] = {
              ...updated[actualIdx],
              toolCall: updated[actualIdx].toolCall
                ? { ...updated[actualIdx].toolCall!, status: "done" }
                : undefined,
            };
            return updated;
          });
          break;

        case "error":
          setIsThinking(false);
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "system",
              content: `错误: ${data.error || "未知错误"}`,
              timestamp: Date.now(),
            },
          ]);
          break;
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendMessage = useCallback((content: string, files?: Array<{ name: string; path: string }>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const fileNote = files?.length
      ? `\n\n已上传文件: ${files.map((f) => `${f.name} (${f.path})`).join(", ")}`
      : "";

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: content + (files?.length ? `\n📎 ${files.map((f) => f.name).join(", ")}` : ""),
        timestamp: Date.now(),
        files,
      },
    ]);

    setIsThinking(true);
    wsRef.current.send(
      JSON.stringify({ type: "chat", chatId: "default", content: content + fileNote })
    );
  }, []);

  return { messages, sendMessage, isConnected, isThinking };
}
