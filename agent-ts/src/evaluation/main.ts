import { writeFile } from "node:fs/promises";
import { argv, exit } from "node:process";
import { EvalDatasetLoader } from "./dataset/EvalDatasetLoader.js";
import { EvalDeepEval } from "./deepeval/EvalDeepEval.js";
import { EvalRunner } from "./runner/EvalRunner.js";
import { EvalJudge } from "./judge/EvalJudge.js";
import { EvalBackendProbe } from "./probe/EvalBackendProbe.js";
import { EvalConfigFactory } from "../config/factory/EvalConfigFactory.js";
import { AgentConfig } from "../config/model/core/AgentConfig.js";
import { RagApiClient } from "../rag/api/core/RagApiClient.js";
import { OpenAIChatClient } from "../openai/chat/core/client/OpenAIChatClient.js";
import type { JsonObject } from "../common/json/types/JsonTypes.js";

function readArg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const value = argv.find((item) => item.startsWith(prefix));
  if (value) return value.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) return argv[index + 1];
  return fallback;
}

async function main(): Promise<void> {
  const datasetPath = readArg("dataset");
  if (!datasetPath) {
    throw new Error("missing required argument: --dataset");
  }

  const outputPath = readArg("output", "eval_report.json") ?? "eval_report.json";
  const topK = Number(readArg("top-k", "5") ?? "5");
  const dataset = await EvalDatasetLoader.load(datasetPath);
  const config = AgentConfig.fromEnv();
  const evalConfig = new EvalConfigFactory().fromEnv();
  const ragClient = config.ragApiBaseUrl ? new RagApiClient(config) : undefined;
  const openAiClient = config.openAiApiKey ? new OpenAIChatClient(config) : undefined;
  const buildEvalConfig = () => ({
    model: readArg("judge-model") ?? evalConfig.model,
    apiKey: evalConfig.apiKey || undefined,
    baseUrl: evalConfig.baseUrl || undefined
  });
  const probe = await EvalBackendProbe.probe(
    evalConfig.baseUrl,
    evalConfig.apiKey,
    readArg("judge-model") ?? evalConfig.model
  );

  const runner = new EvalRunner(dataset, topK, {
    ragSearch: async (_query, _targetKbId, requestedTopK) => {
      if (!ragClient) return [];
      const documents = await ragClient.searchDocuments(_query, requestedTopK);
      return documents.map((document, index) => ({
        chunkId: `${document.documentId}:${document.chunkIndex}`,
        text: document.content,
        source: "rag",
        score: document.score ?? Math.max(0, 1 - index * 0.1)
      }));
    },
    getAgentAnswer: async (query, _targetKbId) => {
      if (!openAiClient) return "";
      const messages = [{ role: "user" as const, content: query }];
      const result = await openAiClient.streamChat(messages);
      let answer = "";
      for await (const delta of result) {
        answer += delta;
      }
      return answer;
    },
    judgeE2e: async (query, expectedAnswer, actualAnswer) => {
      if (!probe.available) {
        return { error: "no_llm_provider", avg_score: 0 };
      }
      const score = await EvalJudge.judge(query, expectedAnswer, actualAnswer, {
        ...buildEvalConfig(),
        available: true
      });
      const result: JsonObject = { avg_score: score.avg_score };
      if (score.relevance !== undefined) result.relevance = score.relevance;
      if (score.completeness !== undefined) result.completeness = score.completeness;
      if (score.accuracy !== undefined) result.accuracy = score.accuracy;
      if (score.fluency !== undefined) result.fluency = score.fluency;
      if (score.reasoning !== undefined) result.reasoning = score.reasoning;
      if (score.error !== undefined) result.error = score.error;
      return result;
    },
    deepeval: async (query, expectedAnswer, actualAnswer, retrievalContext) =>
      EvalDeepEval.evaluate(query, expectedAnswer, actualAnswer, retrievalContext, {
        model: readArg("deepeval-model") ?? evalConfig.model,
        apiKey: evalConfig.apiKey || undefined,
        baseUrl: evalConfig.baseUrl || undefined,
        available: probe.available
      })
  });

  const report = await runner.runAll();
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  // eslint-disable-next-line no-console
  console.log(`eval report written to ${outputPath}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  exit(1);
});
