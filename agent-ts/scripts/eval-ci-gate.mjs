import { readFile } from "node:fs/promises";
import { exit } from "node:process";

const reportPath = process.argv[2] ?? "eval-ci-report.json";
const minE2eScore = Number(process.env.EVAL_CI_MIN_E2E_SCORE ?? "4");
const minDeepEvalScore = Number(process.env.EVAL_CI_MIN_DEEPEVAL_SCORE ?? "0.7");

function readObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

function readNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`missing numeric ${name}`);
  }
  return value;
}

function assertNoProviderErrors(report) {
  for (const entry of report.cases) {
    const e2e = readObject(entry.e2e, `case ${entry.id}.e2e`);
    const deepeval = readObject(entry.e2e_deepeval, `case ${entry.id}.e2e_deepeval`);
    if (e2e.error) {
      throw new Error(`case ${entry.id} e2e failed: ${e2e.error}`);
    }
    if (deepeval.error) {
      throw new Error(`case ${entry.id} deepeval failed: ${deepeval.error}`);
    }
  }
}

async function main() {
  const report = readObject(JSON.parse(await readFile(reportPath, "utf8")), "report");
  if (!Array.isArray(report.cases) || report.cases.length === 0) {
    throw new Error("eval report has no cases");
  }
  assertNoProviderErrors(report);

  const summary = readObject(report.summary, "summary");
  const e2e = readObject(summary.e2e, "summary.e2e");
  const deepeval = readObject(summary.deepeval, "summary.deepeval");
  const e2eScore = readNumber(e2e.avg_score, "summary.e2e.avg_score");
  const deepevalScore = readNumber(deepeval.avg_score, "summary.deepeval.avg_score");

  if (e2eScore < minE2eScore) {
    throw new Error(`e2e avg_score ${e2eScore} is below threshold ${minE2eScore}`);
  }
  if (deepevalScore < minDeepEvalScore) {
    throw new Error(`deepeval avg_score ${deepevalScore} is below threshold ${minDeepEvalScore}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        cases: report.cases.length,
        e2e_avg_score: e2eScore,
        deepeval_avg_score: deepevalScore,
        min_e2e_score: minE2eScore,
        min_deepeval_score: minDeepEvalScore
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  exit(1);
});
