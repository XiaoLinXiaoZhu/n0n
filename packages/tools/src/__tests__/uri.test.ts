import { describe, expect, it } from "bun:test";

import { parsePostUri } from "../uri.ts";

describe("parsePostUri — exec scheme", () => {
  it("解析 exec://<runtime>/<claim>", () => {
    expect(parsePostUri("exec://sh/read-config")).toEqual({
      scheme: "exec",
      runtime: "sh",
      claim: "read-config",
    });
  });

  it("解析 query：cwd / waitfor / max_output_tokens", () => {
    expect(
      parsePostUri(
        "exec://bun/probe?cwd=sub/dir&waitfor=30&max_output_tokens=5000",
      ),
    ).toEqual({
      scheme: "exec",
      runtime: "bun",
      claim: "probe",
      cwd: "sub/dir",
      waitfor: 30,
      maxOutputTokens: 5000,
    });
  });

  it("waitfor 超过 240 时 clamp 到 240", () => {
    const parsed = parsePostUri("exec://sh/c?waitfor=999");
    expect(parsed).toMatchObject({ waitfor: 240 });
  });

  it("waitfor 非法值（NaN / 非正数）被忽略", () => {
    expect(parsePostUri("exec://sh/c?waitfor=abc")).not.toHaveProperty(
      "waitfor",
    );
    expect(parsePostUri("exec://sh/c?waitfor=-5")).not.toHaveProperty(
      "waitfor",
    );
    expect(parsePostUri("exec://sh/c?waitfor=0")).not.toHaveProperty("waitfor");
  });

  it("max_output_tokens 取整（floor）", () => {
    const parsed = parsePostUri("exec://sh/c?max_output_tokens=5000.7");
    expect(parsed).toMatchObject({ maxOutputTokens: 5000 });
  });

  it("URL 解码 runtime 与 claim 段", () => {
    const parsed = parsePostUri("exec://bu%6E/read%20config");
    expect(parsed).toMatchObject({ runtime: "bun", claim: "read config" });
  });

  it("URL 解码 cwd", () => {
    const parsed = parsePostUri("exec://sh/c?cwd=my%20dir");
    expect(parsed).toMatchObject({ cwd: "my dir" });
  });

  it("未知 query 键忽略", () => {
    const parsed = parsePostUri("exec://sh/c?foo=bar");
    expect(parsed).toEqual({
      scheme: "exec",
      runtime: "sh",
      claim: "c",
    });
  });

  it("claim 含 / 时取首个 / 之后全部", () => {
    const parsed = parsePostUri("exec://sh/a/b/c");
    expect(parsed).toMatchObject({ claim: "a/b/c" });
  });
});

describe("parsePostUri — write scheme", () => {
  it("解析 write://<path>（无 query → 全写）", () => {
    expect(parsePostUri("write://tmp/probe.txt")).toEqual({
      scheme: "write",
      path: "tmp/probe.txt",
      prefixLines: 0,
      suffixLines: 0,
    });
  });

  it("URL 解码路径", () => {
    expect(parsePostUri("write://my%20dir/file.txt")).toEqual({
      scheme: "write",
      path: "my dir/file.txt",
      prefixLines: 0,
      suffixLines: 0,
    });
  });

  it("解析 prefix_lines/suffix_lines query", () => {
    expect(parsePostUri("write://a.txt?prefix_lines=3&suffix_lines=2")).toEqual(
      {
        scheme: "write",
        path: "a.txt",
        prefixLines: 3,
        suffixLines: 2,
      },
    );
  });

  it("显式 0 等价于省略", () => {
    expect(parsePostUri("write://a.txt?prefix_lines=0&suffix_lines=0")).toEqual(
      {
        scheme: "write",
        path: "a.txt",
        prefixLines: 0,
        suffixLines: 0,
      },
    );
  });

  it("路径中的 ? 字面量写 %3F（首个裸 ? 切 query）", () => {
    expect(parsePostUri("write://weird%3Fname.txt?prefix_lines=1")).toEqual({
      scheme: "write",
      path: "weird?name.txt",
      prefixLines: 1,
      suffixLines: 0,
    });
  });

  it("prefix_lines/suffix_lines 非法值抛错（而非静默降级全写）", () => {
    expect(() => parsePostUri("write://a.txt?prefix_lines=abc")).toThrow();
    expect(() => parsePostUri("write://a.txt?suffix_lines=-1")).toThrow();
    expect(() => parsePostUri("write://a.txt?prefix_lines=1.5")).toThrow();
  });

  it("未知 query 键抛错（防窗口写静默降级全量覆盖）", () => {
    expect(() => parsePostUri("write://a.txt?prefix_line=1")).toThrow();
  });
});

describe("parsePostUri — customer scheme", () => {
  it("解析 customer://question", () => {
    expect(parsePostUri("customer://question")).toEqual({
      scheme: "customer",
      kind: "question",
      slug: null,
    });
  });

  it("解析 customer://form", () => {
    expect(parsePostUri("customer://form")).toEqual({
      scheme: "customer",
      kind: "form",
      slug: null,
    });
  });

  it("解析 customer://action_required", () => {
    expect(parsePostUri("customer://action_required")).toEqual({
      scheme: "customer",
      kind: "action_required",
      slug: null,
    });
  });
  it("解析 customer://question/<slug>", () => {
    expect(parsePostUri("customer://question/choose-approach")).toEqual({
      scheme: "customer",
      kind: "question",
      slug: "choose-approach",
    });
  });

  it("URL 解码 slug 段", () => {
    expect(parsePostUri("customer://form/my%20plan")).toMatchObject({
      slug: "my plan",
    });
  });

  it("尾部斜杠视为无 slug", () => {
    expect(parsePostUri("customer://question/")).toEqual({
      scheme: "customer",
      kind: "question",
      slug: null,
    });
  });

  it("slug 多段抛错", () => {
    expect(() => parsePostUri("customer://question/a/b")).toThrow();
  });

  it("slug 含路径穿越抛错", () => {
    expect(() => parsePostUri("customer://question/..%2Fevil")).toThrow();
    expect(() => parsePostUri("customer://question/..")).toThrow();
  });
});

describe("parsePostUri — todo scheme", () => {
  it("解析 todo://<goal>", () => {
    expect(parsePostUri("todo://refactor-auth")).toEqual({
      scheme: "todo",
      goal: "refactor-auth",
    });
  });

  it("URL 解码 goal", () => {
    expect(parsePostUri("todo://my%20plan")).toEqual({
      scheme: "todo",
      goal: "my plan",
    });
  });

  it("空 goal（todo://）抛错", () => {
    expect(() => parsePostUri("todo://")).toThrow();
  });

  it("goal 含路径分隔符抛错（防路径穿越）", () => {
    expect(() => parsePostUri("todo://../evil")).toThrow();
    expect(() => parsePostUri("todo://a/b")).toThrow();
    expect(() => parsePostUri("todo://a\\b")).toThrow();
  });

  it("goal 为 . 或 .. 抛错", () => {
    expect(() => parsePostUri("todo://.")).toThrow();
    expect(() => parsePostUri("todo://..")).toThrow();
  });
});

describe("parsePostUri — throw 路径", () => {
  it("空 uri 抛错", () => {
    expect(() => parsePostUri("")).toThrow();
  });

  it("无 scheme（缺少 ://）抛错", () => {
    expect(() => parsePostUri("just-a-path")).toThrow();
  });

  it("exec 缺少 runtime（exec:///claim）抛错", () => {
    expect(() => parsePostUri("exec:///claim")).toThrow();
  });

  it("exec 缺少 claim（exec://sh）抛错", () => {
    expect(() => parsePostUri("exec://sh")).toThrow();
  });

  it("exec claim 为空（exec://sh/）抛错", () => {
    expect(() => parsePostUri("exec://sh/")).toThrow();
  });

  it("customer 非法 kind 抛错", () => {
    expect(() => parsePostUri("customer://unknown")).toThrow();
  });

  it("未知 scheme 抛错且消息列出支持的 scheme", () => {
    expect(() => parsePostUri("http://example.com")).toThrow(
      /exec:\/\/|write:\/\/|customer:\/\/|todo:\/\//,
    );
  });

  it("空 write 路径（write://）抛错", () => {
    expect(() => parsePostUri("write://")).toThrow();
  });
});
