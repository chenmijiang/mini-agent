import type { ToolResult } from "./base";
import { ToolRegistry } from "./registry";

export interface AsyncToolTask {
  tool_name?: string;
  input_data?: string;
}

export interface AsyncToolResult {
  task_id: number;
  tool_name: string;
  input_data: string;
  result: ToolResult;
  status: "success" | "error";
}

/** 异步工具执行器。 */
export class AsyncToolExecutor {
  constructor(
    public readonly registry: ToolRegistry,
    private readonly maxWorkers = 4,
  ) {
    if (!Number.isInteger(maxWorkers) || maxWorkers < 1) {
      throw new RangeError("maxWorkers must be a positive integer");
    }
  }

  async executeToolAsync(toolName: string, inputData: string): Promise<ToolResult> {
    try {
      return await this.registry.executeTool(toolName, inputData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `❌ 工具 '${toolName}' 异步执行失败: ${message}`;
    }
  }

  async executeToolsParallel(tasks: AsyncToolTask[]): Promise<AsyncToolResult[]> {
    console.log(`🚀 开始并行执行 ${tasks.length} 个工具任务`);

    const validTasks: {
      taskId: number;
      toolName: string;
      inputData: string;
    }[] = [];
    for (const [taskId, task] of tasks.entries()) {
      if (!task.tool_name) continue;

      console.log(`📝 创建任务 ${taskId + 1}: ${task.tool_name}`);
      validTasks.push({
        taskId,
        toolName: task.tool_name,
        inputData: task.input_data ?? "",
      });
    }

    const results: AsyncToolResult[] = [];
    let nextTask = 0;
    const worker = async (): Promise<void> => {
      while (nextTask < validTasks.length) {
        const position = nextTask++;
        const task = validTasks[position]!;

        try {
          const result = await this.executeToolAsync(task.toolName, task.inputData);
          results[position] = {
            task_id: task.taskId,
            tool_name: task.toolName,
            input_data: task.inputData,
            result,
            status: "success",
          };
          console.log(`✅ 任务 ${task.taskId + 1} 完成: ${task.toolName}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results[position] = {
            task_id: task.taskId,
            tool_name: task.toolName,
            input_data: task.inputData,
            result: message,
            status: "error",
          };
          console.log(`❌ 任务 ${task.taskId + 1} 失败: ${task.toolName} - ${message}`);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(this.maxWorkers, validTasks.length) }, () => worker()),
    );

    const successCount = results.filter(({ status }) => status === "success").length;
    console.log(`🎉 并行执行完成，成功: ${successCount}/${results.length}`);
    return results;
  }

  executeToolsBatch(toolName: string, inputList: string[]): Promise<AsyncToolResult[]> {
    return this.executeToolsParallel(
      inputList.map((inputData) => ({ tool_name: toolName, input_data: inputData })),
    );
  }
}

/** 并行执行多个工具。 */
export function runParallelTools(
  registry: ToolRegistry,
  tasks: AsyncToolTask[],
  maxWorkers = 4,
): Promise<AsyncToolResult[]> {
  return new AsyncToolExecutor(registry, maxWorkers).executeToolsParallel(tasks);
}

/** 批量执行同一个工具。 */
export function runBatchTool(
  registry: ToolRegistry,
  toolName: string,
  inputList: string[],
  maxWorkers = 4,
): Promise<AsyncToolResult[]> {
  return new AsyncToolExecutor(registry, maxWorkers).executeToolsBatch(toolName, inputList);
}
