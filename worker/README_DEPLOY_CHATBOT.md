Deploying the SOIL CRC BCA Analysis Assistant (Cloudflare Worker)
=================================================================

The assistant frontend (assistant.js) only ever talks to this Worker. The
Worker holds the Gemini API key as a secret and calls the model server side, so
the key is never in the website, the repository, or the browser.

    Browser (GitHub Pages)  ->  Worker (this folder)  ->  Gemini API

Prerequisites
-------------
- A Cloudflare account (free tier is fine).
- Node.js 18+ locally.
- A Google AI Studio / Gemini API key.

One-time setup
--------------
1. Install Wrangler and sign in:
     npm install
     npx wrangler login

2. Set the Gemini API key as a secret (you are prompted to paste it):
     npx wrangler secret put GEMINI_API_KEY

3. (Optional) Review wrangler.toml:
   - GEMINI_MODEL defaults to gemini-2.5-flash.
   - ALLOWED_ORIGINS must include the GitHub Pages origin that will host the
     tool, for example:
       ALLOWED_ORIGINS = "https://YOURNAME.github.io,http://localhost:8000"
     Use the origin only (scheme + host), not the full path.

Deploy
------
     npx wrangler deploy

Wrangler prints the deployed URL, for example:
     https://soil-bca-chat.YOURSUBDOMAIN.workers.dev

Connect the frontend
--------------------
1. Open assistant.js and set CHATBOT_WORKER_URL to the deployed URL plus the
   chat path:
     const CHATBOT_WORKER_URL = 'https://soil-bca-chat.YOURSUBDOMAIN.workers.dev/api/bca-chat';
   The default in the file assumes the subdomain "drgenie"; replace it with your
   own subdomain if different.
2. Commit and push so GitHub Pages serves the updated assistant.js.

Verify
------
- Health: open https://soil-bca-chat.YOURSUBDOMAIN.workers.dev/api/health
  Expected: { "ok": true, "modelConfigured": true, "model": "gemini-2.5-flash" }
- In the tool, open the assistant; the backend badge should read
  "Backend connected". Ask "Explain the current result".

Endpoints
---------
- POST /api/bca-chat   main chat endpoint (expects { question, toolState }).
- GET  /api/health     status only, returns no secrets.

Notes and limits
----------------
- The per-IP rate limit is in-memory and best-effort (about 20 requests/minute
  per IP per Worker instance); it is a courtesy guard, not a hard quota.
- gemini-2.5-flash is the default model. To change it, set GEMINI_MODEL in
  wrangler.toml and redeploy. If a model is unavailable for your key or region,
  the assistant reports MODEL_NOT_AVAILABLE.
- Rotating the key: run "npx wrangler secret put GEMINI_API_KEY" again with the
  new value and redeploy. Never commit the key; .gitignore already excludes
  .dev.vars and .env files.
- CORS: if the assistant shows "not allowed to use the assistant backend", add
  your exact Pages origin to ALLOWED_ORIGINS and redeploy.
