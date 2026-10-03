# mini-agent

本项目的开发与验证 harness 说明，只涵盖检测约定和工具职责。

## 检测约定

- 测试验证可观察行为及边界，不依赖具体实现细节。
- 外部 I/O 应隔离，使测试可重复；测试不访问真实服务或凭据。
- ReActAgent 每次响应只处理第一组 Thought/Action；测试覆盖工具调用与历史记录、Finish 返回、无效或缺失工具响应，以及 maxSteps 边界。
- ReflectionAgent 生成 TypeScript 代码并保存执行/反思轨迹；测试覆盖代码与反馈传递、无需改进时停止，以及 maxIterations 上限。
- 静态检查、格式化和构建分别由项目配置的工具负责。Oxlint 的 type-aware 检查不等同于独立的 TypeScript 编译。

具体脚本以 `package.json` 为准；测试发现规则以 `vitest.config.ts` 为准；各工具的检测规则以对应配置文件为准。
