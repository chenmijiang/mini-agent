import { Config } from "./config";
import type { HelloAgentsLLM } from "./llm";
import type { Message } from "./message";

/** Agent基类 */
export abstract class Agent {
  name: string;
  llm: HelloAgentsLLM;
  system_prompt: string | undefined;
  config: Config;
  protected _history: Message[] = [];

  constructor(name: string, llm: HelloAgentsLLM, system_prompt?: string, config?: Config) {
    this.name = name;
    this.llm = llm;
    this.system_prompt = system_prompt;
    this.config = config ?? new Config();
  }

  abstract run(input_text: string, kwargs?: Record<string, unknown>): Promise<string>;

  add_message(message: Message): void {
    this._history.push(message);
  }

  clear_history(): void {
    this._history.length = 0;
  }

  get_history(): Message[] {
    return this._history.slice();
  }

  toString(): string {
    return `Agent(name=${this.name}, provider=${this.llm.provider})`;
  }
}
