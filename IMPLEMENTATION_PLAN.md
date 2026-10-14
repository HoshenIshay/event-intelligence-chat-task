# Event Intelligence Chat — Execution Plan

Work through these ten independently verifiable tasks in order. Mark each checkbox complete after its acceptance checks pass.

## 1. Set up the minimal client/server workspace

- [x] Create a `client/` React + TypeScript + Vite app and a `server/` Node.js + TypeScript + Express app, with minimal package manifests and development scripts.
- Keep application code in only `client/` and `server/`; put the README and `.gitignore` at the root.
- **Verify:** both apps start locally, the client loads, and no Gemini secret is included in the client build.

## 2. Prepare and validate the supplied data

- [x] Convert the supplied workbooks into one `server/data/context.json` fixture, preserving event IDs, dates, titles, summaries, regions, domains, source names, and source URLs, along with the company profile.
- Treat workbook rows as the source of event facts; do not fetch the placeholder URLs.
- **Verify:** a repeatable check confirms 30 events, unique IDs, required fields, and the expected company profile.

## 3. Define the chat API contract

- [x] Add `POST /api/chat` accepting chronological `{ role, content }` messages and returning a documented shape such as `{ answer, evidenceStatus, references }`.
- Validate requests and return explicit errors for malformed input. Use a fake model response in route tests.
- **Verify:** tests cover a valid request, invalid message shape, and an empty latest user message without calling Gemini.

## 4. Connect the server to Gemini

- [x] Use the Gemini Node SDK from the server only. Read the API key from a server-side environment variable and provide an example environment file with no secret.
- Handle missing configuration and provider/API errors without returning a success-shaped answer.
- **Verify:** a mocked provider test confirms request and error handling; a manual smoke test with a real key confirms the server can make a Gemini request.

## 5. Build the grounding prompt and response validator

- [x] Instruct Gemini to use supplied events for event facts, treat the company profile as relevance context rather than evidence, distinguish event facts from Asteron-specific analysis, and say when evidence is insufficient.
- [x] Require structured output with an answer, evidence status, and event IDs. Validate the JSON and reject empty answers or IDs absent from the supplied dataset. Allow an insufficient-evidence answer with no event references.
- **Verify:** unit tests cover valid output, malformed or empty output, unknown IDs, and insufficient evidence.

## 6. Preserve multi-turn context

- [x] On each request, provide the conversation so far alongside the company profile and all 30 events.
- [x] Keep the server stateless; do not add accounts, stored sessions, or a chat database.
- **Verify:** a repeatable test checks that a follow-up such as “Which of those could affect our cost base first?” is sent with the earlier question and answer.

## 7. Build the minimalist chat interface

- [x] Implement a responsive single-conversation view with readable message bubbles, a composer, send control, and clear empty state.
- [x] Keep the visual design restrained and modern; omit sidebars, account controls, and features not requested in the brief.
- **Verify:** the UI renders at desktop and mobile widths, and the composer submits a message through a mock send handler.

## 8. Connect the UI to the chat API

- [x] Replace the mock handler with the server call. Show a loading state while awaiting Gemini, display provider or parsing errors clearly, and render validated event references (at least event ID and source name) with the answer.
- **Verify:** a mock API test covers a successful answer with citations and an error response; failed requests do not appear as successful assistant answers.

## 9. Add focused tests and Gemini evaluations

- [x] Keep routine tests repeatable without credentials by mocking Gemini. Add an opt-in evaluation command using a real Gemini key, checking response shape and allowed references rather than exact wording.
- Include cases for company-relevant risks, comparing semiconductor and power events (`evt_006`, `evt_004`), AI/automation opportunities, a follow-up question, and unsupported interest-rate predictions.
- **Verify:** the mocked suite runs without a key; the live evaluation reports whether each response meets the checks when configured with one.

## 10. Document and verify the finished local workflow

- [x] Write the root README with setup and run instructions, Gemini configuration, architecture, context-selection rationale, grounding and uncertainty behavior, test/evaluation commands, one-day trade-offs, and how the approach would change for 100,000+ events or a continuous stream.
- Keep deployment, ingestion, authentication, and vector search out of scope.
- **Verify:** follow the README from a clean local setup and run the documented test commands.
