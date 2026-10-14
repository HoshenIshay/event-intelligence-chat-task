import express, { type Request, type Response } from "express";
import { GoogleGenAI } from "@google/genai";
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

export type ChatAppOptions = {
  generateChatResponse?: (messages: ChatMessage[]) => Promise<ChatResponseBody>;
};

export type GeminiClientLike = {
  models: {
    generateContent: (input: { model: string; contents: string }) => Promise<{ text?: string }>;
  };
};

export function buildGeminiClient(apiKey: string): GeminiClientLike {
  return new GoogleGenAI({ apiKey }) as unknown as GeminiClientLike;
}

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

export async function generateGeminiResponse(
  messages: ChatMessage[],
  clientFactory: (apiKey: string) => GeminiClientLike = buildGeminiClient,
): Promise<ChatResponseBody> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  try {
    const ai = clientFactory(apiKey);
    const prompt = messages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n");

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const answer = typeof result.text === "string" && result.text.trim().length > 0
      ? result.text.trim()
      : "Gemini returned an empty response.";

    return {
      answer,
      evidenceStatus: "not_evaluated",
      references: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Gemini provider error.";
    throw new Error(`Gemini request failed: ${message}`);
  }
}

export function createApp(options: ChatAppOptions = {}) {
  const app = express();
  const generateChatResponse = options.generateChatResponse ?? generateGeminiResponse;

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request: Request, response: Response) => {
    response.json({ status: "ok" });
  });

  app.post("/api/chat", async (request: Request, response: Response) => {
    try {
      const messages = validateChatRequest(request.body);
      const payload = await generateChatResponse(messages);
      response.status(200).json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Malformed chat request.";
      const status = message.includes("Gemini") || message.includes("configured") ? 500 : 400;
      response.status(status).json({ error: message });
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
