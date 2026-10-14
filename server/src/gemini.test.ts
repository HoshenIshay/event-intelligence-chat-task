import assert from "node:assert/strict";
import { test } from "node:test";

import { generateGeminiResponse, type ChatMessage } from "./index.js";

test("generateGeminiResponse returns a structured grounded response when the key is set and the client succeeds", async () => {
  const messages: ChatMessage[] = [{ role: "user", content: "Which events matter most?" }];
  process.env.GEMINI_API_KEY = "test-key";

  const payload = await generateGeminiResponse(messages, () => ({
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          answer: "The most relevant event is the export licensing change for advanced semiconductor chemicals.",
          evidenceStatus: "supported",
          references: [{ eventId: "evt_006", sourceName: "International Trade Controls Review" }],
        }),
      }),
    },
  }));

  assert.match(payload.answer, /semiconductor/i);
  assert.equal(payload.evidenceStatus, "supported");
  assert.deepEqual(payload.references, [{ eventId: "evt_006", sourceName: "International Trade Controls Review" }]);
});

test("generateGeminiResponse rejects malformed or empty model output", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  try {
    await assert.rejects(
      () => generateGeminiResponse([{ role: "user", content: "What happened?" }], () => ({
        models: {
          generateContent: async () => ({ text: "not-json" }),
        },
      })),
      /Gemini request failed:.*JSON|Unexpected token|not valid JSON/i,
    );

    await assert.rejects(
      () => generateGeminiResponse([{ role: "user", content: "What happened?" }], () => ({
        models: {
          generateContent: async () => ({ text: JSON.stringify({ answer: "", evidenceStatus: "supported", references: [] }) }),
        },
      })),
      /answer cannot be empty/i,
    );
  } finally {
    if (previous) {
      process.env.GEMINI_API_KEY = previous;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  }
});

test("generateGeminiResponse accepts insufficient evidence with no references", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  try {
    const payload = await generateGeminiResponse([{ role: "user", content: "Will rates rise in 2027?" }], () => ({
      models: {
        generateContent: async () => ({
          text: JSON.stringify({
            answer: "The event dataset does not provide enough evidence to forecast interest-rate changes.",
            evidenceStatus: "insufficient",
            references: [],
          }),
        }),
      },
    }));

    assert.equal(payload.evidenceStatus, "insufficient");
    assert.deepEqual(payload.references, []);
  } finally {
    if (previous) {
      process.env.GEMINI_API_KEY = previous;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  }
});

test("generateGeminiResponse rejects unknown event IDs in model references", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  try {
    await assert.rejects(
      () => generateGeminiResponse([{ role: "user", content: "Which events matter most?" }], () => ({
        models: {
          generateContent: async () => ({
            text: JSON.stringify({
              answer: "This is based on an event.",
              evidenceStatus: "supported",
              references: [{ eventId: "evt_999", sourceName: "Fake Source" }],
            }),
          }),
        },
      })),
      /Reference eventId 'evt_999' is not present/i,
    );
  } finally {
    if (previous) {
      process.env.GEMINI_API_KEY = previous;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  }
});

test("generateGeminiResponse includes the full conversation and the event dataset in the prompt for follow-up questions", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  let capturedContents = "";

  try {
    const messages = [
      { role: "user", content: "Which events matter most for industrial costs?" },
      { role: "assistant", content: "Semiconductor supply and power rationing are the biggest near-term risks." },
      { role: "user", content: "Which of those could affect our cost base first?" },
    ] as const;

    const payload = await generateGeminiResponse(messages, () => ({
      models: {
        generateContent: async ({ contents }) => {
          capturedContents = contents;
          return {
            text: JSON.stringify({
              answer: "The earliest cost pressure is likely power rationing, followed by semiconductor supply constraints.",
              evidenceStatus: "supported",
              references: [{ eventId: "evt_004", sourceName: "Regional Grid Operators Update" }],
            }),
          };
        },
      },
    }));

    assert.equal(payload.evidenceStatus, "supported");
    assert.match(capturedContents, /Which events matter most for industrial costs\?/i);
    assert.match(capturedContents, /Semiconductor supply and power rationing are the biggest near-term risks\./i);
    assert.match(capturedContents, /Which of those could affect our cost base first\?/i);
    assert.match(capturedContents, /evt_004/i);
    assert.match(capturedContents, /Regional Grid Operators Update/i);
  } finally {
    if (previous) {
      process.env.GEMINI_API_KEY = previous;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  }
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
