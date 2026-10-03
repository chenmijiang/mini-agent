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
type AgentAction =
  | { type: "tool"; name: string; input: Record<string, string> }
  | { type: "finish"; answer: string };

interface AgentResponse {
  thought: string;
  action: AgentAction;
}
interface RawAgentResponse {
  thought: unknown;
  action: unknown;
}

interface RawAgentAction {
  type?: unknown;
  name?: unknown;
  input?: unknown;
  answer?: unknown;
}

function parseAgentResponse(output: string): AgentResponse | null {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    return null;
  }

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("thought" in value) ||
    !("action" in value)
  ) {
    return null;
  }

  const response = value as RawAgentResponse;
  if (
    typeof response.thought !== "string" ||
    typeof response.action !== "object" ||
    response.action === null ||
    Array.isArray(response.action)
  ) {
    return null;
  }

  const action = response.action as RawAgentAction;
  if (action.type === "finish" && typeof action.answer === "string") {
    return { thought: response.thought, action: { type: "finish", answer: action.answer } };
  }

  const input = action.input;
  if (
    action.type !== "tool" ||
    typeof action.name !== "string" ||
    action.name.length === 0 ||
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    !Object.values(input).every((argument) => typeof argument === "string")
  ) {
    return null;
  }

  return {
    thought: response.thought,
    action: { type: "tool", name: action.name, input: input as Record<string, string> },
  };
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
    const llmOutput = await llm.generate(fullPrompt, systemPrompt);

    logger.log(`模型输出:\n${llmOutput}\n`);
    promptHistory.push(llmOutput);

    const response = parseAgentResponse(llmOutput);
    if (!response) {
      const observation = "错误: 未能解析有效的 JSON ReAct 响应。";
      const observationEntry = `Observation: ${observation}`;
      logger.log(`${observationEntry}\n${"=".repeat(40)}`);
      promptHistory.push(observationEntry);
      continue;
    }

    if (response.thought) {
      logger.log(`思考: ${response.thought}`);
    }

    if (response.action.type === "finish") {
      logger.log(`任务完成，最终答案: ${response.action.answer}`);
      return response.action.answer;
    }

    const { name, input } = response.action;
    const tool = Object.hasOwn(toolMap, name) ? toolMap[name] : undefined;
    let observation: string;
    if (!tool) {
      observation = `错误:未定义的工具 '${name}'`;
    } else {
      try {
        observation = await tool(input);
      } catch (error) {
        observation = `错误:执行工具 '${name}' 时发生异常 - ${String(error)}`;
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
