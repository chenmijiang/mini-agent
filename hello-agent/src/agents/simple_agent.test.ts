import { describe, expect, it, vi } from "vitest";

import type { HelloAgentsLLM } from "../core/llm";
import { Tool, ToolParameter } from "../tools/base";
import { ToolRegistry } from "../tools/registry";
import { SimpleAgent } from "./simple_agent";

class MultiplyTool extends Tool {
  constructor() {
    super("multiply", "Multiply two numbers");
  }

  getParameters(): ToolParameter[] {
    return [
      new ToolParameter({ name: "a", type: "number", description: "First value" }),
      new ToolParameter({ name: "b", type: "number", description: "Second value" }),
    ];
  }

  run(parameters: Record<string, unknown>): string {
    if (typeof parameters.a !== "number" || typeof parameters.b !== "number") {
      return "invalid parameters";
    }
    return String(parameters.a * parameters.b);
  }
}

describe("SimpleAgent", () => {
  it("executes multiple typed tool calls and uses their results", async () => {
    let invocation = 0;
    const invoke = vi.fn(async (messages: Parameters<HelloAgentsLLM["invoke"]>[0]) => {
      if (invocation++ === 0) {
        return '[TOOL_CALL:multiply:a=12,b=8]\n[TOOL_CALL:multiply:{"a":12,"b":8}]';
      }
      expect(messages.at(-1)).toMatchObject({
        role: "user",
        content: expect.stringContaining("96"),
      });
      return "12 × 8 = 96";
    });
    const llm = { invoke } as unknown as HelloAgentsLLM;
    const registry = new ToolRegistry();
    registry.registerTool(new MultiplyTool());
    const agent = new SimpleAgent("calculator", llm, undefined, undefined, registry);

    await expect(agent.run("What is 12 times 8?")).resolves.toBe("12 × 8 = 96");
    expect(agent.get_history().map(({ role, content }) => [role, content])).toEqual([
      ["user", "What is 12 times 8?"],
      ["assistant", "12 × 8 = 96"],
    ]);
  });

  it("streams response chunks and saves the complete exchange", async () => {
    const invoke = vi.fn();
    const streamInvoke = vi.fn(async function* () {
      yield "Hello";
      yield " there";
    });
    const llm = { invoke, streamInvoke } as unknown as HelloAgentsLLM;
    const agent = new SimpleAgent("assistant", llm);
    const chunks: string[] = [];

    for await (const chunk of agent.stream_run("Say hello")) chunks.push(chunk);

    expect(chunks).toEqual(["Hello", " there"]);
    expect(agent.get_history().map(({ role, content }) => [role, content])).toEqual([
      ["user", "Say hello"],
      ["assistant", "Hello there"],
    ]);
  });
});
