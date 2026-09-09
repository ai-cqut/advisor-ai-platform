import assert from "node:assert/strict";
import test from "node:test";
import { SkillRegistry } from "../dist/skills/core/SkillRegistry.js";
import { ExpandSkillTool } from "../dist/skills/tools/ExpandSkillTool.js";
import { OpenAiToolRegistry } from "../dist/openai/tools/registry/core/registry/OpenAiToolRegistry.js";

test("skill registry brief prompt keeps python brief shape", () => {
  const registry = new SkillRegistry();
  registry.register({
    name: "knowledge_qa",
    description: "知识问答",
    brief: "回答知识库问题",
    systemPrompt: "system",
    requiredTools: new Set(),
    priority: 1
  });

  assert.equal(registry.briefPrompt(["knowledge_qa"]), "回答知识库问题");
});

test("expand skill tool mirrors python guidance text", () => {
  const registry = new SkillRegistry();
  const tool = new ExpandSkillTool(registry).create();
  assert.equal(tool.function.name, "expand_skill");
  assert.match(tool.function.description, /完整指令/);
  assert.match(tool.function.description, /brief 指令不足/);
});

test("openai tool registry executes expand skill as a virtual tool", async () => {
  const registry = new SkillRegistry();
  registry.register({
    name: "knowledge_qa",
    description: "知识问答",
    brief: "回答知识库问题",
    systemPrompt: "full skill prompt",
    requiredTools: new Set(),
    priority: 1
  });

  const openAiToolRegistry = new OpenAiToolRegistry(undefined, undefined, undefined, undefined, undefined, registry);
  const result = await openAiToolRegistry.executeTool(
    { messages: [], userId: null, sessionId: null, traceId: null, turnId: null },
    "expand_skill",
    { skill_name: "knowledge_qa" }
  );
  const payload = JSON.parse(result.output);
  assert.equal(result.success, true);
  assert.equal(payload.ok, true);
  assert.equal(payload.status, "hit");
  assert.equal(payload.message, "expanded skill: knowledge_qa");
  assert.equal(payload.items[0].skill_name, "knowledge_qa");
  assert.equal(payload.items[0].full_prompt, "full skill prompt");
});

test("openai tool registry executes tool search as a virtual tool", async () => {
  const registry = new SkillRegistry();
  registry.register({
    name: "knowledge_qa",
    description: "知识问答",
    brief: "回答知识库问题",
    systemPrompt: "full skill prompt",
    requiredTools: new Set(),
    priority: 1
  });

  const openAiToolRegistry = new OpenAiToolRegistry(undefined, undefined, undefined, undefined, undefined, registry);
  const result = await openAiToolRegistry.executeTool(
    { messages: [], userId: null, sessionId: null, traceId: null, turnId: null },
    "tool_search",
    { keywords: "知识 检索", max_results: 3 }
  );
  const payload = JSON.parse(result.output);
  assert.equal(result.success, true);
  assert.equal(payload.ok, true);
  assert.equal(payload.status, "hit");
  assert.equal(payload.items[0].tool_name, "knowledge_qa");
  assert.match(payload.items[0].schema_text, /知识问答/);
});

test("openai tool registry tool search can hit web research by search hint", async () => {
  const registry = new SkillRegistry();
  registry.register({
    name: "web_research",
    description: "联网搜索获取实时信息，适合查询最新资讯、事实核查等。",
    brief: "用 web_search 搜索互联网，整理结果并注明来源。",
    systemPrompt: "full skill prompt",
    requiredTools: new Set(),
    priority: 1,
    searchHint: "联网,搜索,互联网,实时"
  });

  const openAiToolRegistry = new OpenAiToolRegistry(undefined, undefined, undefined, undefined, undefined, registry);
  const result = await openAiToolRegistry.executeTool(
    { messages: [], userId: null, sessionId: null, traceId: null, turnId: null },
    "tool_search",
    { keywords: "联网 搜索", max_results: 3 }
  );
  const payload = JSON.parse(result.output);
  assert.equal(payload.status, "hit");
  assert.equal(payload.items[0].tool_name, "web_research");
});

test("tool search rejects empty keywords", () => {
  const registry = new SkillRegistry();
  const tool = new OpenAiToolRegistry(undefined, undefined, undefined, undefined, undefined, registry);
  return tool.executeTool(
    { messages: [], userId: null, sessionId: null, traceId: null, turnId: null },
    "tool_search",
    { keywords: "" }
  ).then((result) => {
    const payload = JSON.parse(result.output);
    assert.equal(result.success, true);
    assert.equal(payload.ok, false);
    assert.equal(payload.status, "error");
  });
});
