interface TavilySearchResponse {
  answer?: unknown;
  results?: unknown;
}

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

export async function getAttraction(city: string, weather: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return "错误:未配置TAVILY_API_KEY环境变量。";
  }

  const query = `'${city}' 在'${weather}'天气下最值得去的旅游景点推荐及理由`;

  try {
    const response = await fetch(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as TavilySearchResponse;
    if (typeof data.answer === "string" && data.answer) {
      return data.answer;
    }

    const results = Array.isArray(data.results) ? data.results : [];
    const formattedResults = results.map((result: unknown) => {
      if (typeof result !== "object" || result === null) {
        throw new Error("搜索结果格式无效");
      }

      const { title, content } = result as Record<string, unknown>;
      if (typeof title !== "string" || typeof content !== "string") {
        throw new Error("搜索结果格式无效");
      }

      return `- ${title}: ${content}`;
    });

    if (formattedResults.length === 0) {
      return "抱歉，没有找到相关的旅游景点推荐。";
    }

    return `根据搜索，为您找到以下信息:\n${formattedResults.join("\n")}`;
  } catch (error) {
    return `错误:执行Tavily搜索时出现问题 - ${String(error)}`;
  }
}
