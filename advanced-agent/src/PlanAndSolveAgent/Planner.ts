import { readFile } from "node:fs/promises";

import type { HelloAgentsLLM } from "../HelloAgentsLLM";

export class Planner {
  constructor(private readonly llmClient: Pick<HelloAgentsLLM, "think">) {}

  async plan(question: string): Promise<string[]> {
    const promptTemplate = await readFile(
      new URL("../prompts/PlanAndSolve.md", import.meta.url),
      "utf8",
    );
    const prompt = promptTemplate.replace("{question}", question);

    console.log("--- 正在生成计划 ---");
    const responseText = (await this.llmClient.think([{ role: "user", content: prompt }])) ?? "";
    console.log(`✅ 计划已生成:\n${responseText}`);

    try {
      const codeBlock = responseText.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const planText = (codeBlock?.[1] ?? responseText).trim();
      const parsed: unknown = JSON.parse(planText);
      if (
        !Array.isArray(parsed) ||
        !parsed.every((step: unknown) => typeof step === "string" && step.trim().length > 0)
      ) {
        throw new Error("计划必须是非空字符串组成的数组");
      }
      return parsed as string[];
    } catch (error) {
      console.error(`❌ 解析计划时出错: ${String(error)}`);
      console.error(`原始响应: ${responseText}`);
      return [];
    }
  }
}
