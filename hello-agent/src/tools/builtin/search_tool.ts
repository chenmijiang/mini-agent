import { search as duckDuckGoSearch } from "duck-duck-scrape";

import { Tool, ToolParameter } from "../base";

const SEARCH_BACKENDS = [
  "hybrid",
  "advanced",
  "tavily",
  "serpapi",
  "duckduckgo",
  "searxng",
  "perplexity",
] as const;

type SearchBackend = (typeof SEARCH_BACKENDS)[number];
type JsonObject = Record<string, unknown>;

interface TavilyResult extends JsonObject {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  raw_content?: unknown;
}

interface TavilyResponse extends JsonObject {
  results?: unknown;
  answer?: unknown;
}

interface SerpapiResult extends JsonObject {
  title?: unknown;
  link?: unknown;
  snippet?: unknown;
}

interface SerpapiResponse extends JsonObject {
  answer_box?: unknown;
  organic_results?: unknown;
}

interface SerpapiAnswerBox extends JsonObject {
  answer?: unknown;
  snippet?: unknown;
}

interface DuckDuckGoResult extends JsonObject {
  title?: unknown;
  url?: unknown;
  description?: unknown;
}

interface DuckDuckGoResponse extends JsonObject {
  results?: unknown;
}

interface SearxngResult extends JsonObject {
  title?: unknown;
  url?: unknown;
  link?: unknown;
  content?: unknown;
  snippet?: unknown;
}

interface SearxngResponse extends JsonObject {
  results?: unknown;
}

interface PerplexityMessage extends JsonObject {
  content?: unknown;
}

interface PerplexityChoice extends JsonObject {
  message?: unknown;
}

interface PerplexityResponse extends JsonObject {
  choices?: unknown;
  citations?: unknown;
}

export interface SearchResult extends Record<string, unknown> {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
}

export interface SearchPayload extends Record<string, unknown> {
  results: SearchResult[];
  backend: string;
  answer: string | null;
  notices: string[];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readString(parameters: JsonObject, name: string): string | undefined {
  const value = parameters[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  return value;
}

function readInteger(parameters: JsonObject, name: string, fallback: number): number {
  const value = parameters[name];
  if (value === undefined) return fallback;

  let parsed: number;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
    parsed = Number(value.trim());
  } else {
    throw new TypeError(`${name} must be an integer`);
  }

  if (!Number.isSafeInteger(parsed)) throw new TypeError(`${name} must be a finite integer`);
  return parsed;
}

function normalizeBackend(value: string): SearchBackend | undefined {
  const normalized = value.toLowerCase() as SearchBackend;
  return SEARCH_BACKENDS.includes(normalized) ? normalized : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncateRawContent(value: string, maxTokensPerSource: number): string {
  const characters = Array.from(value);
  const maxCharacters = maxTokensPerSource * 4;
  return characters.length > maxCharacters
    ? `${characters.slice(0, maxCharacters).join("")}... [truncated]`
    : value;
}

function makeResult(
  title: unknown,
  url: unknown,
  content: unknown,
  rawContent?: unknown,
): SearchResult {
  const normalizedUrl = asString(url) ?? "";
  const result: SearchResult = {
    title: asString(title) || normalizedUrl,
    url: normalizedUrl,
    content: asString(content) || "",
  };
  if (rawContent !== null && rawContent !== undefined && typeof rawContent === "string") {
    result.raw_content = rawContent;
  }
  return result;
}

function makePayload(
  results: SearchResult[],
  backend: string,
  answer: string | null = null,
  notices: string[] = [],
): SearchPayload {
  return { results, backend, answer, notices };
}

function responseObject<T extends object>(value: unknown, service: string): T {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${service} returned an invalid response`);
  }
  return value as T;
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMilliseconds = 10_000,
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMilliseconds),
  });
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
    );
  }
  return response.json() as Promise<unknown>;
}

async function requestText(url: string, timeoutMilliseconds = 10_000): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMilliseconds) });
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
    );
  }
  return response.text();
}

function formatSearchResult(query: string, payload: SearchPayload): string {
  const lines = [`🔍 搜索关键词：${query}`, `🧭 使用搜索源：${payload.backend}`];
  if (payload.answer) lines.push(`💡 直接答案：${payload.answer}`);

  if (payload.results.length === 0) {
    lines.push("❌ 未找到相关搜索结果。");
  } else {
    lines.push("", "📚 参考来源：");
    payload.results.forEach((result, index) => {
      lines.push(`[${index + 1}] ${result.title}`);
      if (result.content) lines.push(`    ${result.content}`);
      if (result.url) lines.push(`    来源: ${result.url}`);
      lines.push("");
    });
  }

  if (payload.notices.length > 0) {
    lines.push("⚠️ 注意事项：", ...payload.notices.map((notice) => `- ${notice}`));
  }
  return lines.join("\n");
}

export class SearchTool extends Tool {
  readonly backend: SearchBackend;
  readonly availableBackends: SearchBackend[];
  readonly searxngUrl: string;
  private readonly tavilyKey?: string;
  private readonly serpapiKey?: string;
  private readonly perplexityKey?: string;

  constructor(backend = "hybrid", tavilyKey?: string, serpapiKey?: string, perplexityKey?: string) {
    super("search", "使用多个搜索源搜索网页，并返回文本或结构化结果");
    if (typeof backend !== "string") throw new TypeError("backend must be a string");
    for (const [name, key] of [
      ["tavilyKey", tavilyKey],
      ["serpapiKey", serpapiKey],
      ["perplexityKey", perplexityKey],
    ] as const) {
      if (key !== undefined && typeof key !== "string")
        throw new TypeError(`${name} must be a string`);
    }

    this.tavilyKey = tavilyKey || process.env.TAVILY_API_KEY || undefined;
    this.serpapiKey = serpapiKey || process.env.SERPAPI_API_KEY || undefined;
    this.perplexityKey = perplexityKey || process.env.PERPLEXITY_API_KEY || undefined;
    this.searxngUrl = (process.env.SEARXNG_URL || "http://localhost:8888").replace(/\/+$/, "");

    this.availableBackends = [];
    if (this.tavilyKey) this.availableBackends.push("tavily");
    if (this.serpapiKey) this.availableBackends.push("serpapi");

    const requestedBackend = normalizeBackend(backend);
    this.backend =
      requestedBackend === undefined ||
      (requestedBackend === "tavily" && !this.tavilyKey) ||
      (requestedBackend === "serpapi" && !this.serpapiKey)
        ? "hybrid"
        : requestedBackend;
  }

  getParameters(): ToolParameter[] {
    return [
      new ToolParameter({
        name: "input",
        type: "string",
        description: "搜索关键词",
        required: true,
      }),
      new ToolParameter({
        name: "query",
        type: "string",
        description: "搜索关键词",
        required: false,
      }),
      new ToolParameter({
        name: "backend",
        type: "string",
        description: "搜索源",
        required: false,
      }),
      new ToolParameter({ name: "mode", type: "string", description: "返回模式", required: false }),
      new ToolParameter({
        name: "return_mode",
        type: "string",
        description: "返回模式",
        required: false,
      }),
      new ToolParameter({
        name: "fetch_full_page",
        type: "boolean",
        description: "获取完整网页内容",
        required: false,
        default: false,
      }),
      new ToolParameter({
        name: "max_results",
        type: "integer",
        description: "最大搜索结果数",
        required: false,
        default: 5,
      }),
      new ToolParameter({
        name: "max_tokens_per_source",
        type: "integer",
        description: "每个来源的最大内容长度（token）",
        required: false,
        default: 2000,
      }),
      new ToolParameter({
        name: "loop_count",
        type: "integer",
        description: "搜索循环计数",
        required: false,
        default: 0,
      }),
    ];
  }

  async run(parameters: Record<string, unknown>): Promise<string | SearchPayload> {
    if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
      throw new TypeError("parameters must be an object");
    }
    const values = parameters as JsonObject;

    const input = readString(values, "input");
    const suppliedQuery = readString(values, "query");
    const query = (input || suppliedQuery || "").trim();
    if (!query) return "错误：搜索查询不能为空";

    const requestedBackend = readString(values, "backend");
    const backend =
      requestedBackend === undefined
        ? this.backend
        : (normalizeBackend(requestedBackend) ?? "hybrid");
    const providedMode = readString(values, "mode");
    const providedReturnMode = readString(values, "return_mode");
    const mode = (providedMode || providedReturnMode || "text").toLowerCase();
    const fullPageValue = values.fetch_full_page;
    if (fullPageValue !== undefined && typeof fullPageValue !== "boolean") {
      throw new TypeError("fetch_full_page must be a boolean");
    }
    const fetchFullPage = fullPageValue ?? false;
    const maxResults = readInteger(values, "max_results", 5);
    const maxTokensPerSource = readInteger(values, "max_tokens_per_source", 2000);
    const loopCount = readInteger(values, "loop_count", 0);

    const payload = await this.searchBackend(query, backend, {
      fetchFullPage,
      maxResults,
      maxTokensPerSource,
      loopCount,
    });
    return ["structured", "json", "dict"].includes(mode)
      ? payload
      : formatSearchResult(query, payload);
  }

  private async searchBackend(
    query: string,
    backend: SearchBackend,
    options: {
      fetchFullPage: boolean;
      maxResults: number;
      maxTokensPerSource: number;
      loopCount: number;
    },
  ): Promise<SearchPayload> {
    switch (backend) {
      case "tavily":
        if (!this.tavilyKey) throw new Error("Tavily 搜索需要设置 TAVILY_API_KEY");
        return this.searchTavilyProvider(query, this.tavilyKey, options);
      case "serpapi":
        if (!this.serpapiKey) throw new Error("SerpApi 搜索需要设置 SERPAPI_API_KEY");
        return this.searchSerpapiProvider(query, this.serpapiKey, options);
      case "duckduckgo":
        return this.searchDuckDuckGoProvider(query, options);
      case "searxng":
        return this.searchSearxngProvider(query, options);
      case "perplexity":
        if (!this.perplexityKey) throw new Error("Perplexity 搜索需要设置 PERPLEXITY_API_KEY");
        return this.searchPerplexityProvider(query, this.perplexityKey, options);
      case "hybrid":
      case "advanced":
        return this.searchHybridProvider(query, options);
    }
  }
  private async searchHybridProvider(
    query: string,
    options: {
      fetchFullPage: boolean;
      maxResults: number;
      maxTokensPerSource: number;
      loopCount: number;
    },
  ): Promise<SearchPayload> {
    const notices: string[] = [];

    if (this.tavilyKey) {
      try {
        const payload = await this.searchTavilyProvider(query, this.tavilyKey, options);
        if (payload.results.length > 0)
          return { ...payload, notices: [...notices, ...payload.notices] };
        notices.push("Tavily 未找到结果，正在尝试下一个搜索源。");
      } catch (error) {
        notices.push(`Tavily 搜索失败: ${messageOf(error)}`);
      }
    }

    if (this.serpapiKey) {
      try {
        const payload = await this.searchSerpapiProvider(query, this.serpapiKey, options);
        if (payload.results.length > 0)
          return { ...payload, notices: [...notices, ...payload.notices] };
        notices.push("SerpApi 未找到结果，正在尝试下一个搜索源。");
      } catch (error) {
        notices.push(`SerpApi 搜索失败: ${messageOf(error)}`);
      }
    }

    try {
      const payload = await this.searchDuckDuckGoProvider(query, options);
      return { ...payload, notices: [...notices, ...payload.notices] };
    } catch (error) {
      return makePayload([], "advanced", null, [...notices, messageOf(error)]);
    }
  }

  private async searchTavilyProvider(
    query: string,
    apiKey: string,
    options: { fetchFullPage: boolean; maxResults: number; maxTokensPerSource: number },
  ): Promise<SearchPayload> {
    const response = responseObject<TavilyResponse>(
      await requestJson("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: options.maxResults,
          include_raw_content: options.fetchFullPage,
        }),
      }),
      "Tavily",
    );
    const items: unknown[] = Array.isArray(response.results) ? response.results : [];
    const results: SearchResult[] = [];
    for (const rawItem of items.slice(0, options.maxResults)) {
      if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) continue;
      const item = rawItem as TavilyResult;
      const content = asString(item.content) ?? "";
      const rawContent = options.fetchFullPage
        ? typeof item.raw_content === "string"
          ? truncateRawContent(item.raw_content, options.maxTokensPerSource)
          : item.raw_content
        : item.content;
      results.push(makeResult(item.title, item.url, content, rawContent));
    }
    return makePayload(results, "tavily", asString(response.answer) ?? null);
  }

  private async searchSerpapiProvider(
    query: string,
    apiKey: string,
    options: { fetchFullPage: boolean; maxResults: number; maxTokensPerSource: number },
  ): Promise<SearchPayload> {
    const url = new URL("https://serpapi.com/search.json");
    url.search = new URLSearchParams({
      engine: "google",
      q: query,
      api_key: apiKey,
      gl: "cn",
      hl: "zh-cn",
      num: String(options.maxResults),
    }).toString();
    const response = responseObject<SerpapiResponse>(
      await requestJson(url.toString(), { method: "GET" }),
      "SerpApi",
    );
    const answerBoxValue = response.answer_box;
    const answerBox =
      typeof answerBoxValue === "object" &&
      answerBoxValue !== null &&
      !Array.isArray(answerBoxValue)
        ? (answerBoxValue as SerpapiAnswerBox)
        : {};
    const answer = asString(answerBox.answer) || asString(answerBox.snippet) || null;
    const items: unknown[] = Array.isArray(response.organic_results)
      ? response.organic_results
      : [];
    const results: SearchResult[] = [];
    for (const rawItem of items.slice(0, options.maxResults)) {
      if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) continue;
      const item = rawItem as SerpapiResult;
      const snippet = asString(item.snippet) ?? "";
      const rawContent = options.fetchFullPage
        ? truncateRawContent(snippet, options.maxTokensPerSource)
        : snippet;
      results.push(makeResult(item.title, item.link, snippet, rawContent));
    }
    return makePayload(results, "serpapi", answer);
  }

  private async searchDuckDuckGoProvider(
    query: string,
    options: { fetchFullPage: boolean; maxResults: number; maxTokensPerSource: number },
  ): Promise<SearchPayload> {
    let response: DuckDuckGoResponse;
    try {
      response = responseObject<DuckDuckGoResponse>(
        await duckDuckGoSearch(query, undefined, {
          open_timeout: 10_000,
          read_timeout: 10_000,
          response_timeout: 10_000,
        }),
        "DuckDuckGo",
      );
    } catch (error) {
      throw new Error(`DuckDuckGo 搜索失败: ${messageOf(error)}`, { cause: error });
    }

    const items: unknown[] = Array.isArray(response.results) ? response.results : [];
    const results: SearchResult[] = [];
    const notices: string[] = [];

    for (const rawItem of items.slice(0, options.maxResults)) {
      if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) continue;
      const item = rawItem as DuckDuckGoResult;
      const url = asString(item.url);
      if (!url) {
        notices.push("DuckDuckGo 返回了不完整的搜索结果，已跳过。");
        continue;
      }
      const title = asString(item.title) || url;
      const snippet = asString(item.description) ?? "";
      let rawContent = snippet;
      if (options.fetchFullPage) {
        try {
          const page = await requestText(url);
          if (page.trim()) rawContent = truncateRawContent(page, options.maxTokensPerSource);
        } catch {
          // Keep the snippet when a page cannot be fetched.
        }
      }
      results.push(makeResult(title, url, snippet, rawContent));
    }
    return makePayload(results, "duckduckgo", null, notices);
  }

  private async searchSearxngProvider(
    query: string,
    options: { fetchFullPage: boolean; maxResults: number; maxTokensPerSource: number },
  ): Promise<SearchPayload> {
    const url = new URL(`${this.searxngUrl}/search`);
    url.search = new URLSearchParams({
      q: query,
      format: "json",
      language: "zh-CN",
      safesearch: "1",
      categories: "general",
    }).toString();
    const response = responseObject<SearxngResponse>(
      await requestJson(url.toString(), { method: "GET" }),
      "SearXNG",
    );
    const items: unknown[] = Array.isArray(response.results) ? response.results : [];
    const results: SearchResult[] = [];

    for (const rawItem of items.slice(0, options.maxResults)) {
      if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) continue;
      const item = rawItem as SearxngResult;
      const urlValue = asString(item.url) || asString(item.link);
      if (!urlValue) continue;
      const content = asString(item.content) || asString(item.snippet) || "";
      let rawContent = content;
      if (options.fetchFullPage) {
        try {
          const page = await requestText(urlValue);
          if (page.trim()) rawContent = truncateRawContent(page, options.maxTokensPerSource);
        } catch {
          // Keep the snippet when a page cannot be fetched.
        }
      }
      results.push(makeResult(item.title, urlValue, content, rawContent));
    }
    return makePayload(results, "searxng");
  }

  private async searchPerplexityProvider(
    query: string,
    apiKey: string,
    options: {
      fetchFullPage: boolean;
      maxResults: number;
      maxTokensPerSource: number;
      loopCount: number;
    },
  ): Promise<SearchPayload> {
    const response = responseObject<PerplexityResponse>(
      await requestJson(
        "https://api.perplexity.ai/chat/completions",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar-pro",
            messages: [
              {
                role: "system",
                content: "Search the web and provide factual information with sources.",
              },
              { role: "user", content: query },
            ],
          }),
        },
        30_000,
      ),
      "Perplexity",
    );
    const choices: unknown[] = Array.isArray(response.choices) ? response.choices : [];
    const rawChoice = choices[0];
    const firstChoice =
      typeof rawChoice === "object" && rawChoice !== null && !Array.isArray(rawChoice)
        ? (rawChoice as PerplexityChoice)
        : {};
    const rawMessage = firstChoice.message;
    const message =
      typeof rawMessage === "object" && rawMessage !== null && !Array.isArray(rawMessage)
        ? (rawMessage as PerplexityMessage)
        : {};
    const answer = asString(message.content);
    if (answer === undefined) throw new Error("Perplexity response is missing message content");

    const citationValues: unknown[] = Array.isArray(response.citations) ? response.citations : [];
    const citations = citationValues.filter(
      (citation): citation is string => typeof citation === "string",
    );
    const sources = (citations.length > 0 ? citations : ["https://perplexity.ai"]).slice(
      0,
      options.maxResults,
    );
    const results = sources.map((url, index) => {
      const content = index === 0 ? answer : "See main Perplexity response above.";
      const rawContent =
        index === 0 && options.fetchFullPage
          ? truncateRawContent(answer, options.maxTokensPerSource)
          : undefined;
      return makeResult(
        `Perplexity Source ${options.loopCount + 1}-${index + 1}`,
        url,
        content,
        rawContent,
      );
    });
    return makePayload(results, "perplexity", answer);
  }
}

async function runTextSearch(query: string, backend: string): Promise<string> {
  const result = await new SearchTool().run({ query, backend, mode: "text" });
  return result as string;
}

export function search(query: string, backend = "hybrid"): Promise<string> {
  return runTextSearch(query, backend);
}

export function searchTavily(query: string): Promise<string> {
  return runTextSearch(query, "tavily");
}

export function searchSerpapi(query: string): Promise<string> {
  return runTextSearch(query, "serpapi");
}

export function searchHybrid(query: string): Promise<string> {
  return runTextSearch(query, "hybrid");
}
