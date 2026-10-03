import { readFile } from "node:fs/promises";

import type { HelloAgentsLLM } from "./HelloAgentsLLM";
import { ToolExecutor } from "./ToolExecutor";
type ReActAction =
  | { type: "tool"; name: string; input: string }
  | { type: "finish"; answer: string };

interface ReActResponse {
  thought: string;
  action: ReActAction;
}
interface RawReActResponse {
  thought: unknown;
  action: unknown;
}

interface RawReActAction {
  type?: unknown;
  name?: unknown;
  input?: unknown;
  answer?: unknown;
}

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

      const response = this.parseOutput(responseText);
      if (!response) {
        console.log("警告:未能解析有效的 JSON ReAct 响应，流程终止。");
        break;
      }

      if (response.thought) {
        console.log(`思考: ${response.thought}`);
      }

      if (response.action.type === "finish") {
        console.log(`🎉 最终答案: ${response.action.answer}`);
        return response.action.answer;
      }

      const { name: toolName, input: toolInput } = response.action;
      console.log(`🎬 行动: ${toolName}(${toolInput})`);

      const toolFunction = this.toolExecutor.getTool(toolName);
      const observation = toolFunction
        ? await toolFunction(toolInput)
        : `错误:未找到名为 '${toolName}' 的工具。`;
      console.log(`👀 观察: ${observation}`);

      this.history.push(`Action: ${JSON.stringify(response.action)}`);
      this.history.push(`Observation: ${observation}`);
    }

    console.log("已达到最大步数，流程终止。");
    return null;
  }

  private parseOutput(text: string): ReActResponse | null {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return null;
    }

    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      !("thought" in value) ||
      !("action" in value)
    ) {
      return null;
    }

    const response = value as RawReActResponse;
    if (
      typeof response.thought !== "string" ||
      typeof response.action !== "object" ||
      response.action === null ||
      Array.isArray(response.action)
    ) {
      return null;
    }

    const action = response.action as RawReActAction;
    if (action.type === "finish" && typeof action.answer === "string") {
      return { thought: response.thought, action: { type: "finish", answer: action.answer } };
    }

    if (
      action.type !== "tool" ||
      typeof action.name !== "string" ||
      action.name.length === 0 ||
      typeof action.input !== "string"
    ) {
      return null;
    }

    return {
      thought: response.thought,
      action: { type: "tool", name: action.name, input: action.input },
    };
  }
}
