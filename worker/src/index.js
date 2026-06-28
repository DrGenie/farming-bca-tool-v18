/**
 * SOIL CRC Benefit-Cost Analysis tool - Policy/Analysis Assistant backend
 * (Cloudflare Worker).
 * ---------------------------------------------------------------------------
 * Holds the Gemini API key as a Worker SECRET (GEMINI_API_KEY) and calls the
 * Gemini REST API server side. The browser only ever talks to this Worker, so
 * the key is never exposed in frontend code, HTML, CSS, or the GitHub repo.
 *
 *   GitHub Pages frontend  ->  this Worker  ->  Gemini API  ->  answer
 *
 * Endpoints:
 *   POST /api/bca-chat   main chat endpoint
 *   GET  /api/health     lightweight health/diagnostics (no secrets)
 *
 * The assistant is domain-grounded, not fine-tuned: it uses a strong system
 * prompt, an embedded BCA knowledge base, and the live tool state sent with
 * each request. It does not learn from user questions.
 *
 * Secrets / vars (set with wrangler):
 *   GEMINI_API_KEY   (secret, required)
 *   GEMINI_MODEL     (var, optional, default "gemini-2.5-flash")
 *   ALLOWED_ORIGINS  (var, optional, comma separated)
 */

const SERVICE_VERSION = 'v1.0.0';
const DEFAULT_MODEL = 'gemini-2.5-flash';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://drgenie.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5173'
];

const QUESTION_SAFE_CHARS = 8000;
const QUESTION_HARD_CHARS = 12000;
const MAX_TOOLSTATE_CHARS = 24000;
const MAX_ANSWER_CHARS = 12000;

const RATE_MAX = 20;
const RATE_WINDOW_MS = 60000;
const rateMap = new Map();

const GEMINI_TIMEOUT_MS = 40000;

/* ---------------------------------------------------------------------------
   Domain grounding.
   --------------------------------------------------------------------------- */
const SYSTEM_PROMPT = [
  'You are the Analysis Assistant embedded in the SOIL CRC Benefit-Cost Analysis (BCA) tool, used by agricultural researchers, agronomists and farm advisers to evaluate field-trial treatments (for example soil amendments on wheat).',
  '',
  'WHAT THE TOOL DOES. For each treatment it converts crop yield into an annual gross benefit using the grain price, sums direct cost components per hectare from the uploaded workbook, discounts annual benefits and costs over the analysis period, and reports net present value (NPV), benefit-cost ratio (BCR), gross profit margin (GPM), return on investment (ROI), and the difference in NPV relative to the control treatment. Treatments are ranked from highest to lowest NPV.',
  '',
  'KEY FORMULAS.',
  '- PV factor = sum over years t of 1 / product(1 + rate) up to t.',
  '- PV benefits = annual gross benefit * PV factor, where annual gross benefit = average yield (t/ha) * grain price ($/t).',
  '- PV costs = average direct cost ($/ha) * PV factor.',
  '- NPV = PV benefits - PV costs.',
  '- BCR = PV benefits / PV costs (above 1 benefits exceed costs; below 1 costs exceed benefits).',
  '- Gross profit margin (%) = (PV benefits - PV costs) / PV benefits * 100.',
  '- ROI (%) = (PV benefits - PV costs) / PV costs * 100.',
  '- Delta NPV vs control = treatment NPV - control NPV.',
  '',
  'RULES.',
  '- Use ONLY the numbers in the provided tool state. Never invent or assume values. If something is missing or the analysis has not been run, say so and explain what the user needs to do (upload a workbook, set the grain price, run the analysis).',
  '- Do not give financial, investment, legal or agronomic advice. Explain what the numbers mean and the trade-offs; leave decisions to the user.',
  '- Be clear that results are model estimates that depend on the grain price, the discount settings, the analysis period, and the cost and yield data entered. They are not guaranteed outcomes.',
  '- Direct costs are summed from the workbook component fields, not a single pre-filled total.',
  '- Round and present numbers sensibly; quote the units ($/ha, t/ha, %, ratio).',
  '',
  'STYLE. Concise, clear and practical. Plain language by default; show the formula only if asked. Use short paragraphs and small tables or bullets where helpful. When drafting report text or summaries, produce polished, well-structured wording and include a brief note on the main assumptions.'
].join('\n');

const BCA_KNOWLEDGE_BASE = [
  'BCA KNOWLEDGE BASE (use to interpret the tool state; do not override live numbers).',
  '',
  'METRIC INTERPRETATION.',
  '- NPV ($/ha): discounted net return per hectare. Higher is better. The ranking is ordered by NPV.',
  '- BCR (ratio): value returned per dollar of cost in present-value terms. 1.5 means $1.50 of benefit per $1 of cost. Above 1 is economically worthwhile; below 1 is not.',
  '- Gross profit margin (%): share of revenue left after direct costs. Higher means better operating efficiency and more buffer against price or yield falls.',
  '- ROI (%): net gain per dollar invested. ROI of 25% means $1 returns $1.25 in total.',
  '- Delta NPV vs control ($/ha): how much better or worse a treatment is than the control. Positive means it beats the control.',
  '',
  'READING THE RANKING.',
  '- The top row is the strongest treatment by discounted net return under the current settings. A treatment can rank highly through higher yield, lower cost, or both; check avgYield and avgDirectCost to see which.',
  '- If BCR is missing it usually means PV costs are zero or costs were not entered. Say so rather than guessing.',
  '',
  'CONTROL COMPARISON.',
  '- The control is the baseline treatment (often Treatment ID T00 or named Control). Compare other treatments to it using delta NPV and relative BCR. If no control is present, note that the comparison needs a control row.',
  '',
  'SENSITIVITY.',
  '- The sensitivity table varies discount rate, grain price, benefit level and cost level for the selected treatment. Use it to discuss robustness: what happens if prices fall, costs rise, or the measured benefit is smaller than expected. Recommend checking whether the ranking and the sign of NPV hold under plausible changes.',
  '',
  'AUDIENCE WORDING.',
  '- Farmer or adviser: plain language, focus on per-hectare net return, payback and risk.',
  '- Researcher or funder: focus on ranking, effect vs control, assumptions and sensitivity.',
  '- Report narrative: a short, structured summary of the best treatments, the control comparison, the key settings (grain price, discount rate, period), and the main caveats.',
  '',
  'ASSUMPTIONS AND LIMITATIONS.',
  '- Annual benefits and costs are assumed to repeat across the analysis period and are discounted.',
  '- Results depend on the grain price, discount settings and the accuracy of the entered yield and cost data.',
  '- The tool reports financial performance only; it does not capture soil health, environmental or long-term agronomic effects unless reflected in the entered yields and costs.',
  '- This is decision support, not financial or agronomic advice; trial replication and local validation still matter.'
].join('\n');

const SAFETY_NOTE = 'Interpretation support only. Not financial or agronomic advice. Results are model estimates based on the data and settings you entered.';

function allowedOrigins(env) {
  if (env && env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(origin, env) {
  const list = allowedOrigins(env);
  const ok = origin && list.indexOf(origin) !== -1;
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  if (ok) headers['Access-Control-Allow-Origin'] = origin;
  return { headers, ok };
}

function jsonOk(body, headers) {
  return new Response(JSON.stringify(Object.assign({ ok: true }, body)), {
    status: 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {})
  });
}

function jsonErr(code, message, status, headers) {
  return new Response(JSON.stringify({ ok: false, code: code, message: message, error: message }), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {})
  });
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (rateMap.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) { rateMap.set(ip, arr); return true; }
  arr.push(now);
  rateMap.set(ip, arr);
  if (rateMap.size > 5000) { for (const k of rateMap.keys()) { if (k !== ip) { rateMap.delete(k); break; } } }
  return false;
}

function buildGenerationConfig(model) {
  const m = String(model || '').toLowerCase();
  const isV3 = m.indexOf('gemini-3') === 0;
  const cfg = { temperature: 0.3, topP: 0.9, maxOutputTokens: isV3 ? 4096 : 3072 };
  if (!isV3) cfg.thinkingConfig = { thinkingBudget: 0 };
  return cfg;
}

function sanitise(text, apiKey) {
  if (!text) return '';
  let t = String(text);
  if (apiKey) t = t.split(apiKey).join('[redacted]');
  return t;
}

function healthResponse(env, headers) {
  const model = (env && env.GEMINI_MODEL) ? env.GEMINI_MODEL : DEFAULT_MODEL;
  return jsonOk({
    service: 'soil-bca-chat',
    version: SERVICE_VERSION,
    modelConfigured: !!(env && env.GEMINI_API_KEY),
    provider: 'gemini',
    model: model
  }, headers);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    let pathname = '/';
    try { pathname = new URL(request.url).pathname; } catch (e) { pathname = '/'; }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors.headers });
    }

    if (request.method === 'GET' && pathname.indexOf('/health') !== -1) {
      return healthResponse(env, cors.headers);
    }

    if (request.method !== 'POST') {
      return jsonErr('METHOD_NOT_ALLOWED', 'Method not allowed. The chat endpoint expects POST. Visiting it in a browser is expected to fail.', 405, cors.headers);
    }
    if (!cors.ok) {
      return jsonErr('CORS_ORIGIN_NOT_ALLOWED', 'This site origin is not allowed to use the assistant. Add it to ALLOWED_ORIGINS and redeploy.', 403, cors.headers);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) {
      return jsonErr('RATE_LIMITED', 'The AI service has reached a temporary request limit. Please wait about one minute and try again.', 429, cors.headers);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonErr('INVALID_JSON', 'The request body was not valid JSON.', 400, cors.headers);
    }

    let question = (body && typeof body.question === 'string') ? body.question : '';
    if (!question || !question.trim()) {
      return jsonErr('INVALID_JSON', 'A question is required.', 400, cors.headers);
    }

    let trimmedNote = '';
    if (question.length > QUESTION_HARD_CHARS) {
      return jsonErr('QUESTION_TOO_LONG', 'Your question is longer than the current model context can safely handle. Please shorten it or split it into two questions.', 400, cors.headers);
    }
    if (question.length > QUESTION_SAFE_CHARS) {
      const head = question.slice(0, QUESTION_SAFE_CHARS - 1500);
      const tail = question.slice(question.length - 1400);
      question = head + '\n\n[...the middle of this question was shortened to fit...]\n\n' + tail;
      trimmedNote = ' (Your question was long, so the middle was shortened to fit the model context.)';
    }

    const toolState = (body && body.toolState && typeof body.toolState === 'object') ? body.toolState : null;
    let toolStateStr = '';
    try { toolStateStr = JSON.stringify(toolState || {}); } catch (e) { toolStateStr = ''; }
    if (toolStateStr.length > MAX_TOOLSTATE_CHARS) {
      return jsonErr('TOOL_STATE_TOO_LARGE', 'The tool state is too large to send.', 400, cors.headers);
    }

    const apiKey = env && env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonErr('GEMINI_KEY_MISSING', 'The AI backend is configured, but the model key is missing. Set the GEMINI_API_KEY Worker secret.', 500, cors.headers);
    }
    const model = (env && env.GEMINI_MODEL) ? env.GEMINI_MODEL : DEFAULT_MODEL;

    const systemText = SYSTEM_PROMPT + '\n\n' + BCA_KNOWLEDGE_BASE;
    const userContent =
      'Current BCA tool state (live values, use only these):\n' +
      JSON.stringify(toolState || {}, null, 2) +
      '\n\nUser question:\n' + question +
      '\n\nAnswer using the system instructions and knowledge base. Use only the tool state values and do not invent numbers. If the answer would be long, give a complete but concise answer rather than stopping part way.';

    const payload = {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: buildGenerationConfig(model),
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
      ]
    };

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) + ':generateContent';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    let gResp;
    try {
      gResp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timer);
      if (e && e.name === 'AbortError') {
        return jsonErr('TIMEOUT', 'The AI service took too long to respond. Please try again with a more focused question.', 504, cors.headers);
      }
      return jsonErr('AI_PROVIDER_ERROR', 'The AI service could not be reached. Please try again shortly.', 502, cors.headers);
    }
    clearTimeout(timer);

    if (!gResp.ok) {
      let detail = '';
      try {
        const eb = await gResp.json();
        detail = (eb && eb.error && eb.error.message) ? eb.error.message : '';
      } catch (e) {
        try { detail = await gResp.text(); } catch (e2) { detail = ''; }
      }
      detail = sanitise(detail, apiKey);
      const lower = (detail || '').toLowerCase();
      const status = gResp.status;
      let code = 'GEMINI_API_ERROR';
      let msg = 'The AI service returned an error.';
      let outStatus = 502;
      if (status === 429) {
        outStatus = 429;
        if (lower.indexOf('quota') !== -1) { code = 'QUOTA_EXCEEDED'; msg = 'The AI service daily or project quota has been exceeded. Please try again later or check billing and quota.'; }
        else { code = 'RATE_LIMITED'; msg = 'The AI service has reached a temporary request limit. Please wait about one minute and try again.'; }
      } else if (status === 401 || status === 403) {
        code = 'INVALID_API_KEY'; msg = 'The AI backend is configured, but the model key is missing or invalid. Please check the Worker secret.';
      } else if (status === 404) {
        code = 'MODEL_NOT_AVAILABLE'; msg = 'The selected AI model is not available for this API key or region. Please switch model or check billing and access.';
      } else if (status === 400) {
        code = 'GEMINI_API_ERROR'; msg = 'The AI request was rejected as invalid.';
      } else if (status >= 500) {
        code = 'AI_PROVIDER_ERROR'; msg = 'The AI service is temporarily unavailable. Please try again later.';
      }
      if (detail) msg = msg + ' Details: ' + detail;
      return jsonErr(code, msg, outStatus, cors.headers);
    }

    let data;
    try {
      data = await gResp.json();
    } catch (e) {
      return jsonErr('AI_PROVIDER_ERROR', 'The AI service returned an unreadable response.', 502, cors.headers);
    }

    if (data.promptFeedback && data.promptFeedback.blockReason) {
      return jsonErr('GEMINI_BLOCKED', 'The request was blocked by the AI safety filter. Please rephrase your question.', 422, cors.headers);
    }
    const cand = data.candidates && data.candidates[0];
    if (cand && cand.finishReason === 'SAFETY') {
      return jsonErr('GEMINI_BLOCKED', 'The response was blocked by the AI safety filter. Please rephrase your question.', 422, cors.headers);
    }

    let answer = '';
    if (cand && cand.content && Array.isArray(cand.content.parts)) {
      answer = cand.content.parts.map(p => (p && p.text) ? p.text : '').join('').trim();
    }

    if (!answer) {
      const fr = cand && cand.finishReason;
      if (fr === 'MAX_TOKENS') {
        return jsonErr('EMPTY_RESPONSE', 'The model stopped before producing text because the answer was too long. Please ask for a shorter or more specific answer.', 502, cors.headers);
      }
      return jsonErr('EMPTY_RESPONSE', 'The model returned no text. Please try a shorter or more specific question.', 502, cors.headers);
    }

    if (cand && cand.finishReason === 'MAX_TOKENS') {
      answer += '\n\n(Response reached the length limit. Ask me to continue or focus on one part.)';
    }
    if (trimmedNote) answer += '\n\n' + trimmedNote.trim();
    if (answer.length > MAX_ANSWER_CHARS) {
      answer = answer.slice(0, MAX_ANSWER_CHARS) + '\n\n(Response trimmed for length.)';
    }

    return jsonOk({ answer: answer, model: model, safetyNote: SAFETY_NOTE }, cors.headers);
  }
};
