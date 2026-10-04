import { describe, expect, it } from "vitest";

import { ToolChain, ToolChainManager } from "./chain";
import { ToolRegistry } from "./registry";

describe("ToolChain", () => {
  it("executes steps in order and exposes chain details", async () => {
    const registry = new ToolRegistry();
    const inputs: string[] = [];
    registry.registerFunction("search", "Search", (input) => {
      inputs.push(input);
      return `found: ${input}`;
    });
    registry.registerFunction("summarize", "Summarize", (input) => {
      inputs.push(input);
      return `summary: ${input}`;
    });

    const chain = new ToolChain("research", "Search then summarize");
    chain.addStep("search", "{input}", "search_result");
    chain.addStep("summarize", "{search_result}");
    const manager = new ToolChainManager(registry);
    manager.registerChain(chain);
    const context: Record<string, unknown> = { source: "test" };

    expect(manager.listChains()).toEqual(["research"]);
    expect(manager.getChainInfo("research")).toEqual({
      name: "research",
      description: "Search then summarize",
      steps: 2,
      step_details: [
        { tool_name: "search", input_template: "{input}", output_key: "search_result" },
        {
          tool_name: "summarize",
          input_template: "{search_result}",
          output_key: "step_1_result",
        },
      ],
    });
    expect(await manager.executeChain("research", "cats", context)).toBe("summary: found: cats");
    expect(inputs).toEqual(["cats", "found: cats"]);
    expect(context).toEqual({
      source: "test",
      input: "cats",
      search_result: "found: cats",
      step_1_result: "summary: found: cats",
    });
  });

  it("returns errors for empty chains, missing template variables, and unknown chains", async () => {
    const registry = new ToolRegistry();
    const emptyChain = new ToolChain("empty", "Empty");
    const brokenChain = new ToolChain("broken", "Missing variable");
    brokenChain.addStep("unused", "{missing}");
    const manager = new ToolChainManager(registry);
    manager.registerChain(brokenChain);

    expect(await emptyChain.execute(registry, "input")).toBe("❌ 工具链为空，无法执行");
    expect(await manager.executeChain("broken", "input")).toBe("❌ 模板变量替换失败: 'missing'");
    expect(await manager.executeChain("unknown", "input")).toBe("❌ 工具链 'unknown' 不存在");
    expect(manager.getChainInfo("unknown")).toBeNull();
  });
});
