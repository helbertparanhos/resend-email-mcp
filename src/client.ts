/**
 * Thin, dependency-free HTTP client for the Resend REST API.
 *
 * We call the REST API directly (instead of the `resend` SDK) so we can reach
 * every endpoint — including ones the SDK does not expose (logs, received
 * emails, templates) — and surface rich, actionable errors.
 */

export interface ResendClientOptions {
  baseUrl?: string;
  maxRetries?: number;
  /** Injectable fetch — defaults to global fetch (Node 18+). */
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  /** JSON request body (object will be serialized). */
  body?: unknown;
  /** Query-string params; undefined/null values are skipped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Idempotency-Key header for safe retries of POSTs. */
  idempotencyKey?: string;
}

/**
 * Error thrown for any non-2xx response. Carries the HTTP status, the parsed
 * Resend error body, and a human hint so the LLM can self-correct.
 */
export class ResendError extends Error {
  status: number;
  resendName?: string;
  body: unknown;
  hint?: string;

  constructor(opts: {
    message: string;
    status: number;
    resendName?: string;
    body: unknown;
    hint?: string;
  }) {
    super(opts.message);
    this.name = "ResendError";
    this.status = opts.status;
    this.resendName = opts.resendName;
    this.body = opts.body;
    this.hint = opts.hint;
  }

  /** Compact representation returned to the model. */
  toReadable(): string {
    const parts = [
      `Resend API error (HTTP ${this.status}${this.resendName ? ` / ${this.resendName}` : ""}): ${this.message}`,
    ];
    if (this.hint) parts.push(`Hint: ${this.hint}`);
    return parts.join("\n");
  }
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** Maps common Resend error names to an actionable hint. */
function hintFor(status: number, name?: string): string | undefined {
  switch (name) {
    case "validation_error":
      return "Check required fields and formats. For sends, `from` must use a verified domain.";
    case "missing_api_key":
    case "invalid_api_key":
    case "restricted_api_key":
      return "Verify RESEND_API_KEY. Create or check key permissions at https://resend.com/api-keys";
    case "not_found":
      return "The ID does not exist (or belongs to another account). List the resource first to get a valid ID.";
    case "rate_limit_exceeded":
      return "You hit the rate limit. The client already retries with backoff; reduce request volume.";
    case "daily_quota_exceeded":
      return "Daily send quota reached. Upgrade the plan or wait for the quota to reset.";
    case "invalid_from_address":
      return "The `from` address domain must be verified. Run diagnose_domain to check it.";
    case "not_authorized":
      return "This API key lacks permission for that action. Use a full-access key.";
    default:
      if (status === 401) return "Authentication failed — check RESEND_API_KEY.";
      if (status === 404) return "Resource not found — confirm the ID.";
      if (status === 422) return "Unprocessable entity — a field failed validation.";
      if (status === 429) return "Rate limited — slow down request volume.";
      if (status >= 500) return "Resend server error — retry later.";
      return undefined;
  }
}

export class ResendClient {
  private baseUrl: string;
  private baseOrigin: string;
  private maxRetries: number;
  private fetchImpl: typeof fetch;

  constructor(
    private apiKey: string,
    opts: ResendClientOptions = {}
  ) {
    if (!apiKey) {
      throw new Error(
        "RESEND_API_KEY is required. Set it in the environment (get one at https://resend.com/api-keys)."
      );
    }
    const rawBase = (opts.baseUrl ?? "https://api.resend.com").replace(/\/+$/, "");

    // Validate the base URL: must be a valid https URL (http allowed only for localhost).
    // Prevents leaking the API key to an attacker-controlled host via a planted RESEND_BASE_URL.
    let parsedBase: URL;
    try {
      parsedBase = new URL(rawBase);
    } catch {
      throw new Error(`RESEND_BASE_URL is not a valid URL: "${rawBase}".`);
    }
    const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(parsedBase.hostname);
    if (parsedBase.protocol !== "https:" && !(parsedBase.protocol === "http:" && isLocalhost)) {
      throw new Error(
        `RESEND_BASE_URL must use https (http is allowed only for localhost). Got "${rawBase}".`
      );
    }

    this.baseUrl = rawBase;
    this.baseOrigin = parsedBase.origin;
    this.maxRetries = opts.maxRetries ?? 3;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(this.baseUrl + normalizedPath);

    // Defense-in-depth: never let a crafted path (e.g. starting with "@" or "//")
    // redirect the request — and the Authorization header — to a different host.
    if (url.origin !== this.baseOrigin) {
      throw new Error(
        `Refusing request: path "${path}" would change the target host from ${this.baseOrigin} to ${url.origin}.`
      );
    }

    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: RequestOptions = {}
  ): Promise<T> {
    const url = this.buildUrl(path, opts.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": "resend-email-mcp",
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    let attempt = 0;
    let lastErr: unknown;

    while (attempt <= this.maxRetries) {
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });

        const text = await res.text();
        const parsed = text ? safeJson(text) : undefined;

        if (res.ok) return parsed as T;

        // Retry on transient failures.
        if (RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries) {
          await sleep(backoffMs(attempt, res.headers.get("retry-after")));
          attempt++;
          continue;
        }

        const errObj =
          parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
        const name = typeof errObj.name === "string" ? errObj.name : undefined;
        const message =
          (typeof errObj.message === "string" && errObj.message) ||
          `Request failed with status ${res.status}`;

        throw new ResendError({
          message,
          status: res.status,
          resendName: name,
          body: parsed ?? text,
          hint: hintFor(res.status, name),
        });
      } catch (err) {
        if (err instanceof ResendError) throw err;
        // Network/transient errors — retry, then give up with context.
        lastErr = err;
        if (attempt < this.maxRetries) {
          await sleep(backoffMs(attempt, null));
          attempt++;
          continue;
        }
        throw new ResendError({
          message: `Network error calling Resend: ${(err as Error).message}`,
          status: 0,
          body: null,
          hint: "Check connectivity and that RESEND_BASE_URL is reachable.",
        });
      }
    }

    throw lastErr instanceof Error ? lastErr : new Error("Unknown request failure");
  }

  get<T = unknown>(path: string, query?: RequestOptions["query"]) {
    return this.request<T>("GET", path, { query });
  }
  post<T = unknown>(path: string, body?: unknown, idempotencyKey?: string) {
    return this.request<T>("POST", path, { body, idempotencyKey });
  }
  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, { body });
  }
  put<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, { body });
  }
  delete<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("DELETE", path, { body });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Exponential backoff with jitter; honors Retry-After when present. */
function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (!Number.isNaN(secs)) return Math.min(secs * 1000, 30_000);
  }
  const base = Math.min(1000 * 2 ** attempt, 8000);
  return base + Math.floor(Math.random() * 250);
}
