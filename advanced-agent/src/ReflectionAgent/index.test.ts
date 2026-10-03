import type { ChatCompletionMessageParam } from "openai/resources";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReflectionAgent } from ".";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReflectionAgent", () => {
  it("refines the previous attempt and returns the latest code after no-improvement feedback", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const task = "Write a TypeScript function that lists primes from 1 through n.";
    const firstCode = "function primes(n: number): number[] { return []; }";
    const feedback = "试除法重复计算，建议改用筛法。";
    const refinedCode = "function primes(n: number): number[] { return sieve(n); }";
    const outputs = [firstCode, feedback, refinedCode, "无需改进，已经使用筛法。"];
    const prompts: string[] = [];
    const llmClient = {
      async think(messages: ChatCompletionMessageParam[]): Promise<string | null> {
        const content = messages[0]?.content;
        prompts.push(typeof content === "string" ? content : "");
        return outputs.shift() ?? null;
      },
    };

    await expect(new ReflectionAgent(llmClient).run(task)).resolves.toBe(refinedCode);

    expect(prompts).toHaveLength(4);
    expect(prompts[0]).toContain(task);
    expect(prompts[0]).toContain("TypeScript");
    expect(prompts[1]).toContain("TypeScript");
    expect(prompts[1]).toContain("```typescript");
    expect(prompts[2]).toContain("TypeScript");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("```typescript"));
    expect(prompts[1]).toContain(firstCode);
    expect(prompts[2]).toContain(firstCode);
    expect(prompts[2]).toContain(feedback);
    expect(prompts[3]).toContain(refinedCode);
  });
  it("stops after the configured number of reflection rounds", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const outputs = ["first code", "please improve", "refined code", "unexpected extra feedback"];
    const prompts: string[] = [];
    const llmClient = {
      async think(messages: ChatCompletionMessageParam[]): Promise<string | null> {
        const content = messages[0]?.content;
        prompts.push(typeof content === "string" ? content : "");
        return outputs.shift() ?? null;
      },
    };

    await expect(new ReflectionAgent(llmClient, 1).run("task")).resolves.toBe("refined code");

    expect(prompts).toHaveLength(3);
  });
});
