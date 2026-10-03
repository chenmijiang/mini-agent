// eslint-disable typescript/no-floating-promises
import "dotenv/config";
import { HelloAgentsLLM } from "./HelloAgentsLLM";
import { ReActAgent } from "./ReActAgent";
import { ToolExecutor } from "./ToolExecutor";
import { search } from "./tools/search";

(async function main() {
  try {
    // const llmClient = new HelloAgentsLLM();

    // const exampleMessages: ChatCompletionMessageParam[] = [
    //   { role: "system", content: "You are a helpful assistant that writes Python code." },
    //   { role: "user", content: "写一个快速排序算法" },
    // ];
    // console.log("--- 调用LLM ---");

    // const responseText = await llmClient.think(exampleMessages);
    // if (responseText) {
    //   console.log("\n\n-- - 完整模型响应-- - ");
    //   console.log(responseText);
    // }
    const toolExecutor = new ToolExecutor();

    const reActAgent = new ReActAgent(new HelloAgentsLLM(), toolExecutor);

    toolExecutor.registerTool(
      "Search",
      "一个网页搜索引擎。当你需要回答关于时事、事实以及在你的知识库中找不到的信息时，应使用此工具。",
      search,
    );

    await reActAgent.run("分析华为最新发布的手机型号及其主要特点");
  } catch (e) {
    console.error(String(e));
  }
})();
