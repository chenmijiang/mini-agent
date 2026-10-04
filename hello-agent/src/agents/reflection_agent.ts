import { Agent } from "../core/agent";
import type { Config } from "../core/config";
import type { HelloAgentsLLM } from "../core/llm";
import { Message } from "../core/message";

type InvokeOptions = NonNullable<Parameters<HelloAgentsLLM["invoke"]>[1]>;

export const DEFAULT_PROMPTS = {
  initial: `
请根据以下要求完成任务：

任务: {task}

请提供一个完整、准确的回答。
`,
  reflect: `
请仔细审查以下回答，并找出可能的问题或改进空间：

# 原始任务:
{task}

# 当前回答:
{content}

请分析这个回答的质量，指出不足之处，并提出具体的改进建议。
如果回答已经很好，请回答"无需改进"。
`,
  refine: `
请根据反馈意见改进你的回答：

# 原始任务:
{task}

# 上一轮回答:
{last_attempt}

# 反馈意见:
{feedback}

请提供一个改进后的回答。
`,
};

/** 单次任务的短期记忆，按执行顺序保存回答和反思。 */
export class Memory {
  records: { type: string; content: string }[] = [];

  add_record(record_type: string, content: string): void {
    this.records.push({ type: record_type, content });
    console.log(`📝 记忆已更新，新增一条 '${record_type}' 记录。`);
  }

  get_trajectory(): string {
    return this.records
      .map((record) => {
        if (record.type === "execution") {
          return `--- 上一轮尝试 (代码) ---\n${record.content}\n\n`;
        }
        if (record.type === "reflection") {
          return `--- 评审员反馈 ---\n${record.content}\n\n`;
        }
        return "";
      })
      .join("")
      .trim();
  }

  get_last_execution(): string {
    return this.records.findLast((record) => record.type === "execution")?.content ?? "";
  }
}

/** 初始执行后反思并优化；每轮最多包含一次反思和一次优化。 */
export class ReflectionAgent extends Agent {
  max_iterations: number;
  memory = new Memory();
  prompts: typeof DEFAULT_PROMPTS;

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    system_prompt?: string,
    config?: Config,
    max_iterations = 3,
    custom_prompts?: typeof DEFAULT_PROMPTS,
  ) {
    super(name, llm, system_prompt, config);
    this.max_iterations = max_iterations;
    this.prompts = custom_prompts ?? DEFAULT_PROMPTS;
  }

  /** 每次重置短期记忆，最终问答保留在 Agent 历史中；模型调用选项透传给 invoke。 */
  async run(input_text: string, kwargs: Record<string, unknown> = {}): Promise<string> {
    console.log(`\n🤖 ${this.name} 开始处理任务: ${input_text}`);
    this.memory = new Memory();

    console.log("\n--- 正在进行初始尝试 ---");
    const initialPrompt = this.format_prompt(this.prompts.initial, { task: input_text });
    const initialResult = await this.get_llm_response(initialPrompt, kwargs);
    this.memory.add_record("execution", initialResult);

    for (let i = 0; i < this.max_iterations; i++) {
      console.log(`\n--- 第 ${i + 1}/${this.max_iterations} 轮迭代 ---`);
      console.log("\n-> 正在进行反思...");
      const lastResult = this.memory.get_last_execution();
      const reflectPrompt = this.format_prompt(this.prompts.reflect, {
        task: input_text,
        content: lastResult,
      });
      const feedback = await this.get_llm_response(reflectPrompt, kwargs);
      this.memory.add_record("reflection", feedback);

      if (
        feedback.includes("无需改进") ||
        feedback.toLowerCase().includes("no need for improvement")
      ) {
        console.log("\n✅ 反思认为结果已无需改进，任务完成。");
        break;
      }

      console.log("\n-> 正在进行优化...");
      const refinePrompt = this.format_prompt(this.prompts.refine, {
        task: input_text,
        last_attempt: lastResult,
        feedback,
      });
      const refinedResult = await this.get_llm_response(refinePrompt, kwargs);
      this.memory.add_record("execution", refinedResult);
    }

    const finalResult = this.memory.get_last_execution();
    console.log(`\n--- 任务完成 ---\n最终结果:\n${finalResult}`);
    this.add_message(new Message(input_text, "user"));
    this.add_message(new Message(finalResult, "assistant"));
    return finalResult;
  }

  // 一次替换，保留任务、回答和反馈中的字面花括号。
  private format_prompt(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{|\}\}|\{(\w+)\}/g, (match: string, key: string | undefined) => {
      if (match === "{{") return "{";
      if (match === "}}") return "}";
      if (key === undefined || !Object.hasOwn(values, key)) {
        throw new Error(`未知的提示词占位符: ${match}`);
      }
      return values[key]!;
    });
  }

  private async get_llm_response(prompt: string, kwargs: Record<string, unknown>): Promise<string> {
    return (
      (await this.llm.invoke([{ role: "user", content: prompt }], kwargs as InvokeOptions)) || ""
    );
  }
}
