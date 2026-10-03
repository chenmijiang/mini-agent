type RecordType = "execution" | "reflection";

type MemoryRecord = {
  type: RecordType;
  content: string;
};

export class Memory {
  private readonly records: MemoryRecord[] = [];

  addRecord(type: RecordType, content: string): void {
    this.records.push({ type, content });
    console.log(`📝 记忆已更新，新增一条 '${type}' 记录。`);
  }

  getTrajectory(): string {
    return this.records
      .map(({ type, content }) =>
        type === "execution"
          ? `--- 上一轮尝试 (代码) ---\n${content}`
          : `--- 评审员反馈 ---\n${content}`,
      )
      .join("\n\n");
  }

  getLastExecution(): string | null {
    for (let index = this.records.length - 1; index >= 0; index -= 1) {
      const record = this.records[index];
      if (record?.type === "execution") return record.content;
    }
    return null;
  }
}
