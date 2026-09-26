import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAICompatibleClient } from "./openai-compatible-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAICompatibleClient", () => {
  it("sends a non-streaming chat completion request and returns its content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "Hello!" } }] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAICompatibleClient(
      "test-model",
      "test-api-key",
      "http://localhost:11434/v1/",
    );

    await expect(client.generate("Hi", "Be concise.")).resolves.toBe("Hello!");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-api-key");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "test-model",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Hi" },
      ],
      stream: false,
    });
  });

  it("returns the service error message when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const client = new OpenAICompatibleClient("model", "key", "https://example.com/v1");

    await expect(client.generate("Hi", "System prompt")).resolves.toBe(
      "错误:调用语言模型服务时出错。",
    );
  });

  it("returns the service error message for an unsuccessful HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => new Response(null, { status: 503 })),
    );
    const client = new OpenAICompatibleClient("model", "key", "https://example.com/v1");

    await expect(client.generate("Hi", "System prompt")).resolves.toBe(
      "错误:调用语言模型服务时出错。",
    );
  });

  it("returns the service error message when the response has no text content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [] }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = new OpenAICompatibleClient("model", "key", "https://example.com/v1");

    await expect(client.generate("Hi", "System prompt")).resolves.toBe(
      "错误:调用语言模型服务时出错。",
    );
  });
});
