import { Tool, type ToolResult } from "./base";

type ToolFunction = (inputText: string) => ToolResult | Promise<ToolResult>;

interface FunctionTool {
  description: string;
  func: ToolFunction;
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly functions = new Map<string, FunctionTool>();

  registerTool(tool: Tool, autoExpand = true): void {
    if (autoExpand && tool.expandable) {
      const expandedTools = tool.getExpandedTools();
      if (expandedTools?.length) {
        for (const subTool of expandedTools) {
          if (this.tools.has(subTool.name)) {
            console.log(`⚠️ 警告：工具 '${subTool.name}' 已存在，将被覆盖。`);
          }
          this.tools.set(subTool.name, subTool);
        }
        console.log(`✅ 工具 '${tool.name}' 已展开为 ${expandedTools.length} 个独立工具`);
        return;
      }
    }

    if (this.tools.has(tool.name)) {
      console.log(`⚠️ 警告：工具 '${tool.name}' 已存在，将被覆盖。`);
    }
    this.tools.set(tool.name, tool);
    console.log(`✅ 工具 '${tool.name}' 已注册。`);
  }

  registerFunction(name: string, description: string, func: ToolFunction): void {
    if (this.functions.has(name)) {
      console.log(`⚠️ 警告：工具 '${name}' 已存在，将被覆盖。`);
    }

    this.functions.set(name, { description, func });
    console.log(`✅ 工具 '${name}' 已注册。`);
  }

  unregister(name: string): void {
    if (this.tools.delete(name)) {
      console.log(`🗑️ 工具 '${name}' 已注销。`);
    } else if (this.functions.delete(name)) {
      console.log(`🗑️ 工具 '${name}' 已注销。`);
    } else {
      console.log(`⚠️ 工具 '${name}' 不存在。`);
    }
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getFunction(name: string): ToolFunction | undefined {
    return this.functions.get(name)?.func;
  }

  async executeTool(name: string, inputText: string): Promise<ToolResult> {
    const tool = this.tools.get(name);
    const func = this.functions.get(name)?.func;

    try {
      if (tool) return await tool.run({ input: inputText });
      if (func) return await func(inputText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `错误：执行工具 '${name}' 时发生异常: ${message}`;
    }

    return `错误：未找到名为 '${name}' 的工具。`;
  }

  getToolsDescription(): string {
    const descriptions: string[] = [];

    for (const tool of this.tools.values()) {
      descriptions.push(`- ${tool.name}: ${tool.description}`);
    }
    for (const [name, info] of this.functions) {
      descriptions.push(`- ${name}: ${info.description}`);
    }

    return descriptions.length > 0 ? descriptions.join("\n") : "暂无可用工具";
  }

  listTools(): string[] {
    return [...this.tools.keys(), ...this.functions.keys()];
  }

  getAllTools(): Tool[] {
    return [...this.tools.values()];
  }

  clear(): void {
    this.tools.clear();
    this.functions.clear();
    console.log("🧹 所有工具已清空。");
  }
}

export const globalRegistry = new ToolRegistry();
