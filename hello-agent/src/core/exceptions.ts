/** 异常体系 */
export class HelloAgentsException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** LLM相关异常 */
export class LLMException extends HelloAgentsException {}

/** Agent相关异常 */
export class AgentException extends HelloAgentsException {}

/** 配置相关异常 */
export class ConfigException extends HelloAgentsException {}

/** 工具相关异常 */
export class ToolException extends HelloAgentsException {}