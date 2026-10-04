import { Agent } from "../core/agent";
import type { Config } from "../core/config";
import type { HelloAgentsLLM } from "../core/llm";
import { Message } from "../core/message";
import type { Tool } from "../tools/base";
import { ToolRegistry } from "../tools/registry";

type InvokeOptions = NonNullable<Parameters<HelloAgentsLLM["invoke"]>[1]>;
type ExpandableTool = Tool & {
  auto_expand?: boolean;
  _available_tools?: { name: string; description?: string }[];
};

export const DEFAULT_REACT_PROMPT = `你是一个具备推理和行动能力的AI助手。你可以通过思考分析问题，然后调用合适的工具来获取信息，最终给出准确的答案。

## 可用工具
{tools}

## 工作流程
请严格按照以下格式进行回应，每次只能执行一个步骤：

Thought: 分析问题，确定需要什么信息，制定研究策略。
Action: 选择合适的工具获取信息，格式为：
- \`{{tool_name}}[{{tool_input}}]\`：调用工具获取信息。
- \`Finish[研究结论]\`：当你有足够信息得出结论时。

## 重要提醒
1. 每次回应必须包含Thought和Action两部分
2. 工具调用的格式必须严格遵循：工具名[参数]
3. 只有当你确信有足够信息回答问题时，才使用Finish
4. 如果工具返回的信息不够，继续使用其他工具或相同工具的不同参数

## 当前任务
**Question:** {question}

## 执行历史
{history}

现在开始你的推理和行动：`;

/** 结合推理和工具调用，迭代执行直到得到最终答案。 */
export class ReActAgent extends Agent {
  tool_registry: ToolRegistry;
  max_steps: number;
  current_history: string[] = [];
  prompt_template: string;

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    tool_registry?: ToolRegistry,
    system_prompt?: string,
    config?: Config,
    max_steps = 5,
    custom_prompt?: string,
  ) {
    super(name, llm, system_prompt, config);
    this.tool_registry = tool_registry ?? new ToolRegistry();
    this.max_steps = max_steps;
    this.prompt_template = custom_prompt || DEFAULT_REACT_PROMPT;
  }

  add_tool(tool: ExpandableTool): void {
    if (tool.auto_expand && tool._available_tools?.length) {
      for (const mcpTool of tool._available_tools) {
        this.tool_registry.registerFunction(
          `${tool.name}_${mcpTool.name}`,
          mcpTool.description ?? "",
          (inputText) =>
            tool.run({
              action: "call_tool",
              tool_name: mcpTool.name,
              arguments: { input: inputText },
            }),
        );
      }
      console.log(`✅ MCP工具 '${tool.name}' 已展开为 ${tool._available_tools.length} 个独立工具`);
      return;
    }
    this.tool_registry.registerTool(tool);
  }

  async run(input_text: string, kwargs: Record<string, unknown> = {}): Promise<string> {
    this.current_history = [];
    console.log(`\n🤖 ${this.name} 开始处理问题: ${input_text}`);

    for (let currentStep = 1; currentStep <= this.max_steps; currentStep++) {
      console.log(`\n--- 第 ${currentStep} 步 ---`);
      const values: Record<string, string> = {
        tools: this.tool_registry.getToolsDescription(),
        question: input_text,
        history: this.current_history.join("\n"),
      };
      // 一次替换，避免将问题或工具结果里的花括号再次当作模板处理。
      const prompt = this.prompt_template.replace(
        /\{\{|\}\}|\{(tools|question|history)\}/g,
        (match: string, key: string | undefined) => {
          if (match === "{{") return "{";
          if (match === "}}") return "}";
          return values[key!]!;
        },
      );
      const responseText = await this.llm.invoke(
        [{ role: "user", content: prompt }],
        kwargs as InvokeOptions,
      );
      if (!responseText) {
        console.log("❌ 错误：LLM未能返回有效响应。");
        break;
      }

      const [thought, action] = this.parse_output(responseText);
      if (thought) console.log(`🤔 思考: ${thought}`);
      if (!action) {
        console.log("⚠️ 警告：未能解析出有效的Action，流程终止。");
        break;
      }

      if (action.startsWith("Finish")) {
        const finalAnswer = this.parse_action_input(action);
        console.log(`🎉 最终答案: ${finalAnswer}`);
        this.add_message(new Message(input_text, "user"));
        this.add_message(new Message(finalAnswer, "assistant"));
        return finalAnswer;
      }

      const [toolName, toolInput] = this.parse_action(action);
      if (!toolName || toolInput === undefined) {
        this.current_history.push("Observation: 无效的Action格式，请检查。");
        continue;
      }

      console.log(`🎬 行动: ${toolName}[${toolInput}]`);
      const result = await this.tool_registry.executeTool(toolName, toolInput);
      const observation = typeof result === "string" ? result : JSON.stringify(result);
      console.log(`👀 观察: ${observation}`);
      this.current_history.push(`Action: ${action}`, `Observation: ${observation}`);
    }

    console.log("⏰ 已达到最大步数，流程终止。");
    const finalAnswer = "抱歉，我无法在限定步数内完成这个任务。";
    this.add_message(new Message(input_text, "user"));
    this.add_message(new Message(finalAnswer, "assistant"));
    return finalAnswer;
  }

  private parse_output(text: string): [string | undefined, string | undefined] {
    return [/Thought: (.*)/.exec(text)?.[1]?.trim(), /Action: (.*)/.exec(text)?.[1]?.trim()];
  }

  private parse_action(action_text: string): [string | undefined, string | undefined] {
    const match = /^(\w+)\[(.*)\]/.exec(action_text);
    return [match?.[1], match?.[2]];
  }

  private parse_action_input(action_text: string): string {
    return /^\w+\[(.*)\]/.exec(action_text)?.[1] ?? "";
  }
}
