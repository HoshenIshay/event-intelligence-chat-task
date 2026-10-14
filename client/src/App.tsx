import React, { useState } from "react";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  references?: Reference[];
  isError?: boolean;
};

type Reference = {
  eventId: string;
  eventDate: string;
  title: string;
  summary: string;
  region: string;
  domain: string;
  sourceName: string;
  sourceUrl: string;
};

type ChatResponse = {
  answer?: string;
  scopeStatus?: "in_scope" | "out_of_scope";
  evidenceStatus?: "not_evaluated" | "supported" | "insufficient";
  references?: Reference[];
  error?: string;
};

type AppProps = {
  sendMessage?: (content: string) => Promise<ChatResponse>;
};

const suggestionPrompts = [
  "What are the three developments most relevant to Asteron Systems right now?",
  "Which events matter most for our cost base?",
  "What risks are highest in Europe?",
  "Which supply-chain events deserve attention?",
];

async function defaultSendMessage(content: string): Promise<ChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content }],
    }),
  });

  const responseBody = await response.text();
  let payload: ChatResponse = {};

  if (responseBody.trim()) {
    try {
      payload = JSON.parse(responseBody) as ChatResponse;
    } catch {
      if (!response.ok) {
        throw new Error(
          `Request failed with HTTP ${response.status}; the server returned a non-JSON response.`,
        );
      }

      throw new Error(`The server returned invalid JSON (HTTP ${response.status}).`);
    }
  }

  if (!responseBody.trim()) {
    if (!response.ok) {
      throw new Error(
        `The server returned an empty error response (HTTP ${response.status}). Check that the chat API is running and try again.`,
      );
    }
    throw new Error(`The chat server returned an empty response (HTTP ${response.status}). Please try again.`);
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `The chat server couldn't complete your request (HTTP ${response.status}). Please try again.`);
  }

  return payload;
}

const insufficientEvidenceAnswer =
  "I couldn't verify a reliable supporting source for this answer in the event dataset. Try rephrasing your question or asking about a specific event.";
const offTopicRefusal = "I am not authorized to answer questions beyond my defined topics.";

function isUsableReference(reference: unknown): reference is Reference {
  if (reference === null || typeof reference !== "object") {
    return false;
  }

  const fields: Array<keyof Reference> = [
    "eventId",
    "eventDate",
    "title",
    "summary",
    "region",
    "domain",
    "sourceName",
    "sourceUrl",
  ];
  const candidate = reference as Record<string, unknown>;
  return fields.every((field) => typeof candidate[field] === "string" && candidate[field].trim().length > 0);
}

function App({ sendMessage = defaultSendMessage }: AppProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isSending) {
      return;
    }

    const userMessageId = `user-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setIsSending(true);

    try {
      const response = await sendMessage(trimmed);

      if (response.error) {
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: response.error,
          isError: true,
        };

        setMessages((current) => [...current, errorMessage]);
        return;
      }

      const references = Array.isArray(response.references)
        ? response.references.filter(isUsableReference)
        : [];
      const answer = typeof response.answer === "string" ? response.answer.trim() : "";
      const lacksUsableEvidence = response.evidenceStatus === "supported" && references.length === 0;
      const isOutOfScope = response.scopeStatus === "out_of_scope";
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: isOutOfScope
          ? offTopicRefusal
          : answer && !lacksUsableEvidence ? answer : insufficientEvidenceAnswer,
        references: isOutOfScope || lacksUsableEvidence || !answer ? [] : references,
      };

      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      const failureMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: message === "Failed to fetch"
          ? "Unable to reach the chat server. Check that it is running, then try again."
          : message,
        isError: true,
      };

      setMessages((current) => [...current, failureMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSuggestionClick = (value: string) => {
    setDraft(value);
  };

  return (
    <main className="app-shell">
      <div className="chat-window">
        <header className="chat-header">
          <h1>Event Intelligence Chat</h1>
          <span className="chat-status">
            <span className="chat-status-dot" aria-hidden="true" />
            Live context
          </span>
        </header>

        <div className="message-list">
          {messages.length === 0 ? (
            <div className="empty-state">
              <h2>Ask about the event picture</h2>
              <p>Use the supplied event context to surface relevant risks, opportunities, and near-term pressure points.</p>
              <div className="suggestion-grid">
                {suggestionPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="suggestion-chip"
                    onClick={() => handleSuggestionClick(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`message-row ${message.role}`}>
                <div className={`message-group ${message.role}`}>
                  <div className={`message ${message.role}${message.isError ? " error" : ""}`}>
                    {message.content}
                  </div>
                  {message.references && message.references.length > 0 && (
                    <div className="source-tags" role="list" aria-label="Sources for this answer">
                      {message.references.map((reference) => {
                        const detailsId = `source-details-${message.id}-${reference.eventId}`;

                        return (
                          <div className="source-tag-container" key={`${message.id}-${reference.eventId}`} role="listitem">
                            <button
                              type="button"
                              className="source-tag"
                              aria-label={`Source ${reference.eventId}: ${reference.sourceName}`}
                              aria-controls={detailsId}
                              aria-describedby={detailsId}
                            >
                              <span className="source-tag-dot" aria-hidden="true" />
                              <span className="source-tag-id">{reference.eventId}</span>
                            </button>
                            <div className="source-popover" id={detailsId} role="group" aria-label={`Details for ${reference.title}`}>
                              <span className="source-popover-eyebrow">SOURCE EVENT</span>
                              <strong className="source-popover-title">{reference.title}</strong>
                              <p className="source-popover-summary">{reference.summary}</p>
                              <dl className="source-popover-fields">
                                <div><dt>Event ID</dt><dd>{reference.eventId}</dd></div>
                                <div><dt>Date</dt><dd>{reference.eventDate}</dd></div>
                                <div><dt>Region</dt><dd>{reference.region}</dd></div>
                                <div><dt>Domain</dt><dd>{reference.domain}</dd></div>
                                <div><dt>Source</dt><dd>{reference.sourceName}</dd></div>
                                <div className="source-popover-url">
                                  <dt>Source URL</dt>
                                  <dd>
                                    <a href={reference.sourceUrl} target="_blank" rel="noreferrer">
                                      {reference.sourceUrl}
                                    </a>
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {isSending && (
            <div className="message-row assistant">
              <div className="message assistant loading">
                <span className="spinner" aria-hidden="true" />
                Thinking…
              </div>
            </div>
          )}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <div className="composer-inner">
            <textarea
              aria-label="Message input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about the event picture…"
              rows={1}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit(event as unknown as React.FormEvent);
                }
              }}
            />
            <button type="submit" className="send-button" disabled={!draft.trim() || isSending}>
              Send
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

export default App;
