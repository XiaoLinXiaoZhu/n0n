/**
 * config/index — 通用 TOML 配置加载器
 *
 * 提供 getConfig() 函数，接受 zod schema + 多个 TOML 文本，
 * 经过合并 → $VAR 替换 → extend 解析 → zod 验证后返回类型安全的配置。
 *
 * 纯函数设计：除 smol-toml 解析和 zod 验证外，全部为纯函数。
 * 来源可追踪：成功时返回 trace，记录每个字段来自哪个 ConfigSource。
 */

import { parse as parseTOML } from "smol-toml";
import type { z } from "zod";
import {
  type ConfigError,
  type ConfigResult,
  type ConfigSource,
  type Trace,
} from "./types.ts";

export type { ConfigError, ConfigResult, ConfigSource, Trace } from "./types.ts";

// ── $VAR 解析 ──

const VAR_RE = /^\$([A-Z_][A-Z0-9_]*)$/;

/**
 * 递归替换对象中所有匹配 $VAR 模式的字符串值。
 * 使用 trace 中的来源信息确定每个 $VAR 引用的来源。
 */
function resolveVars(
  obj: unknown,
  envPool: Record<string, string>,
  trace: Trace,
): { value: unknown; errors: ConfigError[] } {
  const errors: ConfigError[] = [];

  if (typeof obj === "string") {
    const m = obj.match(VAR_RE);
    if (m) {
      const varName = m[1]!;
      const resolved = envPool[varName];
      if (resolved === undefined) {
        // 从 trace 中查找此值的来源
        // 需要调用方提供 dotPath，这里无法获取——改用内联方式
        errors.push({
          kind: "env_var_not_found" as const,
          varName,
          sourceName: "", // 由调用方填充
          message: `环境变量 ${varName} 未找到`,
        });
        return { value: obj, errors };
      }
      return { value: resolved, errors };
    }
    return { value: obj, errors };
  }

  if (Array.isArray(obj)) {
    const result: unknown[] = [];
    for (const item of obj) {
      const r = resolveVars(item, envPool, trace);
      result.push(r.value);
      errors.push(...r.errors);
    }
    return { value: result, errors };
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const r = resolveVars(v, envPool, trace);
      result[k] = r.value;
      errors.push(...r.errors);
    }
    return { value: result, errors };
  }

  return { value: obj, errors };
}

/**
 * 带 dot-path 的 $VAR 解析——用于为错误消息提供准确的来源和路径信息。
 */
function resolveVarsWithPaths(
  obj: unknown,
  envPool: Record<string, string>,
  trace: Trace,
  prefix: string,
): { value: unknown; errors: ConfigError[] } {
  const errors: ConfigError[] = [];

  if (typeof obj === "string") {
    const m = obj.match(VAR_RE);
    if (m) {
      const varName = m[1]!;
      const resolved = envPool[varName];
      if (resolved === undefined) {
        const sourceName = trace[prefix]?.source ?? "未知";
        errors.push({
          kind: "env_var_not_found" as const,
          varName,
          sourceName,
          message: `环境变量 ${varName} 未找到（在配置源 "${sourceName}" 的 ${prefix} 中引用）`,
        });
        return { value: obj, errors };
      }
      return { value: resolved, errors };
    }
    return { value: obj, errors };
  }

  if (Array.isArray(obj)) {
    const result: unknown[] = [];
    for (let i = 0; i < obj.length; i++) {
      const r = resolveVarsWithPaths(obj[i], envPool, trace, `${prefix}[${i}]`);
      result.push(r.value);
      errors.push(...r.errors);
    }
    return { value: result, errors };
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const dotPath = prefix ? `${prefix}.${k}` : k;
      const r = resolveVarsWithPaths(v, envPool, trace, dotPath);
      result[k] = r.value;
      errors.push(...r.errors);
    }
    return { value: result, errors };
  }

  return { value: obj, errors };
}

// ── deep merge ──

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
  overlaySource: string,
  trace: Trace,
  prefix: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // 先放 base 的 key
  for (const key of Object.keys(base)) {
    result[key] = base[key];
  }

  // overlay 覆盖
  for (const key of Object.keys(overlay)) {
    const overlayVal = overlay[key];
    const baseVal = base[key];
    const dotPath = prefix ? `${prefix}.${key}` : key;

    if (isObject(overlayVal) && isObject(baseVal)) {
      result[key] = deepMerge(
        baseVal,
        overlayVal,
        overlaySource,
        trace,
        dotPath,
      );
    } else {
      result[key] = overlayVal;
      // 更新 trace
      if (isObject(overlayVal)) {
        // 对象值：重建整个子树的 trace
        buildTrace(overlayVal, overlaySource, dotPath, trace);
      } else if (overlayVal !== undefined) {
        trace[dotPath] = { value: overlayVal, source: overlaySource };
      }
    }
  }

  return result;
}

// ── 构建初始 trace ──

function buildTrace(
  obj: unknown,
  source: string,
  prefix: string,
  trace: Trace,
): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    // 数组不展开为 trace
    return;
  }
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const dotPath = prefix ? `${prefix}.${key}` : key;
    if (isObject(val)) {
      buildTrace(val, source, dotPath, trace);
    } else if (val !== undefined) {
      trace[dotPath] = { value: val, source };
    }
  }
}

// ── dot-path 读取 ──

function getByPath(obj: Record<string, unknown>, path: string): unknown | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (!isObject(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ── 查找所有 extend 节点 ──

interface ExtendNode {
  /** extend 所在的父对象 */
  parent: Record<string, unknown>;
  /** extend 的值（dot-path 字符串） */
  targetPath: string;
  /** 此节点的 dot-path */
  selfPath: string;
}

function findExtendNodes(
  obj: Record<string, unknown>,
  prefix: string,
): ExtendNode[] {
  const nodes: ExtendNode[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const dotPath = prefix ? `${prefix}.${key}` : key;
    if (isObject(val)) {
      if (typeof val["extend"] === "string") {
        nodes.push({
          parent: val,
          targetPath: val["extend"],
          selfPath: dotPath,
        });
      }
      nodes.push(...findExtendNodes(val, dotPath));
    }
  }
  return nodes;
}

// ── extend 解析 ──

function resolveExtends(
  root: Record<string, unknown>,
  trace: Trace,
): ConfigError[] {
  const errors: ConfigError[] = [];
  const visited = new Set<string>();

  for (let i = 0; i < 100; i++) {
    const nodes = findExtendNodes(root, "");
    if (nodes.length === 0) return errors;

    let resolved = false;
    for (const node of nodes) {
      const target = getByPath(root, node.targetPath);
      if (target === undefined) {
        errors.push({
          kind: "extend_target_not_found" as const,
          targetPath: node.targetPath,
          parentPath: node.selfPath,
          message: `extend 目标 "${node.targetPath}" 不存在（在 "${node.selfPath}" 中引用）`,
        });
        delete node.parent["extend"];
        resolved = true;
        break;
      }

      if (!isObject(target)) {
        errors.push({
          kind: "extend_target_not_found" as const,
          targetPath: node.targetPath,
          parentPath: node.selfPath,
          message: `extend 目标 "${node.targetPath}" 不是 object（在 "${node.selfPath}" 中引用）`,
        });
        delete node.parent["extend"];
        resolved = true;
        break;
      }

      // 检查目标是否还有未解析的 extend
      if (typeof (target as Record<string, unknown>)["extend"] === "string") {
        continue;
      }

      // 环检测
      const chainKey = `${node.selfPath}→${node.targetPath}`;
      if (visited.has(chainKey)) {
        errors.push({
          kind: "circular_extend" as const,
          chain: [node.selfPath, node.targetPath],
          message: `检测到循环 extend: ${node.selfPath} → ${node.targetPath}`,
        });
        delete node.parent["extend"];
        resolved = true;
        break;
      }
      visited.add(chainKey);

      // 执行 deep merge: target 作为 base，own 字段作为 overlay 覆盖
      delete node.parent["extend"];

      // 获取 overlay(parent/own) 的来源——从 trace 中任一个子字段读取
      const parentKeys = Object.keys(node.parent);
      let overlaySource = "unknown";
      for (const k of parentKeys) {
        const childPath = node.selfPath ? `${node.selfPath}.${k}` : k;
        if (trace[childPath]?.source) {
          overlaySource = trace[childPath].source;
          break;
        }
      }

      // 使用 deepMerge 执行递归合并（own 覆盖 target）
      const mergedNode = deepMerge(target, node.parent, overlaySource, trace, node.selfPath);

      // 用 merged 结果替换 parent 的全部字段
      for (const key of Object.keys(node.parent)) {
        delete node.parent[key];
      }
      for (const [key, val] of Object.entries(mergedNode)) {
        node.parent[key] = val;
      }

      // deepMerge 已为 overlay 字段写入 trace。
      // 补全 target-only 字段（不在 overlay 中）的 trace：从 target 路径递归复制
      function copyTraceSubtree(srcPrefix: string, dstPrefix: string): void {
        for (const [path, entry] of Object.entries(trace)) {
          if (path === srcPrefix || path.startsWith(srcPrefix + ".")) {
            const suffix = path === srcPrefix ? "" : path.slice(srcPrefix.length);
            const dstPath = dstPrefix + suffix;
            if (!trace[dstPath]) {
              trace[dstPath] = { ...entry };
            }
          }
        }
      }
      copyTraceSubtree(node.targetPath, node.selfPath);

      resolved = true;
      break;
    }

    if (!resolved) {
      const remaining = findExtendNodes(root, "");
      for (const node of remaining) {
        const target = getByPath(root, node.targetPath);
        if (target !== undefined && isObject(target) && typeof (target as Record<string, unknown>)["extend"] === "string") {
          errors.push({
            kind: "circular_extend" as const,
            chain: [node.selfPath, node.targetPath],
            message: `无法解析 extend 链，可能存在循环: ${node.selfPath} → ${node.targetPath}`,
          });
        }
      }
      return errors;
    }
  }

  errors.push({
    kind: "circular_extend" as const,
    chain: [],
    message: "extend 解析超过最大迭代次数，可能存在复杂循环依赖",
  });
  return errors;
}

// ── flatten trace ──

function flattenTrace(
  obj: unknown,
  prefix: string,
  trace: Trace,
): void {
  if (!isObject(obj)) return;
  for (const [key, val] of Object.entries(obj)) {
    const dotPath = prefix ? `${prefix}.${key}` : key;
    if (isObject(val)) {
      flattenTrace(val, dotPath, trace);
    } else if (val !== undefined && !trace[dotPath]) {
      trace[dotPath] = { value: val, source: "zod default" };
    }
  }
}

// ── 主函数 ──

/**
 * 加载并解析 TOML 配置。
 *
 * @param schema zod schema，描述期望的配置形状
 * @param sources TOML 配置源数组（按顺序，后者覆盖前者）
 * @param envPool 环境变量池（.env + process.env），用于 $VAR 替换
 * @returns ConfigResult — 成功含 data + trace，失败含 errors
 */
export function getConfig<T>(
  schema: z.ZodType<T>,
  sources: ConfigSource[],
  envPool: Record<string, string> = {},
): ConfigResult<T> {
  const errors: ConfigError[] = [];

  // ── 1. 解析所有 TOML 源 ──
  const parsedList: { name: string; data: Record<string, unknown> }[] = [];
  for (const source of sources) {
    let parsed: unknown;
    try {
      parsed = parseTOML(source.content);
    } catch (e) {
      errors.push({
        kind: "toml_parse_error" as const,
        sourceName: source.name,
        message: `${source.name}: TOML 解析失败 — ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    if (!isObject(parsed)) {
      errors.push({
        kind: "toml_parse_error" as const,
        sourceName: source.name,
        message: `${source.name}: TOML 顶层必须是 object`,
      });
      continue;
    }
    parsedList.push({ name: source.name, data: parsed });
  }

  if (errors.length > 0) return { success: false, errors };

  // ── 2. deep merge ──
  let merged: Record<string, unknown> = {};
  const trace: Trace = {};

  for (const { name, data } of parsedList) {
    if (Object.keys(merged).length === 0) {
      merged = data;
      buildTrace(data, name, "", trace);
    } else {
      // 先为新 source 构建 trace，再 merge（merge 会更新覆盖的 trace）
      const newTrace: Trace = {};
      buildTrace(data, name, "", newTrace);
      // 新 trace 覆盖旧 trace
      for (const [k, v] of Object.entries(newTrace)) {
        trace[k] = v;
      }
      merged = deepMerge(merged, data, name, trace, "");
    }
  }

  // ── 3. $VAR 解析（单次遍历，使用 trace 确定来源） ──
  const varResult = resolveVarsWithPaths(merged, envPool, trace, "");
  merged = varResult.value as Record<string, unknown>;
  errors.push(...varResult.errors);

  if (errors.length > 0) return { success: false, errors };

  // ── 4. extend 解析 ──
  const extendErrors = resolveExtends(merged, trace);
  if (extendErrors.length > 0) {
    return { success: false, errors: extendErrors };
  }

  // ── 5. zod 验证 ──
  let validated: T;
  try {
    validated = schema.parse(merged);
  } catch (e) {
    const zodError = e as { issues?: Array<{ message: string; path: (string | number)[] }> };
    const message = zodError.issues
      ? zodError.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      : String(e);
    errors.push({
      kind: "schema_validation_error" as const,
      message,
    });
    return { success: false, errors };
  }

  // ── 6. 补充 trace（zod default 填充的字段） ──
  flattenTrace(validated as unknown as Record<string, unknown>, "", trace);

  return { success: true, data: validated, trace };
}
