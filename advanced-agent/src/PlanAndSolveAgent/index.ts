import type { HelloAgentsLLM } from "../HelloAgentsLLM";
import { Executor } from "./Executor";
import { Planner } from "./Planner";

export class PlanAndSolveAgent {
  private readonly planner: Planner;
  private readonly executor: Executor;

  constructor(llmClient: Pick<HelloAgentsLLM, "think">) {
    this.planner = new Planner(llmClient);
    this.executor = new Executor(llmClient);
  }

  async run(question: string): Promise<string | null> {
    console.log(`\n--- 开始处理问题 ---\n问题: ${question}`);

    const plan = await this.planner.plan(question);
    if (plan.length === 0) {
      console.log("\n--- 任务终止 --- \n无法生成有效的行动计划。");
      return null;
    }

    const finalAnswer = await this.executor.execute(question, plan);
    console.log(`\n--- 任务完成 ---\n最终答案: ${finalAnswer}`);
    return finalAnswer;
  }
}
