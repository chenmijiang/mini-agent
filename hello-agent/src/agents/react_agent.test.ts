import { describe, expect, it, vi } from "vitest";

import type { HelloAgentsLLM } from "../core/llm";
import { Tool, ToolParameter } from "../tools/base";
import { ToolRegistry } from "../tools/registry";
import { ReActAgent } from "./react_agent";

type InvokeMessages = Parameters<HelloAgentsLLM["invoke"]>[0];

const FALLBACK = "抱歉，我无法在限定步数内完成这个任务。";

function promptFrom(messages: InvokeMessages): string {
  const content = messages.at(-1)?.content;
  if (typeof content !== "string") throw new TypeError("Expected a text prompt");
  return content;
}

function historyPairs(agent: ReActAgent) {
  return agent.get_history().map(({ role, content }) => [role, content]);
}

class EchoTool extends Tool {
  inputs: string[] = [];

  constructor(name = "lookup") {
    super(name, `Lookup using ${name}`);
  }

  getParameters(): ToolParameter[] {
    return [new ToolParameter({ name: "input", type: "string", description: "Lookup input" })];
  }

  async run(parameters: Record<string, unknown>): Promise<string> {
    const input = String(parameters.input);
    this.inputs.push(input);
    return `result for ${input}`;
  }
}

class FailingTool extends Tool {
  constructor() {
    super("broken", "A tool that fails");
  }

  getParameters(): ToolParameter[] {
    return [];
  }

  run(): string {
    throw new Error("offline");
  }
}

describe("ReActAgent", () => {
  it("uses an async tool observation to answer and persists the exchange", async () => {
    const prompts: string[] = [];
    const tool = new EchoTool();
    const registry = new ToolRegistry();
    registry.registerTool(tool);
    const invoke = vi.fn(async (messages: InvokeMessages) => {
      const prompt = promptFrom(messages);
      prompts.push(prompt);
      return prompt.includes("Observation: result for city[Harbor]")
        ? "Thought: I have the forecast.\nAction: Finish[The result is for city[Harbor].]"
        : "Thought: I need a lookup.\nAction: lookup[city[Harbor]]";
    });
    const agent = new ReActAgent("weather", { invoke } as unknown as HelloAgentsLLM, registry);

    await expect(agent.run("Look up Harbor")).resolves.toBe("The result is for city[Harbor].");

    expect(tool.inputs).toEqual(["city[Harbor]"]);
    expect(prompts[1]).toContain("Observation: result for city[Harbor]");
    expect(agent.current_history).toEqual([
      "Action: lookup[city[Harbor]]",
      "Observation: result for city[Harbor]",
    ]);
    expect(historyPairs(agent)).toEqual([
      ["user", "Look up Harbor"],
      ["assistant", "The result is for city[Harbor]."],
    ]);
  });

  it("starts each run with a clean execution history", async () => {
    const prompts: string[] = [];
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const invoke = vi.fn(async (messages: InvokeMessages) => {
      const prompt = promptFrom(messages);
      prompts.push(prompt);
      if (prompt.includes("Observation: result for first request")) {
        return "Thought: Done with the first request.\nAction: Finish[first answer]";
      }
      if (prompt.includes("Second request")) {
        return prompt.includes("Observation:")
          ? "Thought: Stale context.\nAction: Finish[stale history leaked]"
          : "Thought: No old context.\nAction: Finish[second answer]";
      }
      return "Thought: I need a lookup.\nAction: lookup[first request]";
    });
    const agent = new ReActAgent("assistant", { invoke } as unknown as HelloAgentsLLM, registry);

    await expect(agent.run("First request")).resolves.toBe("first answer");
    await expect(agent.run("Second request")).resolves.toBe("second answer");

    expect(prompts[2]).not.toContain("Observation: result for first request");
    expect(agent.current_history).toEqual([]);
    expect(historyPairs(agent)).toEqual([
      ["user", "First request"],
      ["assistant", "first answer"],
      ["user", "Second request"],
      ["assistant", "second answer"],
    ]);
  });

  it("stops at the max-step boundary and persists the fallback", async () => {
    const tool = new EchoTool("tick");
    const registry = new ToolRegistry();
    registry.registerTool(tool);
    const invoke = vi.fn(async () => "Thought: Continue.\nAction: tick[now]");
    const agent = new ReActAgent(
      "assistant",
      { invoke } as unknown as HelloAgentsLLM,
      registry,
      undefined,
      undefined,
      2,
    );

    await expect(agent.run("Keep going")).resolves.toBe(FALLBACK);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(tool.inputs).toEqual(["now", "now"]);
    expect(agent.current_history).toEqual([
      "Action: tick[now]",
      "Observation: result for now",
      "Action: tick[now]",
      "Observation: result for now",
    ]);
    expect(historyPairs(agent)).toEqual([
      ["user", "Keep going"],
      ["assistant", FALLBACK],
    ]);
  });

  it("records a malformed action and recovers on the next response", async () => {
    const prompts: string[] = [];
    const invoke = vi.fn(async (messages: InvokeMessages) => {
      const prompt = promptFrom(messages);
      prompts.push(prompt);
      return prompt.includes("Observation: 无效的Action格式")
        ? "Thought: Now I can finish.\nAction: Finish[recovered]"
        : "Thought: The action is malformed.\nAction: lookup without brackets";
    });
    const agent = new ReActAgent("assistant", { invoke } as unknown as HelloAgentsLLM);

    await expect(agent.run("Recover from bad action")).resolves.toBe("recovered");

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(prompts[1]).toContain("Observation: 无效的Action格式，请检查。");
    expect(agent.current_history).toEqual(["Observation: 无效的Action格式，请检查。"]);
  });

  it.each([
    { kind: "empty", response: "" },
    { kind: "missing Action", response: "Thought: No action was selected." },
  ])("persists the fallback for a $kind model response", async ({ response }) => {
    const invoke = vi.fn(async () => response);
    const agent = new ReActAgent("assistant", { invoke } as unknown as HelloAgentsLLM);

    await expect(agent.run("No model answer")).resolves.toBe(FALLBACK);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(historyPairs(agent)).toEqual([
      ["user", "No model answer"],
      ["assistant", FALLBACK],
    ]);
  });

  it("passes tool execution failures back as observations", async () => {
    const prompts: string[] = [];
    const registry = new ToolRegistry();
    registry.registerTool(new FailingTool());
    const invoke = vi.fn(async (messages: InvokeMessages) => {
      const prompt = promptFrom(messages);
      prompts.push(prompt);
      return prompt.includes("Observation: 错误：执行工具 'broken' 时发生异常: offline")
        ? "Thought: The tool failed.\nAction: Finish[The lookup failed offline.]"
        : "Thought: I should use the tool.\nAction: broken[query]";
    });
    const agent = new ReActAgent("assistant", { invoke } as unknown as HelloAgentsLLM, registry);

    await expect(agent.run("Try the lookup")).resolves.toBe("The lookup failed offline.");

    expect(prompts[1]).toContain("Observation: 错误：执行工具 'broken' 时发生异常: offline");
    expect(agent.current_history).toContain(
      "Observation: 错误：执行工具 'broken' 时发生异常: offline",
    );
  });

  it("escapes prompt braces and replaces question, tools, and history", async () => {
    const input = "literal {tools} and {{history}}";
    const customPrompt = "literal={{question}}; ask={question}; tools={tools}; history={history}";
    const prompts: string[] = [];
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool());
    const invoke = vi.fn(async (messages: InvokeMessages) => {
      const prompt = promptFrom(messages);
      prompts.push(prompt);
      if (!prompt.includes(`literal={question}; ask=${input}`) || !prompt.includes("lookup")) {
        return "Thought: Template content was corrupted.\nAction: Finish[invalid template]";
      }
      return prompt.includes("Observation: result for value")
        ? "Thought: I have the result.\nAction: Finish[custom prompt worked]"
        : "Thought: I need a lookup.\nAction: lookup[value]";
    });
    const agent = new ReActAgent(
      "assistant",
      { invoke } as unknown as HelloAgentsLLM,
      registry,
      undefined,
      undefined,
      5,
      customPrompt,
    );

    await expect(agent.run(input)).resolves.toBe("custom prompt worked");
  });

  it("expands an MCP tool and executes the selected subtool", async () => {
    class McpBridgeTool extends Tool {
      auto_expand = true;
      _available_tools = [
        { name: "weather", description: "Get weather" },
        { name: "clock", description: "Get local time" },
      ];
      calls: Record<string, unknown>[] = [];

      constructor() {
        super("service", "MCP service");
      }

      getParameters(): ToolParameter[] {
        return [];
      }

      async run(parameters: Record<string, unknown>): Promise<string> {
        this.calls.push(parameters);
        const args = parameters.arguments as Record<string, unknown> | undefined;
        return parameters.action === "call_tool" &&
          parameters.tool_name === "weather" &&
          args?.input === "Mars"
          ? "weather for Mars: clear"
          : "wrong subtool";
      }
    }

    const bridge = new McpBridgeTool();
    const prompts: string[] = [];
    const invoke = vi.fn(async (messages: InvokeMessages) => {
      const prompt = promptFrom(messages);
      prompts.push(prompt);
      return prompt.includes("Observation: weather for Mars: clear")
        ? "Thought: I have the requested forecast.\nAction: Finish[Mars is clear.]"
        : "Thought: I need the weather subtool.\nAction: service_weather[Mars]";
    });
    const agent = new ReActAgent("assistant", { invoke } as unknown as HelloAgentsLLM);
    agent.add_tool(bridge);

    await expect(agent.run("Check the weather on Mars")).resolves.toBe("Mars is clear.");

    expect(prompts[1]).toContain("Observation: weather for Mars: clear");
    expect(bridge.calls).toEqual([
      {
        action: "call_tool",
        tool_name: "weather",
        arguments: { input: "Mars" },
      },
    ]);
  });
});
