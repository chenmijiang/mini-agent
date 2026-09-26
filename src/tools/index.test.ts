import { describe, expect, it } from "vitest";

import { tools } from "./index";

describe("tools", () => {
  it("exposes the prompt tool names for dispatch", () => {
    expect(tools.get_weather).toBeTypeOf("function");
    expect(tools.get_attraction).toBeTypeOf("function");
  });
});
