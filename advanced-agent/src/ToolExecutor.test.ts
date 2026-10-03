import { afterEach, describe, expect, it, vi } from "vitest";

import { ToolExecutor } from "./ToolExecutor";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ToolExecutor", () => {
  it("registers and retrieves a tool function", async () => {
    const executor = new ToolExecutor();
    const search = async (input: string) => `result for ${input}`;

    executor.registerTool("search", "Search the web", search);

    await expect(executor.getTool("search")?.("query")).resolves.toBe("result for query");
    expect(executor.getTool("missing")).toBeUndefined();
  });

  it("formats available tools in registration order", () => {
    const executor = new ToolExecutor();

    expect(executor.getAvailableTools()).toBe("");

    executor.registerTool("search", "Search the web", async () => "results");
    executor.registerTool("translate", "Translate text", async () => "translation");

    expect(executor.getAvailableTools()).toBe(
      "- search: Search the web\n- translate: Translate text",
    );
  });

  it("overwrites a tool registered under the same name", async () => {
    const executor = new ToolExecutor();
    const warning = vi.spyOn(console, "log").mockImplementation(() => {});

    executor.registerTool("search", "Old description", async () => "old");
    executor.registerTool("search", "New description", async () => "new");

    expect(warning).toHaveBeenCalledWith("警告:工具 'search' 已存在，将被覆盖。");
    expect(executor.getAvailableTools()).toBe("- search: New description");
    await expect(executor.getTool("search")?.("query")).resolves.toBe("new");
  });
});
