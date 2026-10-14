# Remaining Tasks

This tracker records the outstanding items from the original Event Intelligence Chat exercise review.

## 1. Send conversation history from the client

- [x] Update the client to send the full chronological conversation (previous user and assistant turns plus the new question) to `POST /api/chat`.
- [x] Add a client/API test proving that a follow-up request includes the earlier turns.
- [x] Verify a follow-up answer can use context from the prior exchange.

**Current status:** Complete for the local application flow. The client sends prior non-error user and assistant turns with each follow-up. A client test asserts the outgoing HTTP request history, and a server test verifies that a supplied transcript reaches the grounding prompt. A live Gemini follow-up remains part of Task 2's provider verification.

## 2. Complete live Gemini verification

- [ ] Resolve the Google Gemini API project's billing or quota issue. The last live request returned `402 Payment Required`.
- [ ] Run the live evaluation from `server` with the configured key: `npm run eval:live`.
- [ ] Record that the live smoke test and evaluation pass.

**Current status:** Blocked by the Gemini project's billing/quota response; mocked tests pass.

## 3. Document the exact model choice

- [ ] Update `README.md` to name the configured model, `gemini-2.5-flash`.
- [ ] Briefly document the key prompt decisions: supplied events as the source of factual claims, company profile as relevance context, and explicit insufficient-evidence responses.

**Current status:** Incomplete. The README discusses Gemini and grounding but does not identify the model by name.

## 4. Verify fixture parity with source workbooks

- [ ] Compare all 30 event records and the company profile in `server/data/context.json` against the supplied workbooks.
- [ ] Extend or add a repeatable validation check that detects mismatched or omitted source values.

**Current status:** Partially verified. The existing validator confirms event count, unique IDs, required fields, and company name, but does not compare every fixture value to the workbook source.
