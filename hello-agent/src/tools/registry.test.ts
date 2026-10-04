import { describe, expect, it } from "vitest";

import { Tool, ToolParameter, toolAction } from "./base";
import { ToolRegistry } from "./registry";

class EchoTool extends Tool {
  constructor(name: string, description: string, expandable = false) {
    super(name, description, expandable);
  }

  run(parameters: Record<string, unknown>): string {
    return `tool:${parameters.input as string}`;
  }

  getParameters(): ToolParameter[] {
    return [];
  }
}

class CompositeTool extends EchoTool {
  constructor() {
    super("compound", "Compound tool", true);
  }

  @toolAction("compound_echo", "Echo input", [
    { name: "input", type: "string", description: "Input text" },
  ])
  echo(input: string): string {
    return `child:${input}`;
  }
}

class FailingTool extends EchoTool {
  override run(): string {
    throw new Error("tool failure");
  }
}

describe("ToolRegistry", () => {
  it("registers expanded actions by default and can keep the parent tool", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new CompositeTool());

    expect(registry.listTools()).toEqual(["compound_echo"]);
    expect(registry.getTool("compound")).toBeUndefined();
    expect(await registry.executeTool("compound_echo", "hello")).toBe("child:hello");
    expect(registry.getToolsDescription()).toBe("- compound_echo: Echo input");
    expect(registry.getAllTools().map(({ name }) => name)).toEqual(["compound_echo"]);

    const parentRegistry = new ToolRegistry();
    parentRegistry.registerTool(new CompositeTool(), false);
    expect(parentRegistry.listTools()).toEqual(["compound"]);
  });

  it("prefers Tool objects over same-name functions and unregisters one registration at a time", async () => {
    const registry = new ToolRegistry();
    registry.registerTool(new EchoTool("shared", "Tool version"));
    registry.registerFunction("shared", "Function version", (input) => `function:${input}`);
    registry.registerFunction("uppercase", "Uppercase", (input) => input.toUpperCase());

    expect(await registry.executeTool("shared", "value")).toBe("tool:value");
    expect(await registry.getFunction("uppercase")?.("hello")).toBe("HELLO");
    expect(registry.listTools()).toEqual(["shared", "shared", "uppercase"]);
    expect(registry.getToolsDescription()).toBe(
      "- shared: Tool version\n- shared: Function version\n- uppercase: Uppercase",
    );

    registry.unregister("shared");
    expect(registry.getTool("shared")).toBeUndefined();
    expect(await registry.executeTool("shared", "value")).toBe("function:value");
  });

  it("returns execution errors and clears registered tools", async () => {
    const registry = new ToolRegistry();
    registry.registerFunction("broken", "Throws", () => {
      throw new Error("failure");
    });
    registry.registerTool(new EchoTool("echo", "Echo"));
    registry.registerTool(new FailingTool("failing", "Throws"));

    expect(await registry.executeTool("broken", "input")).toBe(
      "错误：执行工具 'broken' 时发生异常: failure",
    );
    expect(await registry.executeTool("failing", "input")).toBe(
      "错误：执行工具 'failing' 时发生异常: tool failure",
    );
    expect(await registry.executeTool("missing", "input")).toBe(
      "错误：未找到名为 'missing' 的工具。",
    );

    registry.clear();
    expect(registry.listTools()).toEqual([]);
    expect(registry.getAllTools()).toEqual([]);
    expect(registry.getToolsDescription()).toBe("暂无可用工具");
  });

  it("preserves structured asynchronous results and reports rejected operations", async () => {
    const registry = new ToolRegistry();
    registry.registerFunction("lookup", "Lookup", async (input) => {
      await Promise.resolve();
      if (input === "fail") throw new Error("service unavailable");
      return { answer: input.toUpperCase(), results: [{ url: "https://example.com" }] };
    });

    expect(await registry.executeTool("lookup", "agent")).toEqual({
      answer: "AGENT",
      results: [{ url: "https://example.com" }],
    });
    expect(await registry.executeTool("lookup", "fail")).toContain("service unavailable");
  });
});
