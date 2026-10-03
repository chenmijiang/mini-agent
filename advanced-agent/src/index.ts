// eslint-disable typescript/no-floating-promises
import "dotenv/config";
import { HelloAgentsLLM } from "./HelloAgentsLLM";
import { ReflectionAgent } from "./ReflectionAgent";

(async function main() {
  try {
    // const llmClient = new HelloAgentsLLM();

    // const exampleMessages: ChatCompletionMessageParam[] = [
    //   { role: "system", content: "You are a helpful assistant that writes TypeScript code." },
    //   { role: "user", content: "写一个快速排序算法" },
    // ];
    // console.log("--- 调用LLM ---");

    // const responseText = await llmClient.think(exampleMessages);
    // if (responseText) {
    //   console.log("\n\n-- - 完整模型响应-- - ");
    //   console.log(responseText);
    // }
    // const toolExecutor = new ToolExecutor();

    // const reActAgent = new ReActAgent(new HelloAgentsLLM(), toolExecutor);

    // toolExecutor.registerTool(
    //   "Search",
    //   "一个网页搜索引擎。当你需要回答关于时事、事实以及在你的知识库中找不到的信息时，应使用此工具。",
    //   search,
    // );

    // await reActAgent.run("分析华为最新发布的手机型号及其主要特点");

    // const answer = await new PlanAndSolveAgent(new HelloAgentsLLM()).run(
    //   "一个水果店周一卖出了15个苹果。周二卖出的苹果数量是周一的两倍。周三卖出的数量比周二少了5个。请问这三天总共卖出了多少个苹果？",
    // );
    // if (answer === null) process.exitCode = 1;

    await new ReflectionAgent(new HelloAgentsLLM()).run(
      "编写一个TypeScript函数，找出1到n之间所有的素数 (prime numbers)。",
    );
  } catch (e) {
    console.error(String(e));
  }
})();
