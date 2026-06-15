/**
 * Anthropic Client — 公共导出入口
 *
 * 仅 re-export。各子模块职责：
 * - client.ts  — AnthropicClient 类
 * - stream.ts  — stream() async generator
 * - types.ts   — Anthropic API 类型定义
 * - format.ts  — PromptMessage → Anthropic 格式转换
 * - constants.ts — 默认值常量
 */

export { AnthropicClient } from "./client.ts";
