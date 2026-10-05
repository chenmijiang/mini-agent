import { Agent } from "../core/agent";
import type { Config } from "../core/config";
import type { HelloAgentsLLM } from "../core/llm";
import { Message } from "../core/message";

type InvokeOptions = NonNullable<Parameters<HelloAgentsLLM["invoke"]>[1]>;

export const DEFAULT_PLANNER_PROMPT = `
你是一个顶级的AI规划专家。你的任务是将用户提出的复杂问题分解成一个由多个简单步骤组成的行动计划。
请确保计划中的每个步骤都是一个独立的、可执行的子任务，并且严格按照逻辑顺序排列。
你的输出必须是一个JSON数组，其中每个元素都是一个描述子任务的字符串。

问题: {question}

请严格按照以下格式输出你的计划:
\`\`\`json
["步骤1", "步骤2", "步骤3"]
\`\`\`
`;

export const DEFAULT_EXECUTOR_PROMPT = `
你是一位顶级的AI执行专家。你的任务是严格按照给定的计划，一步步地解决问题。
你将收到原始问题、完整的计划、以及到目前为止已经完成的步骤和结果。
请你专注于解决"当前步骤"，并仅输出该步骤的最终答案，不要输出任何额外的解释或对话。

# 原始问题:
{question}

# 完整计划:
{plan}

# 历史步骤与结果:
{history}

# 当前步骤:
{current_step}

请仅输出针对"当前步骤"的回答:
`;

function formatPrompt(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{|\}\}|\{(\w+)\}/g, (match, key: string | undefined) => {
    if (match === "{{") return "{";
    if (match === "}}") return "}";
    if (key === undefined || !Object.hasOwn(values, key)) {
      throw new Error(`未知的提示词占位符: ${match}`);
    }
    return values[key]!;
  });
}

/** 规划器 - 负责将复杂问题分解为简单步骤 */
export class Planner {
  private readonly prompt_template: string;

  constructor(
    private readonly llm_client: HelloAgentsLLM,
    prompt_template?: string,
  ) {
    this.prompt_template = prompt_template || DEFAULT_PLANNER_PROMPT;
  }

  /** 生成执行计划 */
  async plan(question: string, kwargs: Record<string, unknown> = {}): Promise<string[]> {
    const prompt = formatPrompt(this.prompt_template, { question });
    console.log("--- 正在生成计划 ---");
    const response_text =
      (await this.llm_client.invoke(
        [{ role: "user", content: prompt }],
        kwargs as InvokeOptions,
      )) || "";
    console.log(`✅ 计划已生成:\n${response_text}`);

    try {
      const plan_text = response_text.match(/```(?:json|python)\s*([\s\S]*?)```/i)?.[1]?.trim();
      if (plan_text === undefined) throw new Error("未找到计划代码块");
      const parsed: unknown = JSON.parse(plan_text);
      return Array.isArray(parsed) && parsed.every((step) => typeof step === "string")
        ? parsed
        : [];
    } catch (error) {
      console.error(`❌ 解析计划时出错: ${String(error)}`);
      console.error(`原始响应: ${response_text}`);
      return [];
    }
  }
}

/** 执行器 - 负责按计划逐步执行 */
export class Executor {
  private readonly prompt_template: string;

  constructor(
    private readonly llm_client: HelloAgentsLLM,
    prompt_template?: string,
  ) {
    this.prompt_template = prompt_template || DEFAULT_EXECUTOR_PROMPT;
  }

  /** 按计划执行任务并返回最后一步的结果 */
  async execute(
    question: string,
    plan: string[],
    kwargs: Record<string, unknown> = {},
  ): Promise<string> {
    let history = "";
    let final_answer = "";

    console.log("\n--- 正在执行计划 ---");
    for (const [index, step] of plan.entries()) {
      const step_number = index + 1;
      console.log(`\n-> 正在执行步骤 ${step_number}/${plan.length}: ${step}`);
      const prompt = formatPrompt(this.prompt_template, {
        question,
        plan: JSON.stringify(plan),
        history: history || "无",
        current_step: step,
      });
      final_answer =
        (await this.llm_client.invoke(
          [{ role: "user", content: prompt }],
          kwargs as InvokeOptions,
        )) || "";
      history += `步骤 ${step_number}: ${step}\n结果: ${final_answer}\n\n`;
      console.log(`✅ 步骤 ${step_number} 已完成，结果: ${final_answer}`);
    }

    return final_answer;
  }
}

/** 分解规划并逐步执行复杂任务的 Agent。 */
export class PlanAndSolveAgent extends Agent {
  private readonly planner: Planner;
  private readonly executor: Executor;

  constructor(
    name: string,
    llm: HelloAgentsLLM,
    system_prompt?: string,
    config?: Config,
    custom_prompts?: Partial<{ planner: string; executor: string }>,
  ) {
    super(name, llm, system_prompt, config);
    this.planner = new Planner(llm, custom_prompts?.planner);
    this.executor = new Executor(llm, custom_prompts?.executor);
  }

  /** 生成计划并执行；模型调用参数会传递给每一步。 */
  async run(input_text: string, kwargs: Record<string, unknown> = {}): Promise<string> {
    console.log(`\n🤖 ${this.name} 开始处理问题: ${input_text}`);

    const plan = await this.planner.plan(input_text, kwargs);
    if (plan.length === 0) {
      const final_answer = "无法生成有效的行动计划，任务终止。";
      console.log(`\n--- 任务终止 ---\n${final_answer}`);
      this.add_message(new Message(input_text, "user"));
      this.add_message(new Message(final_answer, "assistant"));
      return final_answer;
    }

    const final_answer = await this.executor.execute(input_text, plan, kwargs);
    console.log(`\n--- 任务完成 ---\n最终答案: ${final_answer}`);
    this.add_message(new Message(input_text, "user"));
    this.add_message(new Message(final_answer, "assistant"));
    return final_answer;
  }
}
