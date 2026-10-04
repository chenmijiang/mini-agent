import { parseExpression } from "@babel/parser";

import { Tool, ToolParameter } from "../base";

function callMathFunction(name: string, args: number[]): number {
  switch (name) {
    case "abs":
      return Math.abs(args[0]);
    case "round":
      return Math.round(args[0]);
    case "max":
      return Math.max(...args);
    case "min":
      return Math.min(...args);
    case "pow":
      return Math.pow(args[0], args[1]);
    case "sqrt":
      return Math.sqrt(args[0]);
    case "sin":
      return Math.sin(args[0]);
    case "cos":
      return Math.cos(args[0]);
    case "tan":
      return Math.tan(args[0]);
    case "log":
      return Math.log(args[0]);
    case "exp":
      return Math.exp(args[0]);
    default:
      throw new Error(`不支持的 Math 函数: ${name}`);
  }
}

type AstNode = Record<string, unknown> & { type: string };

function isAstNode(node: unknown): node is AstNode {
  return (
    typeof node === "object" && node !== null && "type" in node && typeof node.type === "string"
  );
}

function getMathMemberName(node: unknown): string {
  if (
    !isAstNode(node) ||
    node.type !== "MemberExpression" ||
    node.computed === true ||
    node.optional === true ||
    !isAstNode(node.object) ||
    node.object.type !== "Identifier" ||
    node.object.name !== "Math" ||
    !isAstNode(node.property) ||
    node.property.type !== "Identifier" ||
    typeof node.property.name !== "string"
  ) {
    throw new Error("不支持的 Math 成员访问");
  }
  return node.property.name;
}

function getMathConstant(name: string): number {
  switch (name) {
    case "PI":
      return Math.PI;
    case "E":
      return Math.E;
    default:
      throw new Error(`不支持的 Math 常量: ${name}`);
  }
}

function evaluateAstNode(node: unknown): number {
  if (!isAstNode(node)) throw new Error("不支持的表达式类型");

  switch (node.type) {
    case "NumericLiteral":
      if (typeof node.value !== "number") throw new Error("不支持的数字字面量");
      return node.value;
    case "Identifier":
      if (typeof node.name === "string") throw new Error(`未定义的变量: ${node.name}`);
      throw new Error("不支持的表达式类型: Identifier");
    case "MemberExpression":
      return getMathConstant(getMathMemberName(node));
    case "UnaryExpression": {
      if ((node.operator !== "+" && node.operator !== "-") || !isAstNode(node.argument)) {
        throw new Error(`不支持的表达式类型: ${node.type}`);
      }
      const value = evaluateAstNode(node.argument);
      return node.operator === "-" ? -value : value;
    }
    case "BinaryExpression":
      return evaluateBinaryExpression(node);
    case "CallExpression": {
      if (node.optional === true || !Array.isArray(node.arguments)) {
        throw new Error(`不支持的表达式类型: ${node.type}`);
      }
      const name = getMathMemberName(node.callee);
      const args = node.arguments.map((argument: unknown) => evaluateAstNode(argument));
      return callMathFunction(name, args);
    }
    default:
      throw new Error(`不支持的表达式类型: ${node.type}`);
  }
}

function evaluateBinaryExpression(node: AstNode): number {
  if (typeof node.operator !== "string" || !isAstNode(node.left) || !isAstNode(node.right)) {
    throw new Error("不支持的表达式类型: BinaryExpression");
  }

  const leftValue = evaluateAstNode(node.left);
  const rightValue = evaluateAstNode(node.right);
  switch (node.operator) {
    case "+":
      return leftValue + rightValue;
    case "-":
      return leftValue - rightValue;
    case "*":
      return leftValue * rightValue;
    case "/":
      return leftValue / rightValue;
    case "%":
      return leftValue % rightValue;
    case "**":
      return leftValue ** rightValue;
    case "^":
      return leftValue ^ rightValue;
    default:
      throw new Error(`不支持的运算符: ${node.operator}`);
  }
}

class ExpressionParser {
  constructor(private readonly expression: string) {}

  parse(): number {
    return evaluateAstNode(parseExpression(this.expression));
  }
}

export class CalculatorTool extends Tool {
  constructor() {
    super(
      "typescript_calculator",
      "执行 TypeScript/JavaScript 数值表达式，支持算术运算和 Math 函数。例如：2+3*4、Math.sqrt(16)、Math.sin(Math.PI/2)。",
    );
  }

  run(parameters: Record<string, unknown>): string {
    const expression = parameters.input || parameters.expression || "";
    if (!expression) return "错误：计算表达式不能为空";

    if (typeof expression !== "string") {
      const errorMessage = "计算失败: expression must be a string";
      console.log(`❌ ${errorMessage}`);
      return errorMessage;
    }
    console.log(`🧮 正在计算: ${expression}`);
    try {
      const result = String(new ExpressionParser(expression).parse());
      console.log(`✅ 计算结果: ${result}`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorMessage = `计算失败: ${message}`;
      console.log(`❌ ${errorMessage}`);
      return errorMessage;
    }
  }

  getParameters(): ToolParameter[] {
    return [
      new ToolParameter({
        name: "input",
        type: "string",
        description: "要计算的 TypeScript 数值表达式，支持 Math 函数和算术运算",
        required: true,
      }),
    ];
  }
}

export function calculate(expression: string): string {
  return new CalculatorTool().run({ input: expression });
}
