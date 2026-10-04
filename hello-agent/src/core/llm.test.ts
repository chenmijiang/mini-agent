import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HelloAgentsException } from "./exceptions";
import { HelloAgentsLLM } from "./llm";

const environmentNames = [
  "LLM_MODEL_ID",
  "LLM_API_KEY",
  "LLM_BASE_URL",
  "LLM_TIMEOUT",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "DASHSCOPE_API_KEY",
  "MODELSCOPE_API_KEY",
  "KIMI_API_KEY",
  "MOONSHOT_API_KEY",
  "ZHIPU_API_KEY",
  "GLM_API_KEY",
  "OLLAMA_API_KEY",
  "OLLAMA_HOST",
  "VLLM_API_KEY",
  "VLLM_HOST",
] as const;

beforeEach(() => {
  for (const name of environmentNames) vi.stubEnv(name, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HelloAgentsLLM", () => {
  it("yields text chunks from a streaming completion", async () => {
    const chunks = ["Hello", " world"].map(
      (content) =>
        `data: ${JSON.stringify({
          id: "completion-id",
          object: "chat.completion.chunk",
          created: 1,
          model: "test-model",
          choices: [{ index: 0, delta: { content }, finish_reason: null }],
        })}\n\n`,
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(`${chunks.join("")}data: [DONE]\n\n`, {
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const llm = new HelloAgentsLLM({
      model: "test-model",
      apiKey: "test-api-key",
      baseUrl: "https://llm.example/v1",
    });
    const received: string[] = [];

    for await (const chunk of llm.think([{ role: "user", content: "Hi" }], 0.2)) {
      received.push(chunk);
    }

    expect(received).toEqual(["Hello", " world"]);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      temperature: 0.2,
      stream: true,
    });
  });

  it("detects a configured provider and resolves its defaults", () => {
    vi.stubEnv("DASHSCOPE_API_KEY", "dashscope-key");
    const llm = new HelloAgentsLLM();

    expect([llm.provider, llm.model, llm.apiKey, llm.baseUrl]).toEqual([
      "qwen",
      "qwen-plus",
      "dashscope-key",
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    ]);
  });

  it("rejects missing credentials with the base exception", () => {
    expect(() => new HelloAgentsLLM({ model: "test-model" })).toThrow(HelloAgentsException);
  });

  it("wraps API failures in the base exception", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    const llm = new HelloAgentsLLM({
      model: "test-model",
      apiKey: "test-api-key",
      baseUrl: "https://llm.example/v1",
    });

    await expect(llm.invoke([{ role: "user", content: "Hi" }])).rejects.toBeInstanceOf(
      HelloAgentsException,
    );
  });

  it("returns a non-streaming completion using the configured defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "Hello!" } }] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const llm = new HelloAgentsLLM({
      model: "test-model",
      apiKey: "test-api-key",
      baseUrl: "https://llm.example/v1",
      temperature: 0.3,
    });

    await expect(llm.invoke([{ role: "user", content: "Hi" }], { max_tokens: 12 })).resolves.toBe(
      "Hello!",
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://llm.example/v1/chat/completions");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "test-model",
      messages: [{ role: "user", content: "Hi" }],
      temperature: 0.3,
      max_tokens: 12,
      stream: false,
    });
  });
});
