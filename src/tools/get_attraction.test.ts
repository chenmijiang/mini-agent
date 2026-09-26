import { afterEach, describe, expect, it, vi } from "vitest";

import { getAttraction } from "./get_attraction";

const TAVILY_API_KEY = "test-api-key";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getAttraction", () => {
  it("returns Tavily's synthesized answer for the city and weather", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ answer: "雨天适合参观上海博物馆。", results: [] })),
      );
    vi.stubEnv("TAVILY_API_KEY", TAVILY_API_KEY);
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAttraction("上海", "下雨")).resolves.toBe("雨天适合参观上海博物馆。");
    expect(fetchMock).toHaveBeenCalledWith("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: "'上海' 在'下雨'天气下最值得去的旅游景点推荐及理由",
        search_depth: "basic",
        include_answer: true,
      }),
    });
  });

  it("formats search results when Tavily does not provide an answer", async () => {
    vi.stubEnv("TAVILY_API_KEY", TAVILY_API_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              { title: "上海博物馆", content: "室内展览适合雨天游览。" },
              { title: "豫园", content: "园林和古建筑值得参观。" },
            ],
          }),
        ),
      ),
    );

    await expect(getAttraction("上海", "下雨")).resolves.toBe(
      "根据搜索，为您找到以下信息:\n- 上海博物馆: 室内展览适合雨天游览。\n- 豫园: 园林和古建筑值得参观。",
    );
  });

  it("reports when the search returns no recommendations", async () => {
    vi.stubEnv("TAVILY_API_KEY", TAVILY_API_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }))),
    );

    await expect(getAttraction("上海", "下雨")).resolves.toBe("抱歉，没有找到相关的旅游景点推荐。");
  });

  it("reports missing API configuration without making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubEnv("TAVILY_API_KEY", "");
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAttraction("上海", "下雨")).resolves.toBe(
      "错误:未配置TAVILY_API_KEY环境变量。",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns Tavily request errors to the caller", async () => {
    vi.stubEnv("TAVILY_API_KEY", TAVILY_API_KEY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(getAttraction("上海", "下雨")).resolves.toContain(
      "错误:执行Tavily搜索时出现问题 - Error: HTTP 503:",
    );
  });
});
