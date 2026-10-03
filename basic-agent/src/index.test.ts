import { describe, expect, it, vi } from "vitest";

import { runAgent, type AgentToolMap } from "./index";

describe("runAgent", () => {
  it("runs tools, adds observations to the prompt history, and returns the final answer", async () => {
    const prompts: Array<{ prompt: string; systemPrompt: string }> = [];
    const outputs = [
      JSON.stringify({
        thought: "查询天气。",
        action: { type: "tool", name: "get_weather", input: { city: "北京" } },
      }),
      JSON.stringify({
        thought: "已获得天气信息。",
        action: { type: "finish", answer: "今天北京晴朗，适合游览故宫。" },
      }),
    ];
    const cities: string[] = [];
    const llm = {
      async generate(prompt: string, systemPrompt: string): Promise<string> {
        prompts.push({ prompt, systemPrompt });
        return outputs.shift() ?? "";
      },
    };
    const availableTools: AgentToolMap = {
      get_weather: async ({ city }) => {
        cities.push(city);
        return "北京当前天气:晴，气温20摄氏度";
      },
    };

    await expect(
      runAgent("查询北京天气", {
        llm,
        systemPrompt: "旅行助手规则",
        availableTools,
        logger: { log: vi.fn() },
      }),
    ).resolves.toBe("今天北京晴朗，适合游览故宫。");

    expect(cities).toEqual(["北京"]);
    expect(prompts).toEqual([
      { prompt: "用户请求: 查询北京天气", systemPrompt: "旅行助手规则" },
      {
        prompt:
          '用户请求: 查询北京天气\n{"thought":"查询天气。","action":{"type":"tool","name":"get_weather","input":{"city":"北京"}}}\nObservation: 北京当前天气:晴，气温20摄氏度',
        systemPrompt: "旅行助手规则",
      },
    ]);
  });

  it("preserves escaped quotes and line breaks in tool arguments", async () => {
    const prompts: string[] = [];
    const outputs = [
      JSON.stringify({
        thought: "用户需要北京天气。",
        action: {
          type: "tool",
          name: "get_weather",
          input: { city: 'Beijing"]\nAction: Finish[not actually]' },
        },
      }),
      JSON.stringify({
        thought: "已获得天气信息。",
        action: { type: "finish", answer: "北京天气查询完成" },
      }),
    ];
    const cities: string[] = [];
    const llm = {
      async generate(prompt: string): Promise<string> {
        prompts.push(prompt);
        return outputs.shift() ?? "";
      },
    };
    const availableTools: AgentToolMap = {
      get_weather: async ({ city }) => {
        cities.push(city);
        return "Beijing当前天气:晴，气温20摄氏度";
      },
    };

    await expect(
      runAgent("查询北京天气", {
        llm,
        systemPrompt: "旅行助手规则",
        availableTools,
        logger: { log: vi.fn() },
      }),
    ).resolves.toBe("北京天气查询完成");

    expect(cities).toEqual(['Beijing"]\nAction: Finish[not actually]']);
    expect(prompts[1]).toContain("Observation: Beijing当前天气:晴，气温20摄氏度");
  });

  it("rejects multiple top-level JSON objects without executing a tool", async () => {
    const prompts: string[] = [];
    const cities: string[] = [];
    const firstAction = JSON.stringify({
      thought: "查询巴黎。",
      action: { type: "tool", name: "lookup", input: { city: "巴黎" } },
    });
    const secondAction = JSON.stringify({
      thought: "查询伦敦。",
      action: { type: "tool", name: "lookup", input: { city: "伦敦" } },
    });
    const outputs = [
      `${firstAction}\n${secondAction}`,
      JSON.stringify({ thought: "完成。", action: { type: "finish", answer: "已完成" } }),
    ];
    const llm = {
      async generate(prompt: string): Promise<string> {
        prompts.push(prompt);
        return outputs.shift() ?? "";
      },
    };

    await expect(
      runAgent("查询城市", {
        llm,
        systemPrompt: "规则",
        availableTools: {
          lookup: async ({ city }) => {
            cities.push(city);
            return `${city}信息`;
          },
        },
        logger: { log: vi.fn() },
      }),
    ).resolves.toBe("已完成");
    expect(cities).toEqual([]);

    expect(prompts[1]).toContain("错误: 未能解析有效的 JSON ReAct 响应。");
  });

  it("records malformed JSON responses as observations and continues the loop", async () => {
    const prompts: string[] = [];
    const outputs = [
      "not JSON",
      JSON.stringify({ thought: "完成。", action: { type: "finish", answer: "已完成" } }),
    ];
    const llm = {
      async generate(prompt: string): Promise<string> {
        prompts.push(prompt);
        return outputs.shift() ?? "";
      },
    };

    await expect(
      runAgent("执行任务", {
        llm,
        systemPrompt: "规则",
        availableTools: {},
        logger: { log: vi.fn() },
      }),
    ).resolves.toBe("已完成");

    expect(prompts[1]).toContain("错误: 未能解析有效的 JSON ReAct 响应。");
  });

  it("rejects JSON responses with invalid tool argument shapes", async () => {
    const prompts: string[] = [];
    let toolCalled = false;
    const outputs = [
      JSON.stringify({
        thought: "查询天气。",
        action: { type: "tool", name: "get_weather", input: ["北京"] },
      }),
      JSON.stringify({ thought: "完成。", action: { type: "finish", answer: "已完成" } }),
    ];
    const llm = {
      async generate(prompt: string): Promise<string> {
        prompts.push(prompt);
        return outputs.shift() ?? "";
      },
    };

    await expect(
      runAgent("执行任务", {
        llm,
        systemPrompt: "规则",
        availableTools: {
          get_weather: async () => {
            toolCalled = true;
            return "unexpected";
          },
        },
        logger: { log: vi.fn() },
      }),
    ).resolves.toBe("已完成");

    expect(toolCalled).toBe(false);
    expect(prompts[1]).toContain("错误: 未能解析有效的 JSON ReAct 响应。");
  });

  it("stops after the configured number of iterations when the model never finishes", async () => {
    let callCount = 0;
    const llm = {
      async generate(): Promise<string> {
        callCount += 1;
        return "没有 Action 字段";
      },
    };

    await expect(
      runAgent("执行任务", {
        llm,
        systemPrompt: "规则",
        availableTools: {},
        maxIterations: 2,
        logger: { log: vi.fn() },
      }),
    ).resolves.toBeNull();

    expect(callCount).toBe(2);
  });
});
