import "dotenv/config";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources";

export class HelloAgentsLLM {
  private readonly model: string;
  private readonly client: OpenAI;

  // 初始化客户端。优先使用传入参数，如果未提供，则从环境变量加载
  constructor(
    model: string = process.env.LLM_MODEL_ID!,
    apiKey: string = process.env.LLM_API_KEY!,
    baseURL: string = process.env.LLM_BASE_URL!,
    timeout: number = parseInt(process.env.LLM_TIMEOUT!),
  ) {
    if (!model || !apiKey || !baseURL || !timeout) {
      throw new Error("模型ID、API密钥和服务地址必须被提供或在.env文件中定义。");
    }

    this.model = model;

    this.client = new OpenAI({ apiKey, baseURL, timeout });
  }

  async think(
    messages: ChatCompletionMessageParam[],
    temperature: number = 0,
  ): Promise<string | null> {
    console.log(`🧠 正在调用 ${this.model} 模型...`);
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature,
        stream: true,
      });

      console.log("✅ 大语言模型响应成功:");
      const collected_content: string[] = [];
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (!content) continue;
        process.stdout.write(content);
        collected_content.push(content);
      }
      process.stdout.write("\n");
      return collected_content.join("");
    } catch (e) {
      console.log(`❌ 调用LLM API时发生错误: ${String(e)}`);
      return null;
    }
  }
}
