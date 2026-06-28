SOIL CRC BCA Tool — Backend (AI Assistant) Setup, Step by Step
==============================================================

The website (index.html, app.js, styles.css, assistant.js, …) runs entirely in
the browser and works on GitHub Pages with NO backend. The backend is only for
the optional AI Analysis Assistant. It is a small Cloudflare Worker that holds
your Gemini API key as a server secret and calls the model on the browser's
behalf, so the key is never in the website or the repository.

    Browser (GitHub Pages)  ->  Cloudflare Worker  ->  Gemini API

Until the Worker is deployed and connected, every calculation, chart and report
in the tool still works; only the assistant shows "Backend not set".

--------------------------------------------------------------------------------
PART 0 — Repository layout for the Worker
--------------------------------------------------------------------------------
Your wrangler.toml says `main = "src/index.js"`, so the Worker files must sit in
a `worker/` folder like this (the website files stay at the repo root):

    your-repo/
      index.html, app.js, styles.css, assistant.js, …   <- the website (Pages)
      worker/
        wrangler.toml
        package.json
        src/
          index.js                                      <- the uploaded Worker

If your uploaded `index.js` is currently at the repo root, move it to
`worker/src/index.js`. Put `wrangler.toml` and `package.json` in `worker/`.

--------------------------------------------------------------------------------
PART 1 — One-time prerequisites
--------------------------------------------------------------------------------
1. A free Cloudflare account: https://dash.cloudflare.com/sign-up
2. Node.js 18 or newer on your computer: https://nodejs.org  (check: `node -v`)
3. A Gemini API key from Google AI Studio: https://aistudio.google.com/app/apikey
   Copy the key somewhere safe for Step 3 below. Treat it like a password.

--------------------------------------------------------------------------------
PART 2 — Deploy the Worker (run these in a terminal)
--------------------------------------------------------------------------------
Step 1. Open a terminal and go into the worker folder:
        cd worker

Step 2. Install Wrangler (Cloudflare's CLI) and sign in:
        npm install
        npx wrangler login
        (a browser window opens; click Allow to link the CLI to your account.)

Step 3. Store your Gemini key as a SECRET (it is never written to any file):
        npx wrangler secret put GEMINI_API_KEY
        When prompted, paste the key and press Enter.

Step 4. (Optional) Open worker/wrangler.toml and set ALLOWED_ORIGINS to the
        exact origin of your site. For v15 that is just the host, no path:
            ALLOWED_ORIGINS = "https://drgenie.github.io"
        You can list several, comma separated, e.g. to also allow local testing:
            ALLOWED_ORIGINS = "https://drgenie.github.io,http://localhost:8000"
        The model defaults to gemini-2.5-flash; change GEMINI_MODEL only if you
        need a different model.

Step 5. Deploy:
        npx wrangler deploy
        Wrangler prints the live URL, for example:
            https://soil-bca-chat.<your-subdomain>.workers.dev

        Write this URL down — you need it in Part 3.

Step 6. Confirm the Worker is healthy. Open this in a browser (your URL + /api/health):
            https://soil-bca-chat.<your-subdomain>.workers.dev/api/health
        You should see:
            { "ok": true, "modelConfigured": true, "model": "gemini-2.5-flash" }
        If "modelConfigured" is false, the secret in Step 3 did not save — redo it.

--------------------------------------------------------------------------------
PART 3 — Connect the website to the Worker
--------------------------------------------------------------------------------
Step 7. In the repository, open assistant.js and find this line near the top
        (about line 16):
            const CHATBOT_WORKER_URL = 'https://soil-bca-chat.drgenie.workers.dev/api/bca-chat';
        Replace the host with YOUR deployed Worker URL, keeping the /api/bca-chat
        path. If your subdomain really is "drgenie", you can leave it as is.

Step 8. Commit and push so GitHub Pages serves the updated assistant.js:
            git add assistant.js
            git commit -m "Connect assistant to deployed Worker"
            git push
        Wait ~1 minute for GitHub Pages to publish.

--------------------------------------------------------------------------------
PART 4 — Verify end to end
--------------------------------------------------------------------------------
Step 9.  Open the live tool (https://drgenie.github.io/farming-bca-tool-v15/).
Step 10. Click the assistant button (bottom corner). The backend badge should
         read "Backend connected".
Step 11. Load the sample data, go to Results, click Run Benefit-Cost Analysis,
         then ask the assistant "Explain the current result". You should get a
         grounded answer that uses the on-screen numbers.

--------------------------------------------------------------------------------
Troubleshooting
--------------------------------------------------------------------------------
- Badge says "Backend not set": assistant.js still has the placeholder URL, or
  the push has not published yet. Re-check Step 7-8.
- "This site is not allowed to use the assistant" (CORS): your Pages origin is
  not in ALLOWED_ORIGINS. Add it in wrangler.toml (host only, no path) and run
  `npx wrangler deploy` again.
- "model key is missing or invalid": redo Step 3 (`npx wrangler secret put
  GEMINI_API_KEY`) and redeploy.
- "model is not available": your key/region cannot use gemini-2.5-flash. Set a
  different GEMINI_MODEL in wrangler.toml and redeploy.
- Rotating the key later: run Step 3 again with the new key, then `npx wrangler
  deploy`. Never commit the key; .gitignore already excludes .dev.vars/.env.

Endpoints (for reference)
- POST /api/bca-chat   main chat endpoint (expects { question, toolState }).
- GET  /api/health     status only; returns no secrets.

Security notes
- The key lives only as a Cloudflare secret; it is never in the website, the
  repository, or the browser. The Worker also strips the key from any error text
  before returning it, rate-limits per IP (~20/min, best effort), and only
  answers requests from the origins you allow.
