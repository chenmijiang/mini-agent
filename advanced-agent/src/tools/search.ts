import SerpApi from "google-search-results-nodejs";

interface SearchResults {
  answer_box_list?: string[];
  answer_box?: { answer?: string };
  knowledge_graph?: { description?: string };
  organic_results?: Array<{ title?: string; snippet?: string }>;
}

/**
 * 一个基于SerpApi的实战网页搜索引擎工具。它会智能地解析搜索结果，优先返回直接答案或知识图谱信息。
 */
export async function search(query: string): Promise<string> {
  console.log(`🔍 正在执行 [SerpApi] 网页搜索: ${query}`);
  try {
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
      return "错误:SERPAPI_API_KEY 未在 .env 文件中配置。";
    }

    const params = {
      engine: "google",
      q: query,
      api_key: apiKey,
      gl: "cn",
      hl: "zh-cn",
    };

    const client = new SerpApi.GoogleSearch(apiKey);
    const results = await new Promise<SearchResults>((resolve) => {
      client.json(params, resolve);
    });

    if (Array.isArray(results.answer_box_list)) {
      return results.answer_box_list.join("\n");
    }
    if (typeof results.answer_box?.answer === "string") {
      return results.answer_box.answer;
    }
    if (typeof results.knowledge_graph?.description === "string") {
      return results.knowledge_graph.description;
    }
    if (results.organic_results?.length) {
      return results.organic_results
        .slice(0, 3)
        .map((result, index) => `[${index + 1}] ${result.title ?? ""}\n${result.snippet ?? ""}`)
        .join("\n\n");
    }

    return `对不起，没有找到关于 '${query}' 的信息。`;
  } catch (error) {
    return `搜索时发生错误: ${String(error)}`;
  }
}
