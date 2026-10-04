import { search as duckDuckGoSearch } from "duck-duck-scrape";
import type { SearchResults } from "duck-duck-scrape";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchTool, search, searchHybrid, searchSerpapi, searchTavily } from "./search_tool";

vi.mock("duck-duck-scrape", () => ({ search: vi.fn() }));

const mockDuckDuckGoSearch = vi.mocked(duckDuckGoSearch);
const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function setDuckDuckGoResults(results: unknown[]): void {
  mockDuckDuckGoSearch.mockResolvedValue({
    noResults: results.length === 0,
    vqd: "test-vqd",
    results,
  } as unknown as SearchResults);
}

describe("SearchTool", () => {
  beforeEach(() => {
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubEnv("SERPAPI_API_KEY", "");
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    vi.stubEnv("SEARXNG_URL", "");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    mockDuckDuckGoSearch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("accepts either query key, trims it, and rejects empty or invalid input", async () => {
    const tool = new SearchTool();
    setDuckDuckGoResults([
      { title: "Example", url: "https://example.test", description: "A result" },
    ]);

    expect(await tool.run({ input: "", query: "  example  " })).toContain("搜索关键词：example");
    expect(await tool.run({ input: "   " })).toBe("错误：搜索查询不能为空");
    await expect(tool.run({ query: 42 })).rejects.toThrow("query must be a string");
    await expect(tool.run({ query: "example", max_results: "2garbage" })).rejects.toThrow(
      "max_results must be an integer",
    );
    await expect(
      tool.run({ query: "example", max_results: Number.POSITIVE_INFINITY }),
    ).rejects.toThrow("max_results must be a finite integer");
    await expect(tool.run({ query: "example", mode: "json", return_mode: 1 })).rejects.toThrow(
      "return_mode must be a string",
    );
    await expect(tool.run({ query: "example", fetch_full_page: "yes" })).rejects.toThrow(
      "fetch_full_page must be a boolean",
    );
  });

  it("falls back from unsupported constructor backends and rejects missing explicit keys", async () => {
    setDuckDuckGoResults([
      { title: "Fallback", url: "https://fallback.test", description: "Found by DDG" },
    ]);

    expect(await new SearchTool("unknown").run({ input: "example", mode: "dict" })).toMatchObject({
      backend: "duckduckgo",
    });
    expect(await new SearchTool("tavily").run({ input: "example", mode: "dict" })).toMatchObject({
      backend: "duckduckgo",
    });
    expect(await new SearchTool("serpapi").run({ input: "example", mode: "dict" })).toMatchObject({
      backend: "duckduckgo",
    });

    await expect(new SearchTool().run({ input: "example", backend: "tavily" })).rejects.toThrow(
      "TAVILY_API_KEY",
    );
    await expect(new SearchTool().run({ input: "example", backend: "serpapi" })).rejects.toThrow(
      "SERPAPI_API_KEY",
    );
    await expect(
      new SearchTool("perplexity").run({ input: "example", mode: "dict" }),
    ).rejects.toThrow("PERPLEXITY_API_KEY");
  });

  it("falls through empty and failing providers and keeps their notices on a later result", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tavily-secret");
    vi.stubEnv("SERPAPI_API_KEY", "serpapi-secret");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 503));
    setDuckDuckGoResults([
      { title: "Fallback", url: "https://fallback.test", description: "Found by DDG" },
    ]);

    const result = await new SearchTool().run({ query: "example", mode: "structured" });
    expect(result).toMatchObject({
      backend: "duckduckgo",
      results: [{ title: "Fallback", content: "Found by DDG" }],
      notices: ["Tavily 未找到结果，正在尝试下一个搜索源。", "SerpApi 搜索失败: HTTP 503"],
    });
  });

  it("uses hybrid when an explicitly supplied backend is unsupported", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tavily-secret");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: [{ url: "https://tavily.test", content: "Selected by fallback" }],
      }),
    );

    const result = await new SearchTool("duckduckgo").run({
      query: "example",
      backend: "",
      mode: "structured",
    });
    expect(result).toMatchObject({
      backend: "tavily",
      results: [{ content: "Selected by fallback" }],
    });
  });

  it("returns an advanced empty payload containing the DuckDuckGo SDK error", async () => {
    mockDuckDuckGoSearch.mockRejectedValueOnce(new Error("upstream down"));
    const result = await new SearchTool().run({
      query: "example",
      backend: "advanced",
      mode: "dict",
    });

    expect(result).toEqual({
      results: [],
      backend: "advanced",
      answer: null,
      notices: ["DuckDuckGo 搜索失败: upstream down"],
    });
  });

  it("rejects explicit DuckDuckGo SDK failures with source context", async () => {
    mockDuckDuckGoSearch.mockRejectedValueOnce(new Error("upstream down"));

    await expect(new SearchTool().run({ input: "example", backend: "duckduckgo" })).rejects.toThrow(
      "DuckDuckGo 搜索失败: upstream down",
    );
  });

  it("normalizes Tavily data and truncates raw text by Unicode code points", async () => {
    fetchMock.mockImplementationOnce(async (_input, init) => {
      if (typeof init?.body !== "string") throw new Error("Expected a JSON request body");
      const request = JSON.parse(init.body) as Record<string, unknown>;
      expect(request.query).toBe("example");
      expect(request.max_results).toBe(3);
      expect(request.api_key).toBe("tavily-secret");
      expect(request.include_raw_content).toBe(true);
      return jsonResponse({
        answer: "Direct answer",
        results: [
          { title: "", url: "https://tavily.test", content: "Snippet", raw_content: "🌍🌎🌏ab" },
        ],
      });
    });
    const result = await new SearchTool("tavily", "tavily-secret").run({
      query: "  example  ",
      mode: "json",
      fetch_full_page: true,
      max_results: "3",
      max_tokens_per_source: "1",
    });

    expect(result).toEqual({
      results: [
        {
          title: "https://tavily.test",
          url: "https://tavily.test",
          content: "Snippet",
          raw_content: "🌍🌎🌏a... [truncated]",
        },
      ],
      backend: "tavily",
      answer: "Direct answer",
      notices: [],
    });
  });

  it("maps SerpApi answer boxes and does not use page fetching for organic results", async () => {
    fetchMock
      .mockImplementationOnce(async (input) => {
        const parameters = new URL(input instanceof Request ? input.url : input).searchParams;
        expect(parameters.get("engine")).toBe("google");
        expect(parameters.get("q")).toBe("中文 query");
        expect(parameters.get("api_key")).toBe("serpapi-secret");
        expect(parameters.get("num")).toBe("1");
        return jsonResponse({
          answer_box: { snippet: "Quick answer" },
          organic_results: [{ title: "Result", link: "https://serp.test", snippet: "012345678" }],
        });
      })
      .mockResolvedValueOnce(new Response("unexpected page"));
    const result = await new SearchTool("serpapi", undefined, "serpapi-secret").run({
      query: "中文 query",
      mode: "structured",
      fetch_full_page: true,
      max_results: 1,
      max_tokens_per_source: 1,
    });

    expect(result).toMatchObject({
      backend: "serpapi",
      answer: "Quick answer",
      results: [
        {
          title: "Result",
          url: "https://serp.test",
          content: "012345678",
          raw_content: "0123... [truncated]",
        },
      ],
    });
  });

  it("uses the DuckDuckGo SDK search and keeps snippets when full-page fetches fail", async () => {
    setDuckDuckGoResults([
      { title: "DDG result", url: "https://ddg.test", description: "Snippet" },
    ]);
    fetchMock.mockRejectedValueOnce(new Error("page unavailable"));
    const result = await new SearchTool().run({
      query: "example",
      backend: "duckduckgo",
      mode: "structured",
      fetch_full_page: true,
    });

    expect(result).toMatchObject({
      backend: "duckduckgo",
      results: [{ title: "DDG result", content: "Snippet", raw_content: "Snippet" }],
    });
  });

  it("uses result URLs as missing titles and reports results without URLs", async () => {
    setDuckDuckGoResults([
      { title: "", url: "https://fallback-title.test", description: "Useful content" },
      { title: "No URL", description: "Skip this result" },
      { title: "Only URL", url: "https://only-url.test", description: "" },
    ]);
    const tool = new SearchTool();
    const structured = await tool.run({ input: "example", backend: "duckduckgo", mode: "dict" });
    expect(structured).toMatchObject({
      results: [
        {
          title: "https://fallback-title.test",
          url: "https://fallback-title.test",
          content: "Useful content",
        },
        { title: "Only URL", url: "https://only-url.test", content: "" },
      ],
      notices: ["DuckDuckGo 返回了不完整的搜索结果，已跳过。"],
    });

    const text = await tool.run({ input: "example", backend: "duckduckgo" });
    expect(text).toContain("[1] https://fallback-title.test");
    expect(text).toContain("    Useful content");
    expect(text).toContain("来源: https://fallback-title.test");
    expect(text).toContain("[2] Only URL");
    expect(text).not.toContain("No URL");
    expect(text).not.toContain("    \n");
  });

  it("omits the reference heading when DuckDuckGo has no results", async () => {
    setDuckDuckGoResults([]);

    const text = await new SearchTool().run({ input: "missing", backend: "duckduckgo" });
    expect(text).toContain("❌ 未找到相关搜索结果。");
    expect(text).not.toContain("📚 参考来源：");
  });

  it("queries configured SearXNG and uses truncated HTML when available", async () => {
    vi.stubEnv("SEARXNG_URL", "https://searx.test///");
    fetchMock
      .mockImplementationOnce(async (input) => {
        const url = new URL(input instanceof Request ? input.url : input);
        expect(url.origin).toBe("https://searx.test");
        expect(url.pathname).toBe("/search");
        expect(url.searchParams.get("q")).toBe("example");
        expect(url.searchParams.get("format")).toBe("json");
        expect(url.searchParams.get("language")).toBe("zh-CN");
        expect(url.searchParams.get("safesearch")).toBe("1");
        expect(url.searchParams.get("categories")).toBe("general");
        return jsonResponse({
          results: [
            { title: "Missing URL" },
            { link: "https://source.test", snippet: "Fallback text" },
          ],
        });
      })
      .mockResolvedValueOnce(new Response("<html>🌍🌎🌏ab</html>"));
    const result = await new SearchTool().run({
      input: "example",
      backend: "searxng",
      mode: "structured",
      fetch_full_page: true,
      max_tokens_per_source: 1,
    });

    expect(result).toMatchObject({
      backend: "searxng",
      results: [
        {
          title: "https://source.test",
          url: "https://source.test",
          content: "Fallback text",
          raw_content: "<htm... [truncated]",
        },
      ],
      notices: [],
    });
  });

  it("uses Perplexity citations, answer, source titles, and first-source raw content", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "Full answer" } }],
        citations: ["https://one.test", "https://two.test"],
      }),
    );
    const result = await new SearchTool(
      "perplexity",
      undefined,
      undefined,
      "perplexity-secret",
    ).run({
      query: "example",
      mode: "structured",
      fetch_full_page: true,
      loop_count: 4,
      max_tokens_per_source: 1,
    });

    expect(result).toEqual({
      results: [
        {
          title: "Perplexity Source 5-1",
          url: "https://one.test",
          content: "Full answer",
          raw_content: "Full... [truncated]",
        },
        {
          title: "Perplexity Source 5-2",
          url: "https://two.test",
          content: "See main Perplexity response above.",
        },
      ],
      backend: "perplexity",
      answer: "Full answer",
      notices: [],
    });
  });

  it("uses Perplexity's default citation when the response has none", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: "An answer" } }],
        citations: [],
      }),
    );
    const result = await new SearchTool(
      "perplexity",
      undefined,
      undefined,
      "perplexity-secret",
    ).run({
      query: "example",
      return_mode: "dict",
    });

    expect(result).toMatchObject({
      backend: "perplexity",
      results: [{ url: "https://perplexity.ai", content: "An answer" }],
    });
  });

  it("keeps exported convenience helpers asynchronous and text-oriented", async () => {
    setDuckDuckGoResults([
      { title: "Helper result", url: "https://helper.test", description: "From helper" },
    ]);

    await expect(search("example")).resolves.toContain("使用搜索源：duckduckgo");
    await expect(search("example", "duckduckgo")).resolves.toContain("使用搜索源：duckduckgo");
    await expect(search("example", "tavily")).rejects.toThrow("TAVILY_API_KEY");
    await expect(searchHybrid("example")).resolves.toContain("[1] Helper result");
    await expect(searchTavily("example")).rejects.toThrow("TAVILY_API_KEY");
    await expect(searchSerpapi("example")).rejects.toThrow("SERPAPI_API_KEY");
  });
});
