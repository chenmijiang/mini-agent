import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { json } = vi.hoisted(() => ({
  json: vi.fn<(params: Record<string, string>, callback: (result: unknown) => void) => void>(),
}));

vi.mock("google-search-results-nodejs", () => ({
  default: {
    GoogleSearch: class {
      json = json;
    },
  },
}));

import { search } from "./search";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubEnv("SERPAPI_API_KEY", "test-api-key");
  json.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("search", () => {
  it("returns answer_box_list before other result types", async () => {
    json.mockImplementation((_params, callback) =>
      callback({
        answer_box_list: ["first", "second"],
        answer_box: { answer: "answer" },
        knowledge_graph: { description: "description" },
      }),
    );

    await expect(search("query")).resolves.toBe("first\nsecond");
  });

  it("returns an answer box answer before knowledge graph data", async () => {
    json.mockImplementation((_params, callback) =>
      callback({
        answer_box: { answer: "direct answer" },
        knowledge_graph: { description: "description" },
      }),
    );

    await expect(search("query")).resolves.toBe("direct answer");
  });

  it("returns knowledge graph description before organic results", async () => {
    json.mockImplementation((_params, callback) =>
      callback({
        knowledge_graph: { description: "description" },
        organic_results: [{ title: "title", snippet: "snippet" }],
      }),
    );

    await expect(search("query")).resolves.toBe("description");
  });

  it("formats at most the first three organic results", async () => {
    json.mockImplementation((_params, callback) =>
      callback({
        organic_results: [
          { title: "A", snippet: "one" },
          { title: "B", snippet: "two" },
          {},
          { title: "ignored", snippet: "four" },
        ],
      }),
    );

    await expect(search("query")).resolves.toBe("[1] A\none\n\n[2] B\ntwo\n\n[3] \n");
  });

  it("returns the no-results message when no result types are available", async () => {
    json.mockImplementation((_params, callback) => callback({}));

    await expect(search("unknown topic")).resolves.toBe(
      "对不起，没有找到关于 'unknown topic' 的信息。",
    );
  });

  it("returns an empty answer list instead of falling through", async () => {
    json.mockImplementation((_params, callback) =>
      callback({ answer_box_list: [], answer_box: { answer: "fallback" } }),
    );

    await expect(search("query")).resolves.toBe("");
  });

  it("reports missing API configuration", async () => {
    vi.stubEnv("SERPAPI_API_KEY", "");

    await expect(search("query")).resolves.toBe("错误:SERPAPI_API_KEY 未在 .env 文件中配置。");
  });

  it("returns client errors as search errors", async () => {
    json.mockImplementation(() => {
      throw new Error("offline");
    });

    await expect(search("query")).resolves.toBe("搜索时发生错误: Error: offline");
  });
});
