import assert from "node:assert/strict";

import { generateGeminiResponse, type ChatMessage, type ChatResponseBody } from "./index.js";

export type EvaluationCase = {
  name: string;
  messages: ChatMessage[];
  check: (response: ChatResponseBody) => void | Promise<void>;
};

export const evaluationCases: EvaluationCase[] = [
  {
    name: "company-relevant-cost-risks",
    messages: [{ role: "user", content: "Which events matter most for our cost base?" }],
    check: (response) => {
      assert.equal(response.evidenceStatus, "supported");
      const eventIds = response.references.map((reference) => reference.eventId);
      assert.ok(eventIds.includes("evt_006") || eventIds.includes("evt_004"), "Expected a cost-risk answer grounded in semiconductor or power events.");
    },
  },
  {
    name: "semiconductor-vs-power-comparison",
    messages: [{ role: "user", content: "Compare semiconductor supply disruption with power rationing and tell me which matters more first." }],
    check: (response) => {
      const eventIds = response.references.map((reference) => reference.eventId);
      assert.ok(eventIds.includes("evt_006"), "Expected the semiconductor event to be cited.");
      assert.ok(eventIds.includes("evt_004"), "Expected the power-rationing event to be cited.");
    },
  },
  {
    name: "ai-automation-opportunities",
    messages: [{ role: "user", content: "Which events create AI or automation opportunities for enterprise operations?" }],
    check: (response) => {
      const eventIds = response.references.map((reference) => reference.eventId);
      const relevantIds = new Set(["evt_003", "evt_014", "evt_022"]);
      assert.ok(eventIds.some((eventId) => relevantIds.has(eventId)), "Expected automation-related event references.");
      assert.match(response.answer, /AI|automation|agents|procurement/i, "Expected an AI/automation opportunity answer.");
    },
  },
  {
    name: "follow-up-cost-base-question",
    messages: [
      { role: "user", content: "Which events matter most for industrial costs?" },
      { role: "assistant", content: "Semiconductor supply and power rationing are the biggest near-term risks." },
      { role: "user", content: "Which of those could affect our cost base first?" },
    ],
    check: (response) => {
      assert.equal(response.evidenceStatus, "supported");
      const eventIds = response.references.map((reference) => reference.eventId);
      assert.ok(eventIds.includes("evt_004") || eventIds.includes("evt_006"), "Expected the follow-up answer to ground in the earlier cost-risk events.");
    },
  },
  {
    name: "unsupported-interest-rate-prediction",
    messages: [{ role: "user", content: "Will interest rates fall next year?" }],
    check: (response) => {
      assert.equal(response.evidenceStatus, "insufficient");
      assert.equal(response.references.length, 0, "Unsupported questions should not cite event references.");
      assert.match(response.answer, /insufficient|not enough evidence|cannot determine|does not provide enough evidence/i, "Expected an explicit insufficient-evidence answer.");
    },
  },
];

export async function runEvaluationCase(
  scenario: EvaluationCase,
  generateResponse: (messages: ChatMessage[]) => Promise<ChatResponseBody> = generateGeminiResponse,
): Promise<{ name: string; passed: boolean; payload?: ChatResponseBody; error?: string }> {
  try {
    const payload = await generateResponse(scenario.messages);
    await scenario.check(payload);
    return { name: scenario.name, passed: true, payload };
  } catch (error) {
    return {
      name: scenario.name,
      passed: false,
      error: error instanceof Error ? error.message : "Unknown evaluation error.",
    };
  }
}

export async function runLiveEvaluation(
  generateResponse: (messages: ChatMessage[]) => Promise<ChatResponseBody> = generateGeminiResponse,
): Promise<{ skipped: boolean; passed: number; failed: number; results: Array<{ name: string; passed: boolean; error?: string }> }> {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return { skipped: true, passed: 0, failed: 0, results: [] };
  }

  const results = await Promise.all(
    evaluationCases.map((scenario) => runEvaluationCase(scenario, generateResponse)),
  );

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;

  return { skipped: false, passed, failed, results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runLiveEvaluation();
  if (result.skipped) {
    console.log("Live Gemini evaluation skipped: GEMINI_API_KEY is not configured.");
    process.exit(0);
  }

  console.log(`Live Gemini evaluation: ${result.passed}/${result.passed + result.failed} checks passed.`);
  for (const scenario of result.results) {
    console.log(`${scenario.passed ? "PASS" : "FAIL"}: ${scenario.name}`);
    if (!scenario.passed && scenario.error) {
      console.log(`  ${scenario.error}`);
    }
  }

  process.exit(result.failed === 0 ? 0 : 1);
}
