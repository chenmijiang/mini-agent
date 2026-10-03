import { afterEach, describe, expect, it, vi } from "vitest";

import { Memory } from "./Memory";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Memory", () => {
  it("formats the complete trajectory and returns the latest execution", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const memory = new Memory();

    expect(memory.getLastExecution()).toBeNull();

    memory.addRecord("execution", "first attempt");
    memory.addRecord("reflection", "use a sieve");
    memory.addRecord("execution", "optimized attempt");

    expect(memory.getTrajectory()).toBe(
      "--- 上一轮尝试 (代码) ---\nfirst attempt\n\n" +
        "--- 评审员反馈 ---\nuse a sieve\n\n" +
        "--- 上一轮尝试 (代码) ---\noptimized attempt",
    );
    expect(memory.getLastExecution()).toBe("optimized attempt");
  });
});
