# Event Intelligence Chat

A small React + Express application that answers event-risk questions using a fixed event dataset as the only source of truth. The server builds a grounded prompt, validates the model output, and only accepts references that match the supplied facts.

## Requirements

- Node.js 20.19 or newer
- npm
- A valid Google Gemini API key for the live model path

## 1. Install dependencies

From the repository root:

```powershell
cd server
npm install

cd ..\client
npm install
```

## 2. Configure the Gemini API key securely

The key must live in the server runtime environment, not in the client bundle and not in source control.

This project does not automatically load a `.env` file with a Node helper. The server reads the value from `process.env.GEMINI_API_KEY` at startup, so in local development the safest pattern is to set it in the same PowerShell session that launches the server:

```powershell
cd server
$env:GEMINI_API_KEY="paste-your-real-gemini-key-here"
$env:PORT="3001"
npm run dev
```

Keep the actual key out of the repo. The file `server/.env.example` is only a template and should never contain a real secret. If you prefer a local file, keep it outside the project root or exclude it from Git using `.gitignore`.

## 3. Start both applications

Open a second terminal for the client:

```powershell
cd client
npm run dev
```

Open the local URL printed by Vite (for example `http://localhost:5173`). The client proxies `/api` requests to the Express server running on `http://localhost:3001`.

## 4. Health check and smoke test

The server exposes a startup check:

```powershell
curl http://localhost:3001/api/health
```

Expected response:

```json
{ "status": "ok" }
```

## Architecture overview

- `server/data/context.json` is the source of truth for all event facts and the company profile.
- `server/src/index.ts` validates incoming chat payloads, builds the grounding prompt, calls Gemini, and validates structured JSON before returning a response.
- `client/src/App.tsx` renders the chat UI and calls the server API.
- The client never receives or stores the Gemini key.

## Why this grounding approach

The event dataset is treated as the canonical fact source. The company profile informs relevance but is not treated as evidence. That keeps the system grounded in the supplied event list and prevents unsupported claims from being inferred from prior domain knowledge. If the event set does not support the question, the app explicitly returns an insufficient-evidence response rather than guessing.

## Validation and evaluation

Run the server tests:

```powershell
cd server
npm test
```

Run the client build/tests:

```powershell
cd client
npm run build
npm test
```

Run the live Gemini evaluation only when `GEMINI_API_KEY` is set:

```powershell
cd server
npm run eval:live
```

The live evaluation checks response shape and grounded references for company-relevant risk questions, semiconductor-vs-power comparisons, automation opportunities, follow-up questions, and unsupported interest-rate questions.

## One-day trade-offs

This project intentionally keeps the solution narrow and deterministic:

- single-server, stateless design
- fixed JSON fixture instead of ingestion pipelines or database sync
- no auth, deployment scaffolding, or vector search
- no persistent chat memory beyond the current request payload

This is a good fit for a small event intelligence demo, but a production system at 100,000+ events would likely add a retrieval layer, indexing, and a cleaner event-ranking workflow before prompting the model.

## Scaling beyond this exercise

For a much larger event set or a continuous event stream, the main architectural shift would be to replace the static fixture with a retrieval/indexing layer that selects the most relevant events before generating a response. The model would still need grounded citations and a strict validator, but the retrieval stage would become the primary optimization point rather than placing the full event list in every prompt.

## Scope boundaries

This exercise deliberately excludes deployment, ingestion, authentication, and vector search. The ask is to demonstrate grounded event reasoning with a controlled dataset and a clear validation path.
