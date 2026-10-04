import { describe, expect, it, vi } from "vitest";

import type { HelloAgentsLLM } from "../core/llm";
import { Memory, ReflectionAgent } from "./reflection_agent";

type InvokeMessages = Parameters<HelloAgentsLLM["invoke"]>[0];
type Response = string | Error;

function fakeLLM(responses: Response[]) {
  const prompts: string[] = [];
  const invoke = vi.fn(async (messages: InvokeMessages) => {
    const content = messages.at(-1)?.content;
    prompts.push(typeof content === "string" ? content : "");
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response ?? "";
  });
  return { llm: { invoke } as unknown as HelloAgentsLLM, invoke, prompts };
}

describe("ReflectionAgent", () => {
  it("bases each refinement on the latest result and its feedback", async () => {
    const { llm, invoke, prompts } = fakeLLM([
      "attempt one",
      "feedback one",
      "attempt two",
      "feedback two",
      "attempt three",
    ]);
    const agent = new ReflectionAgent("reflection", llm, undefined, undefined, 2);

    await expect(agent.run("solve the task")).resolves.toBe("attempt three");

    expect(invoke).toHaveBeenCalledTimes(5);
    expect(prompts[1]).toContain("attempt one");
    expect(prompts[2]).toContain("attempt one");
    expect(prompts[2]).toContain("feedback one");
    expect(prompts[3]).toContain("attempt two");
    expect(prompts[4]).toContain("attempt two");
    expect(prompts[4]).toContain("feedback two");
  });

  it.each([
    ["Chinese", "本次无需改进。"],
    ["English, case-insensitive", "There is NO NEED FOR IMPROVEMENT."],
  ])("stops after %s feedback without another refinement", async (_language, feedback) => {
    const { llm, invoke } = fakeLLM(["best result", feedback]);
    const agent = new ReflectionAgent("reflection", llm, undefined, undefined, 3);

    await expect(agent.run("task")).resolves.toBe("best result");

    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("still performs the initial execution with zero reflection iterations", async () => {
    const { llm, invoke } = fakeLLM(["initial result"]);
    const agent = new ReflectionAgent("reflection", llm, undefined, undefined, 0);

    await expect(agent.run("task")).resolves.toBe("initial result");

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("returns the last refinement and stops at the configured iteration cap", async () => {
    const { llm, invoke } = fakeLLM([
      "initial result",
      "please improve it",
      "refined result",
      "must not be requested",
    ]);
    const agent = new ReflectionAgent("reflection", llm, undefined, undefined, 1);

    await expect(agent.run("task")).resolves.toBe("refined result");

    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it("resets per-run memory while retaining completed exchanges in history", async () => {
    const { llm } = fakeLLM(["first result", "second result"]);
    const agent = new ReflectionAgent("reflection", llm, undefined, undefined, 0);

    await agent.run("first task");
    await agent.run("second task");

    expect(agent.memory.get_trajectory()).toContain("second result");
    expect(agent.memory.get_trajectory()).not.toContain("first result");
    expect(agent.get_history().map(({ role, content }) => [role, content])).toEqual([
      ["user", "first task"],
      ["assistant", "first result"],
      ["user", "second task"],
      ["assistant", "second result"],
    ]);
  });

  it("returns and records an empty final execution", async () => {
    const { llm, invoke } = fakeLLM([""]);
    const agent = new ReflectionAgent("reflection", llm, undefined, undefined, 0);

    await expect(agent.run("task")).resolves.toBe("");

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(agent.get_history().map(({ role, content }) => [role, content])).toEqual([
      ["user", "task"],
      ["assistant", ""],
    ]);
  });

  it("preserves brace content in custom templates and supports escaped braces", async () => {
    const task = "calculate {content}";
    const attempt = "answer {feedback}";
    const feedback = "review {last_attempt}";
    const customPrompts = {
      initial: "initial {{{task}}}",
      reflect: "reflect {{{task}}}: {{{content}}}",
      refine: "refine {{{task}}}: {{{last_attempt}}}: {{{feedback}}}",
    };
    const { llm, prompts } = fakeLLM([attempt, feedback, "final {task}"]);
    const agent = new ReflectionAgent("reflection", llm, undefined, undefined, 1, customPrompts);

    await expect(agent.run(task)).resolves.toBe("final {task}");

    expect(prompts[0]).toContain(`{${task}}`);
    expect(prompts[1]).toContain(`{${task}}`);
    expect(prompts[1]).toContain(`{${attempt}}`);
    expect(prompts[2]).toContain(`{${task}}`);
    expect(prompts[2]).toContain(`{${attempt}}`);
    expect(prompts[2]).toContain(`{${feedback}}`);
  });

  it("propagates model failures without adding a completed exchange", async () => {
    const failure = new Error("model unavailable");
    const { llm } = fakeLLM(["initial result", "improve it", failure]);
    const agent = new ReflectionAgent("reflection", llm, undefined, undefined, 1);

    await expect(agent.run("task")).rejects.toBe(failure);

    expect(agent.get_history()).toEqual([]);
  });
});

describe("Memory", () => {
  it("keeps known records chronological and returns the latest execution, including an empty one", () => {
    const memory = new Memory();
    memory.add_record("execution", "first result");
    memory.add_record("reflection", "first feedback");
    memory.add_record("other", "ignored record");
    memory.add_record("execution", "latest result");

    const trajectory = memory.get_trajectory();
    const firstResult = trajectory.indexOf("first result");
    const firstFeedback = trajectory.indexOf("first feedback");
    const latestResult = trajectory.indexOf("latest result");

    expect(firstResult).toBeGreaterThanOrEqual(0);
    expect(firstResult).toBeLessThan(firstFeedback);
    expect(firstFeedback).toBeLessThan(latestResult);
    expect(trajectory).toContain("\n\n");
    expect(trajectory).not.toContain("ignored record");
    expect(memory.get_last_execution()).toBe("latest result");

    memory.add_record("execution", "");
    expect(memory.get_last_execution()).toBe("");
  });
});
