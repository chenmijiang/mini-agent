import { describe, expect, it } from "vitest";

import { Tool, ToolParameter, toolAction } from "./base";

class MemoryTool extends Tool {
  constructor() {
    super("memory", "记忆工具", true);
  }

  run(): string {
    return "memory";
  }

  getParameters(): ToolParameter[] {
    return [];
  }

  @toolAction("memory_add", "添加记忆", [
    { name: "content", type: "string", description: "记忆内容" },
    {
      name: "importance",
      type: "number",
      description: "重要性分数",
      required: false,
      default: 0.5,
    },
    { name: "tags", type: "array", description: "标签", required: false, default: [] },
  ])
  addMemory(content: string, importance = 0.5, tags: string[] = []): string {
    return `${content}:${importance}:${tags.length}`;
  }
}

describe("Tool", () => {
  it("expands decorated methods and exposes their parameter schema", () => {
    const [action] = new MemoryTool().getExpandedTools() ?? [];

    expect(action).toBeDefined();
    expect(action.toDict()).toEqual({
      name: "memory_add",
      description: "添加记忆",
      parameters: [
        {
          name: "content",
          type: "string",
          description: "记忆内容",
          required: true,
          default: null,
        },
        {
          name: "importance",
          type: "number",
          description: "重要性分数",
          required: false,
          default: 0.5,
        },
        {
          name: "tags",
          type: "array",
          description: "标签",
          required: false,
          default: [],
        },
      ],
    });
    expect(action.run({ content: "hello", importance: 0.8, tags: ["agent"] })).toBe("hello:0.8:1");
    expect(action.run({ content: "hello" })).toBe("hello:0.5:0");
    expect(action.validateParameters({ content: "hello" })).toBe(true);
    expect(action.validateParameters({ importance: 0.8 })).toBe(false);
    expect(() => action.run({})).toThrow("Missing required parameter(s): content");
    expect(() => action.run({ content: "hello", extra: true })).toThrow(
      "Unexpected parameter(s): extra",
    );
    expect(action.toOpenAISchema()).toEqual({
      type: "function",
      function: {
        name: "memory_add",
        description: "添加记忆",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", description: "记忆内容" },
            importance: { type: "number", description: "重要性分数 (默认: 0.5)" },
            tags: { type: "array", description: "标签 (默认: [])", items: { type: "string" } },
          },
          required: ["content"],
        },
      },
    });
  });
});
