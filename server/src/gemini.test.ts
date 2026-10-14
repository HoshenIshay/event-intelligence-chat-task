import assert from "node:assert/strict";
import { test } from "node:test";

import { generateGeminiResponse, type ChatMessage } from "./index.js";

test("generateGeminiResponse returns a provider response when the key is set and the client succeeds", async () => {
  const messages: ChatMessage[] = [{ role: "user", content: "Which events matter most?" }];
  process.env.GEMINI_API_KEY = "test-key";

  const payload = await generateGeminiResponse(messages, () => ({
    models: {
      generateContent: async ({ contents }) => ({
        text: `Provider answer: ${contents}`,
      }),
    },
  }));

  assert.match(payload.answer, /Provider answer/i);
  assert.equal(payload.evidenceStatus, "not_evaluated");
  assert.deepEqual(payload.references, []);
});

test("generateGeminiResponse throws when the API key is missing", async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    await assert.rejects(
      () => generateGeminiResponse([{ role: "user", content: "What happened?" }]),
      /not configured/i,
    );
  } finally {
    if (previous) {
      process.env.GEMINI_API_KEY = previous;
    }
  }
});

test("generateGeminiResponse throws provider errors without a success-shaped payload", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  try {
    await assert.rejects(
      () => generateGeminiResponse([{ role: "user", content: "What happened?" }], () => ({
        models: {
          generateContent: async () => {
            throw new Error("quota exceeded");
          },
        },
      })),
      /Gemini request failed: quota exceeded/i,
    );
  } finally {
    if (previous) {
      process.env.GEMINI_API_KEY = previous;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  }
});
