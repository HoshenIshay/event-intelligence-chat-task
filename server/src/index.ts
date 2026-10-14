import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

const contextPath = new URL("../data/context.json", import.meta.url);
const contextData = JSON.parse(readFileSync(contextPath, "utf8")) as {
  companyProfile?: {
    name?: string;
    companyType?: string;
    business?: string;
    primaryMarkets?: string[];
    primary_markets?: string[];
  };
  company_profile?: {
    name?: string;
    companyType?: string;
    business?: string;
    primaryMarkets?: string[];
    primary_markets?: string[];
  };
  events?: Array<{
    event_id: string;
    event_date: string;
    title: string;
    summary: string;
    region: string;
    domain: string;
    source_name: string;
    source_url: string;
  }>;
};

type ContextEvent = NonNullable<typeof contextData.events>[number];

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
  references: EventReference[];
};

export type EventReference = {
  eventId: string;
  eventDate: string;
  title: string;
  summary: string;
  region: string;
  domain: string;
  sourceName: string;
  sourceUrl: string;
};

export type GroundedResponse = {
  answer: string;
  evidenceStatus: "supported" | "insufficient";
  references: EventReference[];
};

const INSUFFICIENT_EVIDENCE_ANSWER =
  "I couldn't verify a reliable supporting source for this answer in the event dataset. Try rephrasing your question or asking about a specific event.";

function insufficientGroundedResponse(answer = INSUFFICIENT_EVIDENCE_ANSWER): GroundedResponse {
  return {
    answer,
    evidenceStatus: "insufficient",
    references: [],
  };
}

export type ChatAppOptions = {
  generateChatResponse?: (messages: ChatMessage[]) => Promise<ChatResponseBody>;
};

export type GeminiClientLike = {
  models: {
    generateContent: (input: { model: string; contents: string }) => Promise<{ text?: string }>;
  };
};

const contextEvents = contextData.events ?? [];

export function buildGeminiClient(apiKey: string): GeminiClientLike {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 45_000,
      retryOptions: { attempts: 1 },
    },
  }) as unknown as GeminiClientLike;
}

export function buildGroundingPrompt(messages: ChatMessage[]): string {
  const company = contextData.companyProfile ?? contextData.company_profile ?? {};
  const companyName = company.name ?? "Unknown company";
  const companyBusiness = company.business ?? "Unknown business context";
  const companyMarkets = company.primaryMarkets ?? company.primary_markets ?? [];

  const conversation = messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  const allEvents = contextEvents.map((event) => {
    return [
      `- ${event.event_id}:`,
      `  title: ${event.title}`,
      `  date: ${event.event_date}`,
      `  region: ${event.region}`,
      `  domain: ${event.domain}`,
      `  summary: ${event.summary}`,
      `  source_name: ${event.source_name}`,
      `  source_url: ${event.source_url}`,
    ].join("\n");
  }).join("\n");

  return `You are an event-intelligence assistant.
Use the supplied event dataset as the only source of factual event claims.
Treat the company profile as relevance context only; do not treat it as evidence.
Distinguish event facts from Asteron-specific analysis and never claim facts that are not in the event dataset.
If the evidence is insufficient, say so explicitly and set evidenceStatus to "insufficient".

Company profile:
- Name: ${companyName}
- Business: ${companyBusiness}
- Primary markets: ${companyMarkets.join(", ") || "none listed"}

Event dataset:
${allEvents}

Conversation so far:
${conversation}

Return valid JSON only with this exact shape:
{
  "answer": "<non-empty answer string>",
  "evidenceStatus": "supported" | "insufficient",
  "references": [
    { "eventId": "evt_XXX", "sourceName": "<source name>" }
  ]
}

Rules:
- answer must be non-empty.
- When evidenceStatus is "supported", references must include only event IDs from the dataset and match the source names from those events.
- When evidenceStatus is "insufficient", references may be empty and the answer should say the evidence is insufficient.
- Do not invent event IDs or source names.
- Do not use the company profile as evidence for event claims.
- If the question is unsupported by the provided facts, answer plainly and set evidenceStatus to "insufficient".`;
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const withoutCodeFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    : trimmed;

  return JSON.parse(withoutCodeFence);
}

export function validateGroundedResponse(value: unknown): GroundedResponse {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Model response must be a JSON object.");
  }

  const candidate = value as Record<string, unknown>;
  const answer = candidate.answer;
  const evidenceStatus = candidate.evidenceStatus;
  const references = candidate.references;

  if (evidenceStatus !== "supported" && evidenceStatus !== "insufficient") {
    throw new Error("Model response evidenceStatus must be 'supported' or 'insufficient'.");
  }

  if (typeof answer !== "string" || answer.trim().length === 0) {
    return insufficientGroundedResponse();
  }

  if (!Array.isArray(references)) {
    return insufficientGroundedResponse();
  }

  const validReferences: EventReference[] = [];
  for (const reference of references) {
    if (reference === null || typeof reference !== "object" || Array.isArray(reference)) {
      continue;
    }

    const entry = reference as Record<string, unknown>;
    const eventId = entry.eventId;
    const sourceName = entry.sourceName;

    if (typeof eventId !== "string" || typeof sourceName !== "string") {
      continue;
    }

    const matchedEvent: ContextEvent | undefined = contextEvents.find((event) => event.event_id === eventId);
    if (!matchedEvent || matchedEvent.source_name !== sourceName) {
      continue;
    }

    validReferences.push({
      eventId: matchedEvent.event_id,
      eventDate: matchedEvent.event_date,
      title: matchedEvent.title,
      summary: matchedEvent.summary,
      region: matchedEvent.region,
      domain: matchedEvent.domain,
      sourceName: matchedEvent.source_name,
      sourceUrl: matchedEvent.source_url,
    });
  }

  if (evidenceStatus === "supported" && validReferences.length === 0) {
    return insufficientGroundedResponse();
  }

  return {
    answer: answer.trim(),
    evidenceStatus,
    references: validReferences,
  };
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

  let result: { text?: string };
  try {
    const ai = clientFactory(apiKey);
    const prompt = buildGroundingPrompt(messages);
    result = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Gemini provider error.";
    throw new Error(`Gemini request failed: ${message}`);
  }

  const rawText = typeof result.text === "string" ? result.text.trim() : "";
  if (!rawText) {
    return insufficientGroundedResponse();
  }

  try {
    const parsed = parseJsonObject(rawText);
    const validated = validateGroundedResponse(parsed);
    return {
      answer: validated.answer,
      evidenceStatus: validated.evidenceStatus,
      references: validated.references,
    };
  } catch {
    return insufficientGroundedResponse();
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
    let messages: ChatMessage[];
    try {
      messages = validateChatRequest(request.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Malformed chat request.";
      response.status(400).json({ error: message });
      return;
    }

    try {
      const payload = await generateChatResponse(messages);
      response.status(200).json(payload);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown chat service error.";
      console.error("Chat request failed:", detail);
      response.status(502).json({
        error: "The chat service couldn't complete your request. Please try again.",
        detail,
      });
    }
  });

  app.use((error: unknown, _request: Request, response: Response, _next: (error?: unknown) => void) => {
    const parserError = error !== null && typeof error === "object"
      ? error as { status?: number; type?: string }
      : {};
    const status = parserError.status === 413 ? 413 : 400;
    const message = parserError.type === "entity.too.large"
      ? "The request is too large."
      : "The request body must contain valid JSON.";
    response.status(status).json({ error: message });
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
