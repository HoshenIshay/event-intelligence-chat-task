import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import App from "./App";

describe("Event Intelligence Chat UI", () => {
  it("renders a successful answer with citations and clears the loading state", async () => {
    let resolveResponse: (value: any) => void;
    const sendMessage = vi.fn(
      () =>
        new Promise((resolve) => {
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
      evidenceStatus: "supported",
      references: [
        { eventId: "evt_006", sourceName: "International Trade Controls Review" },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText(/The biggest near-term risk is semiconductor supply disruption\./i)).toBeInTheDocument();
    });

    expect(screen.getByText(/evt_006/i)).toBeInTheDocument();
    expect(screen.getByText(/International Trade Controls Review/i)).toBeInTheDocument();
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
});
