import { Agent } from "../core/agent";
import type { Config } from "../core/config";
import type { HelloAgentsLLM } from "../core/llm";
import { Message } from "../core/message";
import type { Tool } from "../tools/base";
import { ToolRegistry } from "../tools/registry";

type LLMMessage = Parameters<HelloAgentsLLM["invoke"]>[0][number];
type InvokeOptions = NonNullable<Parameters<HelloAgentsLLM["invoke"]>[1]>;

interface ToolCall {
  tool_name: string;
  parameters: string;
  original: string;
}

/** 简单的对话 Agent，支持可选的工具调用。 */
export class SimpleAgent extends Agent {
  tool_registry: ToolRegistry | undefined;
  enable_tool_calling: boolean;

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    system_prompt?: string,
    config?: Config,
    tool_registry?: ToolRegistry,
    enable_tool_calling = true,
  ) {
    super(name, llm, system_prompt, config);
    this.tool_registry = tool_registry;
    this.enable_tool_calling = enable_tool_calling && tool_registry !== undefined;
  }

  private get_enhanced_system_prompt(): string {
    const basePrompt = this.system_prompt || "你是一个有用的AI助手。";
    if (!this.enable_tool_calling || !this.tool_registry) return basePrompt;

    const toolsDescription = this.tool_registry.getToolsDescription();
    if (!toolsDescription || toolsDescription === "暂无可用工具") return basePrompt;

    return [
      basePrompt,
      "",
      "## 可用工具",
      "你可以使用以下工具来帮助回答问题：",
      toolsDescription,
      "",
      "## 工具调用格式",
      "当需要使用工具时，请使用以下格式：",
      "",
      "`[TOOL_CALL:{tool_name}:{parameters}]`",
      "",
      "### 参数格式说明",
      "1. **多个参数**：使用 `key=value` 格式，用逗号分隔",
      "   示例：`[TOOL_CALL:calculator_multiply:a=12,b=8]`",
      "   示例：`[TOOL_CALL:filesystem_read_file:path=README.md]`",
      "",
      "2. **单个参数**：直接使用 `key=value`",
      "   示例：`[TOOL_CALL:search:query=Python编程]`",
      "",
      "3. **简单查询**：可以直接传入文本",
      "   示例：`[TOOL_CALL:search:Python编程]`",
      "",
      "### 重要提示",
      "- 参数名必须与工具定义的参数名完全匹配",
      '- 数字参数直接写数字，不需要引号：`a=12` 而不是 `a="12"`',
      "- 文件路径等字符串参数直接写：`path=README.md`",
      "- 工具调用结果会自动插入到对话中，然后你可以基于结果继续回答",
    ].join("\n");
  }

  private parse_tool_calls(text: string): ToolCall[] {
    const pattern = /\[TOOL_CALL:([^:]+):([^\]]+)\]/g;
    return Array.from(text.matchAll(pattern), ([original, tool_name, parameters]) => ({
      tool_name: tool_name.trim(),
      parameters: parameters.trim(),
      original,
    }));
  }

  private async execute_tool_call(tool_name: string, parameters: string): Promise<string> {
    if (!this.tool_registry) return "❌ 错误：未配置工具注册表";

    try {
      const tool = this.tool_registry.getTool(tool_name);
      if (!tool) return `❌ 错误：未找到工具 '${tool_name}'`;

      const paramDict = this.parse_tool_parameters(tool_name, parameters);
      const result = await tool.run(paramDict);
      const resultText = typeof result === "string" ? result : JSON.stringify(result);
      return `🔧 工具 ${tool_name} 执行结果：\n${resultText}`;
    } catch (error) {
      return `❌ 工具调用失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private parse_tool_parameters(tool_name: string, parameters: string): Record<string, unknown> {
    if (parameters.trim().startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(parameters);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          return this.convert_parameter_types(tool_name, parsed as Record<string, unknown>);
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }

    const paramDict: Record<string, unknown> = {};
    if (parameters.includes("=")) {
      for (const pair of parameters.split(",")) {
        const separator = pair.indexOf("=");
        if (separator >= 0) {
          paramDict[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
        }
      }
      return this.infer_action(tool_name, this.convert_parameter_types(tool_name, paramDict));
    }

    return this.infer_simple_parameters(tool_name, parameters);
  }

  private convert_parameter_types(
    tool_name: string,
    param_dict: Record<string, unknown>,
  ): Record<string, unknown> {
    const tool = this.tool_registry?.getTool(tool_name);
    if (!tool) return param_dict;

    let toolParams;
    try {
      toolParams = tool.getParameters();
    } catch {
      return param_dict;
    }

    const paramTypes = new Map(toolParams.map(({ name, type }) => [name, type]));
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(param_dict)) {
      const paramType = paramTypes.get(key);
      if (typeof value === "string" && paramType === "number") {
        const number = Number(value);
        converted[key] = value.trim() && !Number.isNaN(number) ? number : value;
      } else if (typeof value === "string" && paramType === "integer") {
        const integer = value.trim();
        converted[key] = /^[+-]?\d+$/.test(integer) ? Number(integer) : value;
      } else if (paramType === "boolean") {
        converted[key] =
          typeof value === "string"
            ? ["true", "1", "yes"].includes(value.toLowerCase())
            : Boolean(value);
      } else {
        converted[key] = value;
      }
    }
    return converted;
  }

  private infer_action(
    tool_name: string,
    param_dict: Record<string, unknown>,
  ): Record<string, unknown> {
    if (tool_name === "memory") {
      if ("recall" in param_dict) {
        param_dict.action = "search";
        param_dict.query = param_dict.recall;
        delete param_dict.recall;
      } else if ("store" in param_dict) {
        param_dict.action = "add";
        param_dict.content = param_dict.store;
        delete param_dict.store;
      } else if ("query" in param_dict) {
        param_dict.action = "search";
      } else if ("content" in param_dict) {
        param_dict.action = "add";
      }
    } else if (tool_name === "rag") {
      if ("search" in param_dict) {
        param_dict.action = "search";
        param_dict.query = param_dict.search;
        delete param_dict.search;
      } else if ("query" in param_dict) {
        param_dict.action = "search";
      } else if ("text" in param_dict) {
        param_dict.action = "add_text";
      }
    }
    return param_dict;
  }

  private infer_simple_parameters(tool_name: string, parameters: string): Record<string, unknown> {
    if (tool_name === "rag" || tool_name === "memory") {
      return { action: "search", query: parameters };
    }
    return { input: parameters };
  }

  async run(input_text: string, kwargs: Record<string, unknown> = {}): Promise<string> {
    const { max_tool_iterations: maxToolIterationsOption = 3, ...llmOptions } = kwargs;
    const maxToolIterations = maxToolIterationsOption as number;
    const invokeOptions = llmOptions as InvokeOptions;
    const messages: LLMMessage[] = [
      { role: "system", content: this.get_enhanced_system_prompt() },
      ...this._history.map(
        (message) => ({ role: message.role, content: message.content }) as LLMMessage,
      ),
      { role: "user", content: input_text },
    ];

    if (!this.enable_tool_calling) {
      const response = await this.llm.invoke(messages, invokeOptions);
      this.add_message(new Message(input_text, "user"));
      this.add_message(new Message(response, "assistant"));
      return response;
    }

    let currentIteration = 0;
    let finalResponse = "";
    while (currentIteration < maxToolIterations) {
      const response = await this.llm.invoke(messages, invokeOptions);
      const toolCalls = this.parse_tool_calls(response);
      if (!toolCalls.length) {
        finalResponse = response;
        break;
      }

      messages.push({ role: "assistant", content: response });
      const toolResults: string[] = [];
      for (const call of toolCalls) {
        toolResults.push(await this.execute_tool_call(call.tool_name, call.parameters));
      }
      messages.push({
        role: "user",
        content: `工具执行结果：\n${toolResults.join("\n\n")}\n\n请基于这些结果给出完整的回答。`,
      });
      currentIteration += 1;
    }

    if (currentIteration >= maxToolIterations && !finalResponse) {
      finalResponse = await this.llm.invoke(messages, invokeOptions);
    }

    this.add_message(new Message(input_text, "user"));
    this.add_message(new Message(finalResponse, "assistant"));
    return finalResponse;
  }

  add_tool(tool: Tool, auto_expand = true): void {
    if (!this.tool_registry) {
      this.tool_registry = new ToolRegistry();
      this.enable_tool_calling = true;
    }
    this.tool_registry.registerTool(tool, auto_expand);
  }

  remove_tool(tool_name: string): boolean {
    if (!this.tool_registry || !this.tool_registry.listTools().includes(tool_name)) return false;
    this.tool_registry.unregister(tool_name);
    return true;
  }

  list_tools(): string[] {
    return this.tool_registry?.listTools() ?? [];
  }

  has_tools(): boolean {
    return this.enable_tool_calling && this.tool_registry !== undefined;
  }

  async *stream_run(
    input_text: string,
    kwargs: { temperature?: number } = {},
  ): AsyncGenerator<string> {
    const messages: LLMMessage[] = [];
    if (this.system_prompt) messages.push({ role: "system", content: this.system_prompt });
    for (const message of this._history) {
      messages.push({ role: message.role, content: message.content } as LLMMessage);
    }
    messages.push({ role: "user", content: input_text });

    let fullResponse = "";
    for await (const chunk of this.llm.streamInvoke(messages, kwargs)) {
      fullResponse += chunk;
      yield chunk;
    }

    this.add_message(new Message(input_text, "user"));
    this.add_message(new Message(fullResponse, "assistant"));
  }
}
