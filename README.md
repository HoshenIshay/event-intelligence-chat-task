# Event Intelligence Chat

A small, standalone chat application for exploring a fixed set of external events in the context of a fictional company, Asteron Systems. The assistant uses event evidence to explain potential risks, opportunities, and strategic relevance; it should distinguish source facts from company-specific analysis and acknowledge when the supplied evidence is insufficient.

This repository contains a React/TypeScript web client and a Node.js/Express/TypeScript API. The API calls Google Gemini, keeps its credential server-side, validates model output, and enriches valid event references with details from the local dataset.

## Contents

- [Architecture](#architecture)
- [Context selection and scale](#context-selection-and-scale)
- [Grounding, scope, and uncertainty](#grounding-scope-and-uncertainty)
- [Prerequisites](#prerequisites)
- [Set up and run locally](#set-up-and-run-locally)
- [API and health check](#api-and-health-check)
- [Tests and evaluation](#tests-and-evaluation)
- [One-day trade-offs](#one-day-trade-offs)


## Architecture

```text
Browser (React + TypeScript + Vite)
    │ POST /api/chat
    ▼
Express API (Node.js + TypeScript)
    ├── validates the request and constructs the grounding prompt
    ├── supplies the company profile and all 30 events
    ├── calls Gemini using the server-side GEMINI_API_KEY
    ├── validates the response and matches citations to local event records
    └── returns an answer, evidence/scope status, and enriched references
```

### Main components

- `client/src/App.tsx` renders the conversation, source tags and detail popovers, input composer, loading state, and request errors.
- `client/src/main.tsx` mounts the React application.
- `client/src/styles.css` contains the responsive chat styling.
- `server/src/index.ts` validates chat requests and model responses, creates the grounding prompt, calls Gemini, and serves the API.
- `server/data/context.json` is the local source of truth for the Asteron Systems profile and 30 supplied event records.
- `server/src/eval.ts` contains opt-in evaluation cases for representative event questions.

The Vite development server proxies `/api` requests to `http://localhost:3001`. The browser never receives the Gemini API key.

## Context selection and scale

The supplied corpus contains only **30 events**, so this implementation passes the full company profile and all event records directly into the model context on each request. At this scale, reading a single, small local fixture is simpler, more transparent, and more reliable than adding retrieval infrastructure: there is no indexing step, no retrieval miss, and no risk that a relevant event is omitted by a separate ranking stage. The model can compare the complete event set against the question and company profile.

If the corpus grew to **100,000+ events**, or became a large continuous event stream, placing all records into each prompt would be inefficient and exceed practical context limits. I would move to a **Retrieval-Augmented Generation (RAG)** architecture backed by a **vector database**:

1. Normalize and chunk event records, preserving event IDs and metadata such as date, region, domain, and source.
2. Generate embeddings and index the event content and metadata in a vector database.
3. Retrieve a bounded set of relevant events for each question, optionally combining vector similarity with keyword and metadata filters.
4. Supply only those retrieved records and the relevant company context to the model.
5. Validate citations against the source-of-truth records before returning the response.

Retrieval quality, citation validation, freshness, and monitoring would then become important parts of the design. A vector database is intentionally not used for the current 30-event fixture.

## Grounding, scope, and uncertainty

- **Event facts:** The supplied `context.json` dataset is the source of truth. Event claims should be grounded in it.
- **Company relevance:** The Asteron Systems profile helps the assistant prioritize and reason about implications; it is context, not independent evidence for event facts.
- **Facts versus analysis:** Recommendations or impact assessments are inferences from the event facts and company profile, not additional facts supplied by the dataset.
- **References:** Model-returned event IDs and source names are checked against the local dataset. Valid references are enriched from the matched record with its date, title, summary, region, domain, source name, and source URL. The UI displays those details in a source popover.
- **Insufficient evidence:** Empty, malformed, or unsupported model output is not presented as a grounded answer. Unusable references are discarded; a supported answer with no valid citations is downgraded to an insufficient-evidence response.
- **Scope:** The configured assistant is intended for questions grounded in the supplied events or their implications for Asteron Systems. The server asks the model to classify scope and enforces the exact configured refusal when the response is classified as out of scope. Since this classification is model-assisted, false positives and false negatives remain possible and should be covered by evaluation.
- **Failures:** Provider/API failures return an explicit JSON error response; empty model output and unusable grounded responses receive a safe insufficient-evidence response. The UI displays errors instead of treating failed requests as successful answers.

## Prerequisites

- Node.js 20.19 or newer
- npm
- A Google Gemini API key with access to the configured model

## Set up and run locally

Run commands from PowerShell. Open two terminals in the repository root.

### 1. Install dependencies

```powershell
cd server
npm install

cd ..\client
npm install
```

### 2. Configure the server

In the first terminal:

```powershell
cd server
Copy-Item .env.example .env
notepad .env
```

Set `GEMINI_API_KEY` to your own key and keep `PORT=3001`:

```dotenv
PORT=3001
GEMINI_API_KEY=your_gemini_api_key_here
```

Save the file, then start the API:

```powershell
npm run dev
```

Keep the key private. Do not commit `server/.env`, place the key in client code, or share it in logs or screenshots. The real `.env` file is ignored by Git; `.env.example` is a placeholder only. Restart the API after changing the key.

### 3. Start the web client

In the second terminal:

```powershell
cd client
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`. Keep both development servers running while using the app.

## API and health check

The API exposes `GET /api/health` for a quick server check. In PowerShell, from any terminal:

```powershell
Invoke-RestMethod http://localhost:3001/api/health
```

Expected result:

```json
{
  "status": "ok"
}
```

The chat endpoint is `POST /api/chat`. It accepts a chronological `messages` array with `role` and `content` fields. For example:

```powershell
$body = @{
  messages = @(
    @{ role = "user"; content = "Which developments could create supply-chain resilience opportunities?" }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri http://localhost:3001/api/chat `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

The API request accepts a chronological `messages` array. The browser sends the prior non-error user and assistant turns together with the new question, allowing the server to resolve follow-ups using the conversation so far. The API response includes `answer`, `evidenceStatus`, `scopeStatus`, and `references`. Conversation history is sent with each request; it is not persisted by the server.

## Tests and evaluation

Run the server unit/API tests (Gemini calls are mocked):

```powershell
cd server
npm test
```

Build/type-check the server:

```powershell
npm run build
```

Run the client tests and production build:

```powershell
cd ..\client
npm test
npm run build
```

The server tests cover valid and malformed API requests, provider failures, empty or malformed model output, insufficient evidence, out-of-scope refusal, citation validation, and construction of a prompt with follow-up history. Client tests cover successful answers and source details, error handling, empty answers, scope refusal, and that a follow-up HTTP request includes previous user and assistant turns.

After configuring a valid API key and resolving any provider billing/quota issue, run the live evaluation:

```powershell
cd ..\server
npm run eval:live
```

The live cases check company-relevant risks, semiconductor-versus-power comparisons, AI/automation opportunities, a follow-up scenario, and an unsupported interest-rate prediction. They validate response properties and citations rather than exact answer wording. The follow-up evaluation exercises the server with a supplied transcript; the client test separately verifies conversation history is sent to the API.

## One-day trade-offs

- Use a static JSON fixture instead of building ingestion, storage, or synchronization pipelines.
- Send all 30 events to the model rather than introducing a retrieval framework for a small corpus.
- Keep the API stateless: no accounts, persisted sessions, database, authentication, or authorization.
- Use a small focused test suite and an opt-in real-provider evaluation.
- Defer deployment/production infrastructure and large-corpus search.

These choices keep the path from user question to grounded answer understandable and proportionate to the exercise. End-to-end multi-turn context is sent to the API and covered by tests. Live-provider verification remains dependent on resolving the Gemini project's billing/quota issue.
