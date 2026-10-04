import type { ToolResult } from "./base";
import { ToolRegistry } from "./registry";

interface ToolChainStep {
  tool_name: string;
  input_template: string;
  output_key: string;
}

/** 工具链 - 支持多个工具的顺序执行。 */
export class ToolChain {
  readonly steps: ToolChainStep[] = [];

  constructor(
    public name: string,
    public description: string,
  ) {}

  addStep(toolName: string, inputTemplate: string, outputKey?: string): void {
    this.steps.push({
      tool_name: toolName,
      input_template: inputTemplate,
      output_key: outputKey || `step_${this.steps.length}_result`,
    });
    console.log(`✅ 工具链 '${this.name}' 添加步骤: ${toolName}`);
  }

  async execute(
    registry: ToolRegistry,
    inputData: string,
    context: Record<string, unknown> = {},
  ): Promise<ToolResult> {
    if (this.steps.length === 0) return "❌ 工具链为空，无法执行";

    console.log(`🚀 开始执行工具链: ${this.name}`);
    context.input = inputData;

    let finalResult: ToolResult = inputData;

    for (const [index, step] of this.steps.entries()) {
      const { tool_name: toolName, input_template: inputTemplate, output_key: outputKey } = step;
      console.log(`📝 执行步骤 ${index + 1}/${this.steps.length}: ${toolName}`);

      let actualInput: string;
      try {
        actualInput = inputTemplate.replace(/{{|}}|{([^{}]*)}/g, (placeholder, key: string) => {
          if (placeholder === "{{") return "{";
          if (placeholder === "}}") return "}";
          if (!Object.hasOwn(context, key)) throw new Error(`'${key}'`);

          const value = context[key];
          if (value === null) return "None";
          if (value === true) return "True";
          if (value === false) return "False";
          if (typeof value === "object") return JSON.stringify(value) ?? "undefined";
          if (typeof value === "string") return value;
          if (typeof value === "number" || typeof value === "bigint" || typeof value === "symbol") {
            return value.toString();
          }
          if (typeof value === "function") return value.toString();
          return JSON.stringify(value) ?? "undefined";
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `❌ 模板变量替换失败: ${message}`;
      }

      try {
        const result = await registry.executeTool(toolName, actualInput);
        context[outputKey] = result;
        finalResult = result;
        console.log(`✅ 步骤 ${index + 1} 完成`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `❌ 工具 '${toolName}' 执行失败: ${message}`;
      }
    }

    console.log(`🎉 工具链 '${this.name}' 执行完成`);
    return finalResult;
  }
}

/** 工具链管理器。 */
export class ToolChainManager {
  private readonly chains = new Map<string, ToolChain>();

  constructor(private readonly registry: ToolRegistry) {}

  registerChain(chain: ToolChain): void {
    this.chains.set(chain.name, chain);
    console.log(`✅ 工具链 '${chain.name}' 已注册`);
  }

  async executeChain(
    chainName: string,
    inputData: string,
    context?: Record<string, unknown>,
  ): Promise<ToolResult> {
    const chain = this.chains.get(chainName);
    if (!chain) return `❌ 工具链 '${chainName}' 不存在`;

    return chain.execute(this.registry, inputData, context);
  }

  listChains(): string[] {
    return [...this.chains.keys()];
  }

  getChainInfo(chainName: string): {
    name: string;
    description: string;
    steps: number;
    step_details: ToolChainStep[];
  } | null {
    const chain = this.chains.get(chainName);
    if (!chain) return null;

    return {
      name: chain.name,
      description: chain.description,
      steps: chain.steps.length,
      step_details: chain.steps.map((step) => ({ ...step })),
    };
  }
}
