import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Event Intelligence Chat UI", () => {
  it("renders a successful answer with citations and clears the loading state", async () => {
    let resolveResponse: (value: {
      answer: string;
      scopeStatus: "in_scope" | "out_of_scope";
      evidenceStatus: "not_evaluated" | "supported" | "insufficient";
      references: Array<{
        eventId: string;
        eventDate: string;
        title: string;
        summary: string;
        region: string;
        domain: string;
        sourceName: string;
        sourceUrl: string;
      }>;
    }) => void;

    const sendMessage = vi.fn(
      () =>
        new Promise<{
          answer: string;
          scopeStatus: "in_scope" | "out_of_scope";
          evidenceStatus: "not_evaluated" | "supported" | "insufficient";
          references: Array<{
            eventId: string;
            eventDate: string;
            title: string;
            summary: string;
            region: string;
            domain: string;
            sourceName: string;
            sourceUrl: string;
          }>;
        }>((resolve) => {
          resolveResponse = resolve;
        })
    );

    render(<App sendMessage={sendMessage} />);

    const user = userEvent.setup();
    const input = screen.getByLabelText(/message input/i);

    await user.type(input, "Which events matter most?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(sendMessage).toHaveBeenCalledWith("Which events matter most?");
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();

    resolveResponse!({
      answer: "The biggest near-term risk is semiconductor supply disruption.",
      scopeStatus: "in_scope",
      evidenceStatus: "supported",
      references: [
        {
          eventId: "evt_006",
          eventDate: "2026-09-26",
          title: "Export licensing introduced for two advanced semiconductor chemicals",
          summary: "A major producing country introduced new export licensing requirements for two specialty chemicals used in advanced chip manufacturing, prompting manufacturers to review inventories and alternative suppliers.",
          region: "Asia / Global",
          domain: "Trade / Technology",
          sourceName: "International Trade Controls Review",
          sourceUrl: "https://example.com/events/evt_006",
        },
        {
          eventId: "evt_004",
          eventDate: "2026-09-27",
          title: "Three countries introduce temporary industrial power rationing during heatwave",
          summary: "Record temperatures pushed electricity demand to new highs while reducing generation efficiency, leading authorities to impose temporary power restrictions on some industrial users.",
          region: "Southern Europe",
          domain: "Climate / Energy",
          sourceName: "Regional Grid Operators Update",
          sourceUrl: "https://example.com/events/evt_004",
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText(/The biggest near-term risk is semiconductor supply disruption\./i)).toBeInTheDocument();
    });

    const sourceList = screen.getByRole("list", { name: /sources for this answer/i });
    expect(sourceList).toHaveClass("source-tags");
    expect(sourceList.children).toHaveLength(2);
    const firstTag = screen.getByRole("button", { name: /Source evt_006: International Trade Controls Review/i });
    expect(firstTag).toHaveAttribute("aria-controls", expect.stringMatching(/^source-details-/));
    const sourceDetails = screen.getByRole("group", { name: /Details for Export licensing introduced/i });
    expect(sourceDetails).toHaveTextContent("2026-09-26");
    expect(sourceDetails).toHaveTextContent("Asia / Global");
    expect(sourceDetails).toHaveTextContent("Trade / Technology");
    expect(sourceDetails).toHaveTextContent("International Trade Controls Review");
    expect(sourceDetails).toHaveTextContent("A major producing country introduced new export licensing requirements");
    expect(screen.getByRole("link", { name: "https://example.com/events/evt_006" }))
      .toHaveAttribute("href", "https://example.com/events/evt_006");
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  it("handles a failed API response without showing a successful assistant answer", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      error: "Gemini request failed: quota exceeded",
    });

    render(<App sendMessage={sendMessage} />);

    const user = userEvent.setup();
    const input = screen.getByLabelText(/message input/i);

    await user.type(input, "Will interest rates fall?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/Gemini request failed: quota exceeded/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Will interest rates fall\?/i)).toBeInTheDocument();
    expect(screen.queryByText(/The biggest near-term risk is semiconductor supply disruption\./i)).not.toBeInTheDocument();
  });

  it("does not show an answer as supported when its references are missing", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      answer: "An unverified answer.",
      evidenceStatus: "supported",
      references: [],
    });

    render(<App sendMessage={sendMessage} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/message input/i), "What happened?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/couldn't verify a reliable supporting source/i)).toBeInTheDocument();
    });
    expect(screen.queryByText("An unverified answer.")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /sources for this answer/i })).not.toBeInTheDocument();
  });

  it("replaces off-topic model content with the exact scope refusal", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      answer: "Here's a pancake recipe.",
      scopeStatus: "out_of_scope",
      evidenceStatus: "supported",
      references: [],
    });

    render(<App sendMessage={sendMessage} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/message input/i), "Give me a recipe for pancakes.");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("I am not authorized to answer questions beyond my defined topics.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Here's a pancake recipe.")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /sources for this answer/i })).not.toBeInTheDocument();
  });

  it("shows a useful message instead of treating an empty successful response as an answer", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      answer: "   ",
      evidenceStatus: "supported",
      references: [],
    });

    render(<App sendMessage={sendMessage} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/message input/i), "What happened?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/couldn't verify a reliable supporting source/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/No answer returned/i)).not.toBeInTheDocument();
  });

  it("shows a useful error when the server returns an empty HTTP error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("", { status: 500 }),
    ));

    render(<App />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/message input/i), "What happened?");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/empty error response \(HTTP 500\)/i)).toBeInTheDocument();
    });

  });
});
