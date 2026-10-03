import { readFile } from "fs/promises";

import type { HelloAgentsLLM } from "../HelloAgentsLLM";

export class Executor {
  constructor(private readonly llmClient: Pick<HelloAgentsLLM, "think">) {}

  async execute(question: string, plan: string[]): Promise<string> {
    let history = "";
    let responseText = "";
    const promptTemplate = await readFile(
      new URL("../prompts/PlanAndSolveExecutor.md", import.meta.url),
      "utf8",
    );

    console.log("\n--- 正在执行计划 ---");

    for (const [index, currentStep] of plan.entries()) {
      console.log(`\n-> 正在执行步骤 ${index + 1}/${plan.length}: ${currentStep}`);
      const values: Record<string, string> = {
        question,
        plan: plan.map((step, stepIndex) => `${stepIndex + 1}. ${step}`).join("\n"),
        history: history || "无",
        current_step: currentStep,
      };
      const prompt = promptTemplate.replace(
        /\{(question|plan|history|current_step)\}/g,
        (_match: string, key: string) => values[key] ?? "",
      );
      responseText = (await this.llmClient.think([{ role: "user", content: prompt }])) ?? "";
      history += `步骤 ${index + 1}: ${currentStep}\n结果: ${responseText}\n\n`;
      console.log(`✅ 步骤 ${index + 1} 已完成，结果: ${responseText}`);
    }

    return responseText;
  }
}
