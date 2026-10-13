# Event Intelligence Chat

Standalone React and Express application for the Event Intelligence Chat exercise.

## Requirements

- Node.js 20.19 or newer
- npm

## Run locally

In one terminal:

```powershell
cd server
npm install
npm run dev
```

In a second terminal:

```powershell
cd client
npm install
npm run dev
```

Open the local URL printed by Vite. The Vite development server proxies `/api` requests to the Express server on port 3001.

The server exposes `GET /api/health` for a local startup check. Gemini integration and credentials will be added in a later implementation step.
