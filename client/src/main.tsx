import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

const suggestionPrompts = [
  "Which events matter most for our cost base?",
  "What risks are highest in Europe?",
  "Which supply-chain events deserve attention?",
];

async function mockSendMessage(content: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 350));

  const lowercase = content.toLowerCase();
  if (lowercase.includes("cost") || lowercase.includes("cost base")) {
    return "The highest near-term cost pressure is likely power rationing and semiconductor supply constraints. Those issues are tied to evt_004 and evt_006, which describe industrial power curbs and export controls on semiconductor chemicals.";
  }

  if (lowercase.includes("europe")) {
    return "In Europe, the strongest signals are industrial power restrictions during the heatwave and broader trade or logistics pressure, especially where energy costs and supply reliability are exposed.";
  }

  if (lowercase.includes("supply")) {
    return "The most relevant supply-chain signals are the semiconductor export controls and the critical-mineral agreements, which together suggest tighter inputs and more strategic procurement planning.";
  }

  return "The event set suggests a few near-term watch items: power rationing, semiconductor supply controls, and geopolitically sensitive shipping risk. I’d start by checking which of those are most relevant to your operating footprint.";
}

function App() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setIsSending(true);

    try {
      const answer = await mockSendMessage(trimmed);
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: answer,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch {
      const assistantMessage: ChatMessage = {
        id: `assistant-error-${Date.now()}`,
        role: "assistant",
        content: "I couldn’t answer that request right now. Please try again.",
      };
      setMessages((current) => [...current, assistantMessage]);
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
