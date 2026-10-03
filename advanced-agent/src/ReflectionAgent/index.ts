import { readFile } from "node:fs/promises";

import type { HelloAgentsLLM } from "../HelloAgentsLLM";
import { Memory } from "./Memory";

function fillPrompt(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? "");
}

export class ReflectionAgent {
  private readonly memory = new Memory();

  constructor(
    private readonly llmClient: Pick<HelloAgentsLLM, "think">,
    private readonly maxIterations: number = 3,
  ) {}

  async run(task: string): Promise<string> {
    console.log(`\n--- 开始处理任务 ---\n任务: ${task}`);

    const [initialPromptTemplate, reflectPromptTemplate, refinePromptTemplate] = await Promise.all([
      readFile(new URL("../prompts/ReflectionInitial.md", import.meta.url), "utf8"),
      readFile(new URL("../prompts/ReflectionReflect.md", import.meta.url), "utf8"),
      readFile(new URL("../prompts/ReflectionRefine.md", import.meta.url), "utf8"),
    ]);

    console.log("\n--- 正在进行初始尝试 ---");
    const initialCode = await this.getLlmResponse(fillPrompt(initialPromptTemplate, { task }));
    this.memory.addRecord("execution", initialCode);

    for (let iteration = 0; iteration < this.maxIterations; iteration += 1) {
      console.log(`\n--- 第 ${iteration + 1}/${this.maxIterations} 轮迭代 ---`);

      console.log("\n-> 正在进行反思...");
      const lastCode = this.memory.getLastExecution() ?? "";
      const reflectPrompt = fillPrompt(reflectPromptTemplate, { task }).replace(
        "/* CODE_PLACEHOLDER */",
        () => lastCode,
      );
      const feedback = await this.getLlmResponse(reflectPrompt);
      this.memory.addRecord("reflection", feedback);

      if (feedback.includes("无需改进")) {
        console.log("\n✅ 反思认为代码已无需改进，任务完成。");
        break;
      }

      console.log("\n-> 正在进行优化...");
      const refinedCode = await this.getLlmResponse(
        fillPrompt(refinePromptTemplate, {
          task,
          last_code_attempt: lastCode,
          feedback,
        }),
      );
      this.memory.addRecord("execution", refinedCode);
    }

    const finalCode = this.memory.getLastExecution() ?? "";
    console.log(`\n--- 任务完成 ---\n最终生成的代码:\n\`\`\`typescript\n${finalCode}\n\`\`\``);
    return finalCode;
  }

  private async getLlmResponse(prompt: string): Promise<string> {
    const response = await this.llmClient.think([{ role: "user", content: prompt }]);
    return response ?? "";
  }
}
