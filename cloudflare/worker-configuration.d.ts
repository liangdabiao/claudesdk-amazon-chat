interface Env {
  ChatSandbox: DurableObjectNamespace;
  ChatProxy: DurableObjectNamespace;
  ASSETS: Fetcher;

  // Secrets (set via wrangler secret put)
  ANTHROPIC_API_KEY: string;
  SORFTIME_API_KEY: string;

  // Vars (set in wrangler.jsonc)
  MODEL: string;
  ANTHROPIC_BASE_URL: string;
}
