import type { ChatCompletionMessageParam } from "openai/resources";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanAndSolveAgent } from ".";

function createLlm(outputs: Array<string | null>, prompts: string[]) {
  return {
    async think(messages: ChatCompletionMessageParam[]): Promise<string | null> {
      const content = messages[0]?.content;
      prompts.push(typeof content === "string" ? content : JSON.stringify(content));
      return outputs.shift() ?? null;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlanAndSolveAgent", () => {
  it("executes planned steps in order and passes prior results forward", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const prompts: string[] = [];
    const llm = createLlm(
      ['```json\n["计算周二销量", "计算周三销量", "计算三天总销量"]\n```', "30个", "25个", "60个"],
      prompts,
    );

    const answer = await new PlanAndSolveAgent(llm).run(
      "周一卖出15个苹果，周二是两倍，周三比周二少5个，三天共卖出多少？",
    );

    expect(answer).toBe("60个");
    expect(prompts[2]).toContain("步骤 1: 计算周二销量\n结果: 30个");
    expect(prompts[3]).toContain("步骤 2: 计算周三销量\n结果: 25个");
  });

  it("stops without executing when the model returns an invalid plan", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const prompts: string[] = [];
    const llm = createLlm(["not a JSON plan"], prompts);

    await expect(new PlanAndSolveAgent(llm).run("算一下")).resolves.toBeNull();
    expect(prompts).toHaveLength(1);
  });
});
