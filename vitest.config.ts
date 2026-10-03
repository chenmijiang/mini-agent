import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "basic-agent",
          include: ["./basic-agent/src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "advanced-agent",
          include: ["./advanced-agent/src/**/*.test.ts"],
        },
      },
    ],
  },
});
