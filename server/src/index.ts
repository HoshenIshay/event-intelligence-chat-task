import express, { type Request, type Response } from "express";
import { pathToFileURL } from "node:url";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequestBody = {
  messages: ChatMessage[];
};

export type ChatResponseBody = {
  answer: string;
  evidenceStatus: "not_evaluated" | "supported" | "insufficient";
  references: Array<{ eventId: string; sourceName: string }>;
};

function ensureObject(value: unknown): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be a JSON object.");
  }
}

export function validateChatRequest(body: unknown): ChatMessage[] {
  ensureObject(body);

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Messages must be a non-empty array.");
  }

  const validatedMessages: ChatMessage[] = messages.map((message, index) => {
    if (message === null || typeof message !== "object" || Array.isArray(message)) {
      throw new Error(`Message at index ${index} must be an object.`);
    }

    const candidate = message as Record<string, unknown>;
    const role = candidate.role;
    const content = candidate.content;

    if (role !== "user" && role !== "assistant" && role !== "system") {
      throw new Error(`Message at index ${index} has an invalid role.`);
    }

    if (typeof content !== "string") {
      throw new Error(`Message at index ${index} content must be a string.`);
    }

    return { role, content };
  });

  const latestUserMessage = [...validatedMessages]
    .reverse()
    .find((message) => message.role === "user");

  if (!latestUserMessage || latestUserMessage.content.trim().length === 0) {
    throw new Error("Latest user message cannot be empty.");
  }

  return validatedMessages;
}

export function generateFakeModelResponse(messages: ChatMessage[]): ChatResponseBody {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  const content = latestUserMessage?.content?.trim() ?? "";
  const answer = `Mock model response: ${content}`;

  return {
    answer,
    evidenceStatus: "not_evaluated",
    references: [],
  };
}

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request: Request, response: Response) => {
    response.json({ status: "ok" });
  });

  app.post("/api/chat", (request: Request, response: Response) => {
    try {
      const messages = validateChatRequest(request.body);
      const payload = generateFakeModelResponse(messages);
      response.status(200).json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Malformed chat request.";
      response.status(400).json({ error: message });
    }
  });

  return app;
}

const app = createApp();
const port = Number(process.env.PORT ?? 3001);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(port, () => {
    console.log(`Event Intelligence Chat API listening on http://localhost:${port}`);
  });
}

export default app;
