import OpenAI from "openai";

export class OpenAICompatibleClient {
  private readonly client: OpenAI;

  constructor(
    private readonly model: string,
    apiKey: string,
    baseUrl: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
  }

  async generate(prompt: string, systemPrompt: string): Promise<string> {
    console.log("正在调用大语言模型...");

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        stream: false,
      });
      const answer = response.choices[0]?.message.content;
      if (typeof answer !== "string") {
        throw new Error("LLM response content is invalid");
      }

      console.log("大语言模型响应成功。");
      return answer;
    } catch (error) {
      console.error(`调用LLM API时发生错误: ${String(error)}`);
      return "错误:调用语言模型服务时出错。";
    }
  }
}
