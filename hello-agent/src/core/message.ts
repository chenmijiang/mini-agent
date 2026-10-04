/** 消息系统 */
export type MessageRole = "user" | "assistant" | "system" | "tool";

export class Message {
  content: string;
  role: MessageRole;
  timestamp: Date;
  metadata: Record<string, unknown> | null;

  constructor(
    content: string,
    role: MessageRole,
    options: { timestamp?: Date; metadata?: Record<string, unknown> | null } = {},
  ) {
    this.content = content;
    this.role = role;
    this.timestamp = options.timestamp ?? new Date();
    this.metadata = options.metadata === undefined ? {} : options.metadata;
  }

  /** 转换为 OpenAI API 消息格式 */
  to_dict(): { role: MessageRole; content: string } {
    return { role: this.role, content: this.content };
  }

  toString(): string {
    return `[${this.role}] ${this.content}`;
  }
}
