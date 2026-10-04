import OpenAI from "openai";

import { HelloAgentsException } from "./exceptions";

export type SupportedProvider =
  | "openai"
  | "deepseek"
  | "qwen"
  | "modelscope"
  | "kimi"
  | "zhipu"
  | "ollama"
  | "vllm"
  | "local"
  | "auto"
  | "custom";

export interface HelloAgentsLLMOptions {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  provider?: SupportedProvider;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  [key: string]: unknown;
}

type LLMMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type InvokeOptions = Partial<
  Omit<
    OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    "model" | "messages" | "stream"
  >
>;

/** OpenAI-compatible LLM client with streaming as the default interface. */
export class HelloAgentsLLM {
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number | undefined;
  readonly timeout: number;
  readonly kwargs: Record<string, unknown>;
  readonly provider: SupportedProvider;
  readonly apiKey: string;
  readonly baseUrl: string;
  private readonly client: OpenAI;

  constructor(options: HelloAgentsLLMOptions = {}) {
    const {
      model,
      apiKey,
      baseUrl,
      provider,
      temperature = 0.7,
      maxTokens,
      timeout,
      ...kwargs
    } = options;

    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.timeout = timeout || Number(process.env.LLM_TIMEOUT ?? "60");
    this.kwargs = kwargs;
    this.provider = provider || this.autoDetectProvider(apiKey, baseUrl);

    let resolvedApiKey: string | undefined;
    let resolvedBaseUrl: string | undefined;
    if (provider?.toLowerCase() === "custom") {
      resolvedApiKey = apiKey || process.env.LLM_API_KEY;
      resolvedBaseUrl = baseUrl || process.env.LLM_BASE_URL;
    } else {
      [resolvedApiKey, resolvedBaseUrl] = this.resolveCredentials(apiKey, baseUrl);
    }

    this.model = model || process.env.LLM_MODEL_ID || this.getDefaultModel();
    if (!resolvedApiKey || !resolvedBaseUrl) {
      throw new HelloAgentsException("API密钥和服务地址必须被提供或在.env文件中定义。");
    }

    this.apiKey = resolvedApiKey;
    this.baseUrl = resolvedBaseUrl;
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      timeout: this.timeout * 1000,
    });
  }

  private autoDetectProvider(apiKey?: string, baseUrl?: string): SupportedProvider {
    if (process.env.OPENAI_API_KEY) return "openai";
    if (process.env.DEEPSEEK_API_KEY) return "deepseek";
    if (process.env.DASHSCOPE_API_KEY) return "qwen";
    if (process.env.MODELSCOPE_API_KEY) return "modelscope";
    if (process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) return "kimi";
    if (process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY) return "zhipu";
    if (process.env.OLLAMA_API_KEY || process.env.OLLAMA_HOST) return "ollama";
    if (process.env.VLLM_API_KEY || process.env.VLLM_HOST) return "vllm";

    const actualApiKey = apiKey || process.env.LLM_API_KEY;
    if (actualApiKey) {
      const lowerApiKey = actualApiKey.toLowerCase();
      if (actualApiKey.startsWith("ms-")) return "modelscope";
      if (lowerApiKey === "ollama") return "ollama";
      if (lowerApiKey === "vllm") return "vllm";
      if (lowerApiKey === "local") return "local";
      if (!(actualApiKey.startsWith("sk-") && actualApiKey.length > 50)) {
        if (actualApiKey.slice(-20).includes(".")) return "zhipu";
      }
    }

    const actualBaseUrl = baseUrl || process.env.LLM_BASE_URL;
    if (actualBaseUrl) {
      const lowerBaseUrl = actualBaseUrl.toLowerCase();
      if (lowerBaseUrl.includes("api.openai.com")) return "openai";
      if (lowerBaseUrl.includes("api.deepseek.com")) return "deepseek";
      if (lowerBaseUrl.includes("dashscope.aliyuncs.com")) return "qwen";
      if (lowerBaseUrl.includes("api-inference.modelscope.cn")) return "modelscope";
      if (lowerBaseUrl.includes("api.moonshot.cn")) return "kimi";
      if (lowerBaseUrl.includes("open.bigmodel.cn")) return "zhipu";
      if (lowerBaseUrl.includes("localhost") || lowerBaseUrl.includes("127.0.0.1")) {
        if (lowerBaseUrl.includes(":11434") || lowerBaseUrl.includes("ollama")) return "ollama";
        if (lowerBaseUrl.includes(":8000") && lowerBaseUrl.includes("vllm")) return "vllm";
        if (lowerBaseUrl.includes(":8080") || lowerBaseUrl.includes(":7860")) return "local";
        if (actualApiKey?.toLowerCase() === "ollama") return "ollama";
        if (actualApiKey?.toLowerCase() === "vllm") return "vllm";
        return "local";
      }
      if (
        lowerBaseUrl.includes(":8080") ||
        lowerBaseUrl.includes(":7860") ||
        lowerBaseUrl.includes(":5000")
      ) {
        return "local";
      }
    }

    return "auto";
  }

  private resolveCredentials(
    apiKey?: string,
    baseUrl?: string,
  ): [string | undefined, string | undefined] {
    const genericApiKey = process.env.LLM_API_KEY;
    const genericBaseUrl = process.env.LLM_BASE_URL;

    switch (this.provider) {
      case "openai":
        return [
          apiKey || process.env.OPENAI_API_KEY || genericApiKey,
          baseUrl || genericBaseUrl || "https://api.openai.com/v1",
        ];
      case "deepseek":
        return [
          apiKey || process.env.DEEPSEEK_API_KEY || genericApiKey,
          baseUrl || genericBaseUrl || "https://api.deepseek.com",
        ];
      case "qwen":
        return [
          apiKey || process.env.DASHSCOPE_API_KEY || genericApiKey,
          baseUrl || genericBaseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1",
        ];
      case "modelscope":
        return [
          apiKey || process.env.MODELSCOPE_API_KEY || genericApiKey,
          baseUrl || genericBaseUrl || "https://api-inference.modelscope.cn/v1/",
        ];
      case "kimi":
        return [
          apiKey || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || genericApiKey,
          baseUrl || genericBaseUrl || "https://api.moonshot.cn/v1",
        ];
      case "zhipu":
        return [
          apiKey || process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY || genericApiKey,
          baseUrl || genericBaseUrl || "https://open.bigmodel.cn/api/paas/v4",
        ];
      case "ollama":
        return [
          apiKey || process.env.OLLAMA_API_KEY || genericApiKey || "ollama",
          baseUrl || process.env.OLLAMA_HOST || genericBaseUrl || "http://localhost:11434/v1",
        ];
      case "vllm":
        return [
          apiKey || process.env.VLLM_API_KEY || genericApiKey || "vllm",
          baseUrl || process.env.VLLM_HOST || genericBaseUrl || "http://localhost:8000/v1",
        ];
      case "local":
        return [
          apiKey || genericApiKey || "local",
          baseUrl || genericBaseUrl || "http://localhost:8000/v1",
        ];
      case "custom":
      case "auto":
        return [apiKey || genericApiKey, baseUrl || genericBaseUrl];
    }
  }

  private getDefaultModel(): string {
    switch (this.provider) {
      case "openai":
        return "gpt-3.5-turbo";
      case "deepseek":
        return "deepseek-chat";
      case "qwen":
        return "qwen-plus";
      case "modelscope":
        return "Qwen/Qwen2.5-72B-Instruct";
      case "kimi":
        return "moonshot-v1-8k";
      case "zhipu":
        return "glm-4";
      case "ollama":
        return "llama3.2";
      case "vllm":
        return "meta-llama/Llama-2-7b-chat-hf";
      case "local":
        return "local-model";
      case "custom":
        return "gpt-3.5-turbo";
      case "auto": {
        const lowerBaseUrl = (process.env.LLM_BASE_URL || "").toLowerCase();
        if (lowerBaseUrl.includes("modelscope")) return "Qwen/Qwen2.5-72B-Instruct";
        if (lowerBaseUrl.includes("deepseek")) return "deepseek-chat";
        if (lowerBaseUrl.includes("dashscope")) return "qwen-plus";
        if (lowerBaseUrl.includes("moonshot")) return "moonshot-v1-8k";
        if (lowerBaseUrl.includes("bigmodel")) return "glm-4";
        if (lowerBaseUrl.includes("ollama") || lowerBaseUrl.includes(":11434")) return "llama3.2";
        if (lowerBaseUrl.includes(":8000") || lowerBaseUrl.includes("vllm")) {
          return "meta-llama/Llama-2-7b-chat-hf";
        }
        if (lowerBaseUrl.includes("localhost") || lowerBaseUrl.includes("127.0.0.1")) {
          return "local-model";
        }
        return "gpt-3.5-turbo";
      }
    }
  }

  async *think(messages: LLMMessage[], temperature?: number): AsyncGenerator<string> {
    console.log(`🧠 正在调用 ${this.model} 模型...`);
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        temperature: temperature ?? this.temperature,
        max_tokens: this.maxTokens,
        stream: true,
      });

      console.log("✅ 大语言模型响应成功:");
      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta.content;
        if (typeof content === "string" && content) {
          process.stdout.write(content);
          yield content;
        }
      }
      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`❌ 调用LLM API时发生错误: ${message}`);
      throw new HelloAgentsException(`LLM调用失败: ${message}`);
    }
  }

  async invoke(messages: LLMMessage[], options: InvokeOptions = {}): Promise<string> {
    try {
      const {
        temperature = this.temperature,
        max_tokens = this.maxTokens,
        ...requestOptions
      } = options;
      const response = await this.client.chat.completions.create({
        ...requestOptions,
        model: this.model,
        messages,
        temperature,
        max_tokens,
        stream: false,
      });
      return response.choices[0].message.content ?? "";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HelloAgentsException(`LLM调用失败: ${message}`);
    }
  }

  /** Streaming alias for think. */
  async *streamInvoke(
    messages: LLMMessage[],
    options: { temperature?: number } = {},
  ): AsyncGenerator<string> {
    yield* this.think(messages, options.temperature);
  }
}
