import { readFile } from "node:fs/promises";

import type { HelloAgentsLLM } from "./HelloAgentsLLM";
import { ToolExecutor } from "./ToolExecutor";

export class ReActAgent {
  private history: string[] = [];

  constructor(
    private readonly llmClient: Pick<HelloAgentsLLM, "think">,
    private readonly toolExecutor: ToolExecutor,
    private readonly maxSteps: number = 5,
  ) {}

  async run(question: string): Promise<string | null> {
    this.history = [];
    let currentStep = 0;
    const promptTemplate = await readFile(new URL("./prompts/ReAct.md", import.meta.url), "utf8");

    while (currentStep < this.maxSteps) {
      currentStep += 1;
      console.log(`--- 第 ${currentStep} 步 ---`);

      const toolsDesc = this.toolExecutor.getAvailableTools();
      const historyStr = this.history.join("\n");
      const prompt = promptTemplate.replace(/\{(tools|question|history)\}/g, (placeholder) => {
        switch (placeholder) {
          case "{tools}":
            return toolsDesc;
          case "{question}":
            return question;
          case "{history}":
            return historyStr;
          default:
            return placeholder;
        }
      });
      const responseText = await this.llmClient.think([{ role: "user", content: prompt }]);

      if (!responseText) {
        console.log("错误:LLM未能返回有效响应。");
        break;
      }

      const [thought, action] = this.parseOutput(responseText);
      if (thought) {
        console.log(`思考: ${thought}`);
      }

      if (!action) {
        console.log("警告:未能解析出有效的Action，流程终止。");
        break;
      }

      if (action.startsWith("Finish")) {
        const finishMatch = action.match(/Finish\[(.*)\]/s);
        if (!finishMatch) {
          console.log("警告:未能解析出有效的Finish答案，流程终止。");
          break;
        }

        const finalAnswer = finishMatch[1] ?? "";
        console.log(`🎉 最终答案: ${finalAnswer}`);
        return finalAnswer;
      }

      const [toolName, toolInput] = this.parseAction(action);
      if (!toolName || !toolInput) {
        console.log("警告:无效的Action格式。");
        continue;
      }

      console.log(`🎬 行动: ${toolName}[${toolInput}]`);

      const toolFunction = this.toolExecutor.getTool(toolName);
      const observation = toolFunction
        ? await toolFunction(toolInput)
        : `错误:未找到名为 '${toolName}' 的工具。`;
      console.log(`👀 观察: ${observation}`);

      this.history.push(`Action: ${action}`);
      this.history.push(`Observation: ${observation}`);
    }

    console.log("已达到最大步数，流程终止。");
    return null;
  }

  private parseOutput(text: string): [string | null, string | null] {
    const thoughtMatch = text.match(/Thought:\s*(.*?)(?=\nAction:|$)/s);
    const actionMatch = text.match(/Action:\s*(.*?)(?=\n\s*(?:Thought:|Action:|Observation:)|$)/s);
    const thought = thoughtMatch?.[1]?.trim() ?? null;
    const action = actionMatch?.[1]?.trim() ?? null;
    return [thought, action];
  }

  private parseAction(actionText: string): [string | null, string | null] {
    const match = actionText.match(/(\w+)\[(.*)\]/s);
    if (match) {
      return [match[1] ?? null, match[2] ?? null];
    }
    return [null, null];
  }
}
