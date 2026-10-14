import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";

import { createApp } from "./index.js";

test("POST /api/chat accepts a valid request and returns a fake model response", async () => {
  const app = createApp({
    generateChatResponse: async (messages) => {
      const content = messages.at(-1)?.content ?? "";
      return {
        answer: `Mock model response: ${content}`,
        evidenceStatus: "not_evaluated",
        references: [],
        scopeStatus: "in_scope",
      };
    },
  });
  const server = app.listen(0);

  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "assistant", content: "I can help with that." },
          { role: "user", content: "Which events matter most?" },
        ],
      }),
    });

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      answer: string;
      evidenceStatus: string;
      references: unknown[];
    };

    assert.match(payload.answer, /Which events matter most\?/i);
    assert.equal(payload.evidenceStatus, "not_evaluated");
    assert.deepEqual(payload.references, []);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("POST /api/chat rejects malformed message payloads", async () => {
  const app = createApp({
    generateChatResponse: async () => ({
      answer: "should not be used",
      evidenceStatus: "not_evaluated",
      references: [],
      scopeStatus: "in_scope",
    }),
  });
  const server = app.listen(0);

  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user" }] }),
    });

    assert.equal(response.status, 400);

    const payload = (await response.json()) as { error: string };
    assert.match(payload.error, /content/i);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("POST /api/chat rejects an empty latest user message", async () => {
  const app = createApp({
    generateChatResponse: async () => ({
      answer: "should not be used",
      evidenceStatus: "not_evaluated",
      references: [],
      scopeStatus: "in_scope",
    }),
  });
  const server = app.listen(0);

  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: "   " },
          { role: "assistant", content: "Hello" },
        ],
      }),
    });

    assert.equal(response.status, 400);

    const payload = (await response.json()) as { error: string };
    assert.match(payload.error, /empty/i);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("POST /api/chat returns a provider error without a success schema", async () => {
  const app = createApp({
    generateChatResponse: async () => {
      throw new Error("Gemini request failed: quota exceeded");
    },
  });
  const server = app.listen(0);

  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "What happened?" }] }),
    });

    assert.equal(response.status, 502);

    const payload = (await response.json()) as { error: string; detail: string };
    assert.match(payload.error, /couldn't complete your request/i);
    assert.match(payload.detail, /Gemini request failed/i);
    assert.doesNotMatch(JSON.stringify(payload), /"answer"/i);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("POST /api/chat returns a JSON error for malformed JSON", async () => {
  const app = createApp();
  const server = app.listen(0);

  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    assert.equal(response.status, 400);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/i);
    const payload = (await response.json()) as { error: string };
    assert.match(payload.error, /valid JSON/i);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
