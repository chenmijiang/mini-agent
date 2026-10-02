import { afterEach, describe, expect, it, vi } from "vitest";

import { getWeather } from "./get_weather";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getWeather", () => {
  it("returns the current conditions from wttr.in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            current_condition: [{ weatherDesc: [{ value: "Sunny" }], temp_C: "18" }],
          }),
        ),
      ),
    );

    await expect(getWeather("London")).resolves.toBe("London当前天气:Sunny，气温18摄氏度");
  });

  it("reports network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(getWeather("London")).resolves.toBe(
      "错误:查询天气时遇到网络问题 - Error: offline",
    );
  });

  it("treats non-success HTTP responses as request errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(getWeather("London")).resolves.toContain(
      "错误:查询天气时遇到网络问题 - Error: HTTP 404:",
    );
  });

  it("reports malformed weather data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}))));

    await expect(getWeather("London")).resolves.toBe(
      "错误:解析天气数据失败，可能是城市名称无效 - Error: 天气数据结构无效",
    );
  });
});
