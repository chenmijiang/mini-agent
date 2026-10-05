import { afterEach, describe, expect, it, vi } from "vitest";

import type { HelloAgentsLLM } from "../core/llm";
import { PlanAndSolveAgent } from "./plan_solve_agent";

type InvokeMessages = Parameters<HelloAgentsLLM["invoke"]>[0];
type InvokeOptions = Parameters<HelloAgentsLLM["invoke"]>[1];

function fakeLLM(responses: string[]) {
  const prompts: string[] = [];
  const options: (InvokeOptions | undefined)[] = [];
  const invoke = vi.fn(async (messages: InvokeMessages, requestOptions?: InvokeOptions) => {
    const content = messages.at(-1)?.content;
    prompts.push(typeof content === "string" ? content : "");
    options.push(requestOptions);
    return responses.shift() ?? "";
  });
  return { llm: { invoke } as unknown as HelloAgentsLLM, invoke, prompts, options };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlanAndSolveAgent", () => {
  it("executes the generated steps in order and records the final exchange", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { llm, prompts, options } = fakeLLM([
      '```json\n["step one", "step two"]\n```',
      "result one",
      "final result",
    ]);
    const agent = new PlanAndSolveAgent("planner", llm);

    const answer = await agent.run("solve this", { temperature: 0.2 });

    expect(answer).toBe("final result");
    expect(prompts[1]).toContain('"step one"');
    expect(prompts[2]).toContain("步骤 1: step one\n结果: result one");
    expect(options.every((option) => option?.temperature === 0.2)).toBe(true);
    expect(agent.get_history().map(({ role, content }) => [role, content])).toEqual([
      ["user", "solve this"],
      ["assistant", "final result"],
    ]);
  });

  it("stops when the planner response is not a valid fenced plan", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { llm, invoke } = fakeLLM(["not a plan"]);
    const agent = new PlanAndSolveAgent("planner", llm);

    const answer = await agent.run("solve this");

    expect(answer).toBe("无法生成有效的行动计划，任务终止。");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(agent.get_history().map(({ role }) => role)).toEqual(["user", "assistant"]);
  });
});
