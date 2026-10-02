#!/usr/bin/env node
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { OpenAICompatibleClient } from "./llm/openai-compatible-client";
import { tools } from "./tools";

type AgentTool = (args: Record<string, string>) => Promise<string>;

export type AgentToolMap = Record<string, AgentTool>;

interface RunAgentOptions {
  llm: Pick<OpenAICompatibleClient, "generate">;
  systemPrompt: string;
  availableTools: AgentToolMap;
  maxIterations?: number;
  logger?: Pick<Console, "log">;
}

function truncateExtraThoughtAction(output: string): string {
  const match = output.match(/Thought:.*?Action:.*?(?=\n\s*(?:Thought:|Action:|Observation:)|$)/s);

  return match?.[0].trim() ?? output.trim();
}

function parseToolAction(action: string): {
  toolName: string;
  args: Record<string, string>;
} | null {
  const match = action.match(/^(?:调用工具\s*[:：]?\s*)?(\w+)\(([\s\S]*)\)$/);
  if (!match) {
    return null;
  }

  const args: Record<string, string> = {};
  for (const [, key, value] of match[2].matchAll(/(\w+)="([^"]*)"/g)) {
    args[key] = value;
  }

  return { toolName: match[1], args };
}

function requiredArgument(args: Record<string, string>, name: string): string {
  const value = args[name];
  if (value === undefined) {
    throw new Error(`缺少必需参数 '${name}'`);
  }
  return value;
}

const availableTools: AgentToolMap = {
  get_weather: (args) => tools.get_weather(requiredArgument(args, "city")),
  get_attraction: (args) =>
    tools.get_attraction(requiredArgument(args, "city"), requiredArgument(args, "weather")),
};

export async function runAgent(
  userPrompt: string,
  {
    llm,
    systemPrompt,
    availableTools: toolMap,
    maxIterations = 5,
    logger = console,
  }: RunAgentOptions,
): Promise<string | null> {
  const promptHistory = [`用户请求: ${userPrompt}`];

  logger.log(`用户输入: ${userPrompt}\n${"=".repeat(40)}`);

  for (let i = 0; i < maxIterations; i += 1) {
    logger.log(`--- 循环 ${i + 1} ---\n`);

    const fullPrompt = promptHistory.join("\n");
    let llmOutput = await llm.generate(fullPrompt, systemPrompt);
    const truncatedOutput = truncateExtraThoughtAction(llmOutput);
    if (truncatedOutput !== llmOutput.trim()) {
      llmOutput = truncatedOutput;
      logger.log("已截断多余的 Thought-Action 对");
    }

    logger.log(`模型输出:\n${llmOutput}\n`);
    promptHistory.push(llmOutput);

    const actionMatch = llmOutput.match(/Action:\s*([\s\S]*)/);
    if (!actionMatch) {
      const observation =
        "错误: 未能解析到 Action 字段。请确保你的回复严格遵循 'Thought: ... Action: ...' 的格式。";
      const observationEntry = `Observation: ${observation}`;
      logger.log(`${observationEntry}\n${"=".repeat(40)}`);
      promptHistory.push(observationEntry);
      continue;
    }

    const action = actionMatch[1].trim();
    const finishMatch = action.match(/^Finish\[([\s\S]*)\]$/);
    if (finishMatch) {
      logger.log(`任务完成，最终答案: ${finishMatch[1]}`);
      return finishMatch[1];
    }

    const toolAction = parseToolAction(action);
    let observation: string;
    if (!toolAction) {
      observation = `错误:未能解析工具调用 '${action}'`;
    } else {
      const tool = toolMap[toolAction.toolName];
      if (!tool) {
        observation = `错误:未定义的工具 '${toolAction.toolName}'`;
      } else {
        try {
          observation = await tool(toolAction.args);
        } catch (error) {
          observation = `错误:执行工具 '${toolAction.toolName}' 时发生异常 - ${String(error)}`;
        }
      }
    }

    const observationEntry = `Observation: ${observation}`;
    logger.log(`${observationEntry}\n${"=".repeat(40)}`);
    promptHistory.push(observationEntry);
  }

  logger.log(`达到最大循环次数（${maxIterations}），任务未完成。`);
  return null;
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`未配置环境变量 ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const llm = new OpenAICompatibleClient(
    requiredEnvironmentVariable("OPENAI_MODEL_ID"),
    requiredEnvironmentVariable("OPENAI_API_KEY"),
    requiredEnvironmentVariable("OPENAI_BASE_URL"),
  );
  const systemPrompt = await readFile(
    new URL("./prompt/system_prompt.md", import.meta.url),
    "utf8",
  );
  const userPrompt = "你好，请帮我查询一下今天北京的天气，然后根据天气推荐一个合适的旅游景点。";

  await runAgent(userPrompt, { llm, systemPrompt, availableTools });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(`运行智能体失败: ${String(error)}`);
    process.exitCode = 1;
  });
}
