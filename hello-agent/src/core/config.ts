/** HelloAgents 配置类 */
export class Config {
  default_model: string;
  default_provider: string;
  temperature: number;
  max_tokens: number | null;
  debug: boolean;
  log_level: string;
  max_history_length: number;

  constructor(options: Partial<Omit<Config, "to_dict">> = {}) {
    this.default_model = options.default_model ?? "gpt-3.5-turbo";
    this.default_provider = options.default_provider ?? "openai";
    this.temperature = options.temperature ?? 0.7;
    this.max_tokens = options.max_tokens ?? null;
    this.debug = options.debug ?? false;
    this.log_level = options.log_level ?? "INFO";
    this.max_history_length = options.max_history_length ?? 100;
  }

  /** 从环境变量创建配置 */
  static from_env(): Config {
    const temperatureValue = process.env.TEMPERATURE ?? "0.7";
    const temperature = Number(temperatureValue);
    if (temperatureValue.trim() === "" || Number.isNaN(temperature)) {
      throw new TypeError("TEMPERATURE must be a number");
    }

    const maxTokensValue = process.env.MAX_TOKENS;
    const max_tokens = maxTokensValue ? Number(maxTokensValue) : null;
    if (
      maxTokensValue &&
      (!/^[+-]?\d+$/.test(maxTokensValue.trim()) || !Number.isInteger(max_tokens))
    ) {
      throw new TypeError("MAX_TOKENS must be an integer");
    }

    return new Config({
      debug: (process.env.DEBUG ?? "false").toLowerCase() === "true",
      log_level: process.env.LOG_LEVEL ?? "INFO",
      temperature,
      max_tokens,
    });
  }

  /** 转换为普通对象 */
  to_dict(): Omit<Config, "to_dict"> {
    return {
      default_model: this.default_model,
      default_provider: this.default_provider,
      temperature: this.temperature,
      max_tokens: this.max_tokens,
      debug: this.debug,
      log_level: this.log_level,
      max_history_length: this.max_history_length,
    };
  }
}
