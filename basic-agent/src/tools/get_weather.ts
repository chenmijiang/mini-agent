interface WeatherData {
  current_condition?: Array<{
    weatherDesc?: Array<{ value?: unknown }>;
    temp_C?: unknown;
  }>;
}

export async function getWeather(city: string): Promise<string> {
  // 通过调用 wttr.in API 查询真实的天气信息。
  const url = `https://wttr.in/${city}?format=j1`;

  let data: unknown;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    data = await response.json();
  } catch (error) {
    return `错误:查询天气时遇到网络问题 - ${String(error)}`;
  }

  try {
    const currentCondition = (data as WeatherData).current_condition?.[0];
    const weatherDesc = currentCondition?.weatherDesc?.[0]?.value;
    const tempC = currentCondition?.temp_C;

    if (
      typeof weatherDesc !== "string" ||
      (typeof tempC !== "string" && typeof tempC !== "number")
    ) {
      throw new Error("天气数据结构无效");
    }

    return `${city}当前天气:${weatherDesc}，气温${tempC}摄氏度`;
  } catch (error) {
    return `错误:解析天气数据失败，可能是城市名称无效 - ${String(error)}`;
  }
}
