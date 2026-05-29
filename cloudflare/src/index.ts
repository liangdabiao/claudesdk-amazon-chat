import { getSandbox, Sandbox as BaseSandbox } from "@cloudflare/sandbox";

// ---------------------------------------------------------------------------
// Sandbox subclass — network policy for the container
// ---------------------------------------------------------------------------
export class ChatSandbox extends BaseSandbox<Env> {
  // Container needs outbound internet for:
  //  - api.deepseek.com (LLM inference)
  //  - mcp.sorftime.com  (market data API)
  //  - general web search
  enableInternet = true;
}

// ---------------------------------------------------------------------------
// ChatProxy Durable Object — bidirectional WebSocket proxy
// ---------------------------------------------------------------------------
export class ChatProxy implements DurableObject {
  private browserWs: WebSocket | null = null;
  private containerWs: WebSocket | null = null;
  private env: Env;

  constructor(_ctx: DurableObjectState, env: Env) {
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // Only handle WebSocket upgrades
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    // Create browser-side WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.browserWs = server;

    // Connect to container's WebSocket via sandbox internal network
    try {
      const sandbox = getSandbox(this.env.ChatSandbox, "amazon-chat-default");
      const containerWsReq = new Request("http://container/ws", {
        headers: { Upgrade: "websocket", Connection: "Upgrade" },
      });
      const containerWsRes = await sandbox.fetch(containerWsReq);

      if (!containerWsRes.webSocket) {
        this.browserWs.close(1011, "Failed to connect to container");
        return new Response(null, { status: 101, webSocket: client });
      }

      this.containerWs = containerWsRes.webSocket;
      this.containerWs.accept();

      // Browser → Container
      this.browserWs.addEventListener("message", (event) => {
        try {
          this.containerWs?.send(event.data as string);
        } catch {
          // Container WS closed
        }
      });

      // Container → Browser
      this.containerWs.addEventListener("message", (event) => {
        try {
          this.browserWs?.send(event.data as string);
        } catch {
          // Browser WS closed
        }
      });

      // Cleanup on close
      this.browserWs.addEventListener("close", () => {
        this.containerWs?.close();
        this.containerWs = null;
        this.browserWs = null;
      });

      this.containerWs.addEventListener("close", () => {
        this.browserWs?.close();
        this.browserWs = null;
        this.containerWs = null;
      });

      this.containerWs.addEventListener("error", () => {
        this.browserWs?.close(1011, "Container connection error");
        this.containerWs = null;
      });

      this.browserWs.addEventListener("error", () => {
        this.containerWs?.close();
        this.browserWs = null;
      });
    } catch (err) {
      this.browserWs.close(1011, `Sandbox error: ${err}`);
    }

    return new Response(null, { status: 101, webSocket: client });
  }
}

// ---------------------------------------------------------------------------
// Worker — HTTP proxy + static assets
// ---------------------------------------------------------------------------
function proxyToContainer(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const sandbox = getSandbox(env.ChatSandbox, "amazon-chat-default");
  const url = new URL(request.url);
  url.hostname = "container";
  url.protocol = "http:";
  url.port = "";
  // Keep original pathname
  url.pathname = pathname;

  const headers = new Headers(request.headers);
  headers.delete("host");

  return sandbox.fetch(
    new Request(url.toString(), {
      method: request.method,
      headers,
      body: request.body,
    })
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // WebSocket → ChatProxy DO
    if (pathname === "/ws") {
      const id = env.ChatProxy.idFromName("default");
      const stub = env.ChatProxy.get(id);
      return stub.fetch(request);
    }

    // API routes → proxy to container
    if (pathname.startsWith("/api/")) {
      const res = await proxyToContainer(request, env, pathname);
      const response = new Response(res.body, res);
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    // Report files → proxy to container
    if (
      pathname.startsWith("/reports/") ||
      pathname.startsWith("/review-analysis-reports/")
    ) {
      return proxyToContainer(request, env, pathname);
    }

    // Static assets (frontend SPA)
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status !== 404) return assetRes;

      // SPA fallback
      return env.ASSETS.fetch(
        new Request(new URL("/index.html", request.url).toString())
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
