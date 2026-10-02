import { describe, expect, it, vi } from "vitest";

import { runAgent, type AgentToolMap } from "./index";

describe("runAgent", () => {
  it("runs tools, adds observations to the prompt history, and returns the final answer", async () => {
    const prompts: Array<{ prompt: string; systemPrompt: string }> = [];
    const outputs = [
      'Thought: 查询天气。\nAction: get_weather(city="北京")',
      "Thought: 已获得天气信息。\nAction: Finish[今天北京晴朗，适合游览故宫。]",
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
          '用户请求: 查询北京天气\nThought: 查询天气。\nAction: get_weather(city="北京")\nObservation: 北京当前天气:晴，气温20摄氏度',
        systemPrompt: "旅行助手规则",
      },
    ]);
  });

  it("dispatches a tool call when the model prefixes it with Chinese call wording", async () => {
    const prompts: string[] = [];
    const outputs = [
      'Thought: 用户需要北京天气。\nAction: 调用工具 get_weather(city="Beijing")',
      "Thought: 已获得天气信息。\nAction: Finish[北京天气查询完成]",
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

    expect(cities).toEqual(["Beijing"]);
    expect(prompts[1]).toContain("Observation: Beijing当前天气:晴，气温20摄氏度");
  });

  it("keeps only the first Thought-Action pair from a multi-action response", async () => {
    const prompts: string[] = [];
    const outputs = [
      'Thought: 查询巴黎。\nAction: lookup(city="巴黎")\nThought: 查询伦敦。\nAction: lookup(city="伦敦")',
      "Thought: 完成。\nAction: Finish[已完成]",
    ];
    const cities: string[] = [];
    const llm = {
      async generate(prompt: string): Promise<string> {
        prompts.push(prompt);
        return outputs.shift() ?? "";
      },
    };
    const availableTools: AgentToolMap = {
      lookup: async ({ city }) => {
        cities.push(city);
        return `${city}的信息`;
      },
    };

    await expect(
      runAgent("查询城市", {
        llm,
        systemPrompt: "规则",
        availableTools,
        logger: { log: vi.fn() },
      }),
    ).resolves.toBe("已完成");

    expect(cities).toEqual(["巴黎"]);
    expect(prompts[1]).toContain('Action: lookup(city="巴黎")');
    expect(prompts[1]).not.toContain("查询伦敦");
  });

  it("records malformed responses as observations and continues the loop", async () => {
    const prompts: string[] = [];
    const outputs = ["我会认真思考", "Thought: 完成。\nAction: Finish[已完成]"];
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

    expect(prompts[1]).toContain("Observation: 错误: 未能解析到 Action 字段。");
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
