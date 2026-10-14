import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";

import { createApp } from "./index.js";

test("POST /api/chat accepts a valid request and returns a fake model response", async () => {
  const app = createApp();
  const server = app.listen(0);

  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: "Which events matter most?" },
          { role: "assistant", content: "I can help with that." },
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
  const app = createApp();
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
  const app = createApp();
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
