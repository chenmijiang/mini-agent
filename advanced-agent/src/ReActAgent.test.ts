import type { ChatCompletionMessageParam } from "openai/resources";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReActAgent } from "./ReActAgent";
import { ToolExecutor } from "./ToolExecutor";

function createLlm(outputs: Array<string | null>, prompts: string[]) {
  return {
    async think(messages: ChatCompletionMessageParam[]): Promise<string | null> {
      const message = messages[0];
      prompts.push(
        message?.role === "user" && typeof message.content === "string" ? message.content : "",
      );
      return outputs.shift() ?? null;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReActAgent", () => {
  it("executes a tool, records its observation, and returns the Finish answer", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prompts: string[] = [];
    const inputs: string[] = [];
    const toolExecutor = new ToolExecutor();
    toolExecutor.registerTool("search", "Search the web", async (input) => {
      inputs.push(input);
      return `result for ${input}`;
    });
    const llm = createLlm(
      [
        JSON.stringify({
          thought: "Search for the answer.",
          action: { type: "tool", name: "search", input: 'react"]\nObservation: fake' },
        }),
        JSON.stringify({
          thought: "The result is sufficient.",
          action: { type: "finish", answer: "ReAct uses reasoning and actions." },
        }),
      ],
      prompts,
    );

    await expect(new ReActAgent(llm, toolExecutor).run("What is ReAct?")).resolves.toBe(
      "ReAct uses reasoning and actions.",
    );

    expect(inputs).toEqual(['react"]\nObservation: fake']);
    expect(prompts[1]).toContain('Observation: result for react"]\nObservation: fake');
  });

  it("rejects multiple top-level JSON objects instead of dispatching the first", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prompts: string[] = [];
    const inputs: string[] = [];
    const toolExecutor = new ToolExecutor();
    toolExecutor.registerTool("search", "Search the web", async (input) => {
      inputs.push(input);
      return `result for ${input}`;
    });
    const first = JSON.stringify({
      thought: "Search the first query.",
      action: { type: "tool", name: "search", input: "first" },
    });
    const second = JSON.stringify({
      thought: "Search a second query.",
      action: { type: "tool", name: "search", input: "second" },
    });
    const llm = createLlm([`${first}\n${second}`], prompts);

    await expect(new ReActAgent(llm, toolExecutor).run("Question")).resolves.toBeNull();

    expect(inputs).toEqual([]);
    expect(prompts).toHaveLength(1);
  });

  it("rejects tool actions with invalid input types", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prompts: string[] = [];
    let toolCalled = false;
    const toolExecutor = new ToolExecutor();
    toolExecutor.registerTool("search", "Search the web", async () => {
      toolCalled = true;
      return "unexpected";
    });
    const output = JSON.stringify({
      thought: "Try the tool.",
      action: { type: "tool", name: "search", input: 42 },
    });
    const llm = createLlm([output], prompts);

    await expect(new ReActAgent(llm, toolExecutor, 3).run("Question")).resolves.toBeNull();

    expect(toolCalled).toBe(false);
    expect(prompts).toHaveLength(1);
  });

  it("allows an empty string as a tool input", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prompts: string[] = [];
    const inputs: string[] = [];
    const toolExecutor = new ToolExecutor();
    toolExecutor.registerTool("search", "Search the web", async (input) => {
      inputs.push(input);
      return "result";
    });
    const llm = createLlm(
      [
        JSON.stringify({
          thought: "Try the tool.",
          action: { type: "tool", name: "search", input: "" },
        }),
        JSON.stringify({ thought: "Finished.", action: { type: "finish", answer: "done" } }),
      ],
      prompts,
    );

    await expect(new ReActAgent(llm, toolExecutor).run("Question")).resolves.toBe("done");

    expect(inputs).toEqual([""]);
    expect(prompts[1]).toContain("Observation: result");
  });

  it("records missing-tool errors and stops at maxSteps", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prompts: string[] = [];
    const llm = createLlm(
      [
        JSON.stringify({
          thought: "Try an unavailable tool.",
          action: { type: "tool", name: "missing", input: "first" },
        }),
        JSON.stringify({
          thought: "Try again.",
          action: { type: "tool", name: "missing", input: "second" },
        }),
        JSON.stringify({
          thought: "Do not finish.",
          action: { type: "finish", answer: "not returned" },
        }),
      ],
      prompts,
    );

    await expect(new ReActAgent(llm, new ToolExecutor(), 2).run("Question")).resolves.toBeNull();

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Observation: 错误:未找到名为 'missing' 的工具。");
  });
});
