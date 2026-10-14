import React, { useState } from "react";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type Reference = {
  eventId: string;
  sourceName: string;
};

type ChatResponse = {
  answer?: string;
  evidenceStatus?: "not_evaluated" | "supported" | "insufficient";
  references?: Reference[];
  error?: string;
};

type AppProps = {
  sendMessage?: (content: string) => Promise<ChatResponse>;
};

const suggestionPrompts = [
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
    throw new Error(`The server returned an empty response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with HTTP ${response.status}.`);
  }

  return payload;
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
        };

        setMessages((current) => [...current, errorMessage]);
        return;
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.answer ?? "No answer returned.",
      };

      const references = response.references ?? [];
      const referenceMessages: ChatMessage[] = references.map((reference) => ({
        id: `ref-${reference.eventId}-${Date.now()}`,
        role: "assistant",
        content: `${reference.eventId} — ${reference.sourceName}`,
      }));

      setMessages((current) => [...current, assistantMessage, ...referenceMessages]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed.";
      const failureMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: message,
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
                <div className={`message ${message.role}`}>
                  {message.content}
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
