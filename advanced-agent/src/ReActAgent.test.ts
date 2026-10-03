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
        "Thought: Search for the answer.\nAction: search[react]",
        "Thought: The result is sufficient.\nAction: Finish[ReAct uses reasoning and actions.]",
      ],
      prompts,
    );

    await expect(new ReActAgent(llm, toolExecutor).run("What is ReAct?")).resolves.toBe(
      "ReAct uses reasoning and actions.",
    );

    expect(inputs).toEqual(["react"]);
    expect(prompts[1]).toContain("History: Action: search[react]\nObservation: result for react");
  });

  it("uses only the first Action when the response contains multiple Thought/Action pairs", async () => {
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
        "Thought: Search the first query.\nAction: search[first]\nThought: Search a second query.\nAction: search[second]",
        "Thought: The first result is enough.\nAction: Finish[done]",
      ],
      prompts,
    );

    await expect(new ReActAgent(llm, toolExecutor).run("Question")).resolves.toBe("done");

    expect(inputs).toEqual(["first"]);
  });

  it("stops when the response has no Action", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prompts: string[] = [];
    const llm = createLlm(["Thought: I need more information."], prompts);

    await expect(new ReActAgent(llm, new ToolExecutor(), 3).run("Question")).resolves.toBeNull();

    expect(prompts).toHaveLength(1);
  });

  it("continues after an invalid tool input without recording a tool observation", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prompts: string[] = [];
    const inputs: string[] = [];
    const toolExecutor = new ToolExecutor();
    toolExecutor.registerTool("search", "Search the web", async (input) => {
      inputs.push(input);
      return "result";
    });
    const llm = createLlm(
      ["Thought: Try the tool.\nAction: search[]", "Thought: Finished.\nAction: Finish[done]"],
      prompts,
    );

    await expect(new ReActAgent(llm, toolExecutor).run("Question")).resolves.toBe("done");

    expect(inputs).toEqual([]);
    expect(prompts[1]).toContain("History: \n");
  });

  it("records missing-tool errors and stops at maxSteps", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prompts: string[] = [];
    const llm = createLlm(
      [
        "Thought: Try an unavailable tool.\nAction: missing[first]",
        "Thought: Try again.\nAction: missing[second]",
        "Thought: Do not finish.\nAction: Finish[not returned]",
      ],
      prompts,
    );

    await expect(new ReActAgent(llm, new ToolExecutor(), 2).run("Question")).resolves.toBeNull();

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Observation: 错误:未找到名为 'missing' 的工具。");
  });
});
