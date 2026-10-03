type ToolFunction = (input: string) => Promise<string>;

/** 一个工具执行器，负责管理和执行工具。 */
export class ToolExecutor {
  private readonly tools = new Map<string, { description: string; func: ToolFunction }>();

  registerTool(name: string, description: string, func: ToolFunction): void {
    if (this.tools.has(name)) {
      console.log(`警告:工具 '${name}' 已存在，将被覆盖。`);
    }

    this.tools.set(name, { description, func });
    console.log(`工具 '${name}' 已注册。`);
  }

  getTool(name: string): ToolFunction | undefined {
    return this.tools.get(name)?.func;
  }

  getAvailableTools(): string {
    const descriptions: string[] = [];
    for (const [name, { description }] of this.tools) {
      descriptions.push(`- ${name}: ${description}`);
    }
    return descriptions.join("\n");
  }
}
