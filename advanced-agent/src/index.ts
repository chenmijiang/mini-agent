// eslint-disable typescript/no-floating-promises
import "dotenv/config";
import type { ChatCompletionMessageParam } from "openai/resources";

import { HelloAgentsLLM } from "./HelloAgentsLLM";

(async function main() {
  try {
    const llmClient = new HelloAgentsLLM();

    const exampleMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: "You are a helpful assistant that writes Python code." },
      { role: "user", content: "写一个快速排序算法" },
    ];
    console.log("--- 调用LLM ---");

    const responseText = await llmClient.think(exampleMessages);
    if (responseText) {
      console.log("\n\n-- - 完整模型响应-- - ");
      console.log(responseText);
    }
  } catch (e) {
    console.error(String(e));
  }
})();
