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
          scopeStatus: "in_scope",
          evidenceStatus: "supported",
          references: [{ eventId: "evt_006", sourceName: "International Trade Controls Review" }],
        }),
      }),
    },
  }));

  assert.match(payload.answer, /semiconductor/i);
  assert.equal(payload.evidenceStatus, "supported");
  assert.deepEqual(payload.references, [{
    eventId: "evt_006",
    eventDate: "2026-09-26",
    title: "Export licensing introduced for two advanced semiconductor chemicals",
    summary: "A major producing country introduced new export licensing requirements for two specialty chemicals used in advanced chip manufacturing, prompting manufacturers to review inventories and alternative suppliers.",
    region: "Asia / Global",
    domain: "Trade / Technology",
    sourceName: "International Trade Controls Review",
    sourceUrl: "https://example.com/events/evt_006",
  }]);
});

test("generateGeminiResponse degrades malformed or empty model output to insufficient evidence", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  try {
    const malformedPayload = await generateGeminiResponse([{ role: "user", content: "What happened?" }], () => ({
        models: {
          generateContent: async () => ({ text: "not-json" }),
        },
      }));

    assert.equal(malformedPayload.evidenceStatus, "insufficient");
    assert.equal(malformedPayload.references.length, 0);
    assert.match(malformedPayload.answer, /couldn't verify a reliable supporting source/i);

    const emptyAnswerPayload = await generateGeminiResponse([{ role: "user", content: "What happened?" }], () => ({
        models: {
          generateContent: async () => ({ text: JSON.stringify({ answer: "", scopeStatus: "in_scope", evidenceStatus: "supported", references: [] }) }),
        },
      }));
    assert.equal(emptyAnswerPayload.evidenceStatus, "insufficient");
    assert.equal(emptyAnswerPayload.references.length, 0);
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
            scopeStatus: "in_scope",
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

test("generateGeminiResponse returns the exact refusal for out-of-scope questions", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  let capturedContents = "";

  try {
    const payload = await generateGeminiResponse([{ role: "user", content: "Give me a recipe for pancakes." }], () => ({
      models: {
        generateContent: async ({ contents }) => {
          capturedContents = contents;
          return {
            text: JSON.stringify({
              answer: "Here's a pancake recipe.",
              scopeStatus: "out_of_scope",
              evidenceStatus: "supported",
              references: [],
            }),
          };
        },
      },
    }));

    assert.equal(payload.answer, "I am not authorized to answer questions beyond my defined topics.");
    assert.equal(payload.scopeStatus, "out_of_scope");
    assert.equal(payload.evidenceStatus, "insufficient");
    assert.deepEqual(payload.references, []);
    assert.match(capturedContents, /PRIMARY RULE — SCOPE/);
    assert.match(capturedContents, /Do not answer or engage in any conversation outside that scope/i);
  } finally {
    if (previous) {
      process.env.GEMINI_API_KEY = previous;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  }
});

test("generateGeminiResponse downgrades unsupported citations to insufficient evidence", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  try {
    const payload = await generateGeminiResponse([{ role: "user", content: "Which events matter most?" }], () => ({
        models: {
          generateContent: async () => ({
            text: JSON.stringify({
              answer: "This is based on an event.",
              scopeStatus: "in_scope",
              evidenceStatus: "supported",
              references: [{ eventId: "evt_999", sourceName: "Fake Source" }],
            }),
          }),
        },
      }));
    assert.equal(payload.evidenceStatus, "insufficient");
    assert.deepEqual(payload.references, []);
    assert.match(payload.answer, /couldn't verify a reliable supporting source/i);
  } finally {
    if (previous) {
      process.env.GEMINI_API_KEY = previous;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  }
});

test("generateGeminiResponse returns insufficient evidence when the provider response is empty", async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";

  try {
    const payload = await generateGeminiResponse([{ role: "user", content: "What happened?" }], () => ({
      models: {
        generateContent: async () => ({ text: "  " }),
      },
    }));
    assert.equal(payload.evidenceStatus, "insufficient");
    assert.deepEqual(payload.references, []);
    assert.match(payload.answer, /couldn't verify a reliable supporting source/i);
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
    const messages: ChatMessage[] = [
      { role: "user", content: "Which events matter most for industrial costs?" },
      { role: "assistant", content: "Semiconductor supply and power rationing are the biggest near-term risks." },
      { role: "user", content: "Which of those could affect our cost base first?" },
    ];

    const payload = await generateGeminiResponse(messages, () => ({
      models: {
        generateContent: async ({ contents }) => {
          capturedContents = contents;
          return {
            text: JSON.stringify({
              answer: "The earliest cost pressure is likely power rationing, followed by semiconductor supply constraints.",
              scopeStatus: "in_scope",
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
