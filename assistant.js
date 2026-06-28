/* =========================================================================
   SOIL CRC BCA tool - AI Analysis Assistant (frontend)
   -------------------------------------------------------------------------
   Talks ONLY to the Cloudflare Worker, which holds the Gemini API key as a
   secret and calls the model server side. No API key is ever in this file.
   The assistant is domain-grounded (system prompt + knowledge base in the
   Worker) and reads the live tool state with every request via
   window.getBcaToolState(). It does not invent numbers and does not learn
   from user questions.
   ========================================================================= */
(function () {
  'use strict';

  /* IMPORTANT: after deploying the Worker, confirm this URL matches your
     workers.dev subdomain (shown by "npx wrangler deploy"). */
  const CHATBOT_WORKER_URL = 'https://soil-bca-chat.drgenie.workers.dev/api/bca-chat';

  const SESSION_LIMIT = 40;

  const DEBUG = {
    workerUrl: CHATBOT_WORKER_URL,
    toolStatePopulated: null,
    lastStatus: null,
    lastErrorCode: null,
    lastDurationMs: null,
    backendHealthy: null
  };
  if (typeof window !== 'undefined') window.BCA_ASSISTANT_DEBUG = DEBUG;
  function debugEnabled() {
    try {
      if (typeof window === 'undefined') return false;
      if (/[?&]debug=1\b/.test(window.location.search || '')) return true;
      return window.localStorage && window.localStorage.getItem('bca_debug') === '1';
    } catch (e) { return false; }
  }
  function dlog() { if (debugEnabled()) { try { console.log.apply(console, ['[BCA Assistant]'].concat([].slice.call(arguments))); } catch (e) {} } }

  function configured() { return /^https?:\/\//.test(CHATBOT_WORKER_URL) && !/YOUR-/i.test(CHATBOT_WORKER_URL); }
  function toolState() { try { return (typeof window.getBcaToolState === 'function') ? window.getBcaToolState() : null; } catch (e) { return null; } }

  /* ---- quick prompts (same pathway as free text) --------------------- */
  const QUICK_PROMPTS = {
    explain_result: 'Explain the current analysis result in plain language. Cover the top treatment by NPV, its BCR, gross profit margin and ROI, how it compares with the control, and one practical takeaway.',
    explain_farmer: 'Explain the current result for a farmer or adviser in plain language. Focus on net return per hectare, value for money, and risk. Avoid jargon.',
    draft_report: 'Draft a concise report narrative paragraph from the current result. Mention the best treatments by NPV, the control comparison, the grain price and discount settings used, and the main caveats.',
    best_value: 'Which treatment offers the best value for money under the current settings? Use NPV, BCR and ROI from the tool state, and explain the trade-offs between yield and cost.',
    compare_control: 'Compare the ranked treatments with the control treatment using delta NPV and BCR. Identify which treatments clearly beat the control and by how much per hectare.',
    explain_metrics: 'Explain what NPV, BCR, gross profit margin and ROI mean in this tool, and how discounting affects them. Keep it short and practical.',
    list_assumptions: 'List the key assumptions and limitations behind the current result in short bullets.',
    sensitivity_checks: 'Suggest sensitivity checks for this result: varying grain price, discount rate, benefit level and cost level, and explain what would make the ranking or the sign of NPV change.',
    rank_summary: 'Summarise the treatment ranking from the tool state in a short, ordered list with NPV and BCR for each, highest NPV first.',
    one_paragraph: 'Write a single tight summary paragraph of the current result suitable for an executive summary, including one caveat.',
    stakeholder_questions: 'Generate a concise list of questions that farmers, funders and agronomists are likely to ask about this result.',
    improve_profit: 'Based only on the current tool state, explain which cost components or yield differences are driving the ranking, and where profitability could most plausibly be improved.'
  };
  const QUICK_LABELS = {
    explain_result: 'Explain current result',
    explain_farmer: 'Explain for a farmer',
    draft_report: 'Draft report narrative',
    best_value: 'Best value for money',
    compare_control: 'Compare with control',
    explain_metrics: 'Explain NPV, BCR, ROI',
    list_assumptions: 'Assumptions and limitations',
    sensitivity_checks: 'Suggest sensitivity checks',
    rank_summary: 'Summarise the ranking',
    one_paragraph: 'One-paragraph summary',
    stakeholder_questions: 'Stakeholder questions',
    improve_profit: 'What drives profitability?'
  };
  // Quick actions that interpret the live result; if no analysis has been run we answer locally.
  const RESULT_ACTIONS = new Set([
    'explain_result','explain_farmer','draft_report','best_value','compare_control',
    'rank_summary','one_paragraph','stakeholder_questions','improve_profit'
  ]);
  const NEEDS_ANALYSIS_MSG = 'Please upload data and run the BCA first so I can interpret the current results. Open the Data tab to load a workbook or the sample data, set the grain price in Settings, then click Run Benefit-Cost Analysis in the Results tab.';
  const NEEDS_NEWDATA_MSG = 'New data have been loaded. Please run the BCA again so I can interpret the updated results. I will not quote the earlier numbers.';
  const NEEDS_SETTINGS_MSG = 'The analysis settings have changed. Please run the BCA again so I can interpret the updated results. I will not quote the earlier numbers.';

  /* ---- error messages ------------------------------------------------ */
  const ERROR_MESSAGES = {
    RATE_LIMITED: 'The AI service has reached a temporary request limit. Please wait about 30 to 60 seconds and try again. The BCA calculations are still available.',
    QUOTA_EXCEEDED: 'The AI service quota has been exceeded for now. Please try again later, or check billing and quota. The BCA calculations are still available.',
    INVALID_API_KEY: 'The AI backend is configured, but the model key is missing or invalid. Please check the Worker secret.',
    GEMINI_KEY_MISSING: 'The AI backend is configured, but the model key is missing. Please set the Worker secret.',
    MODEL_NOT_AVAILABLE: 'The selected AI model is not available for this API key or region. Please switch model or check billing and access.',
    QUESTION_TOO_LONG: 'Your question is longer than the current model context can safely handle. Please shorten it or split it into two questions.',
    TOOL_STATE_TOO_LARGE: 'The current analysis is too large to send. Please reduce the number of treatments and try again.',
    EMPTY_RESPONSE: 'The model returned no text. Please try a shorter or more specific question.',
    TIMEOUT: 'The AI service took too long to respond. Please try again with a more focused question.',
    AI_PROVIDER_ERROR: 'The AI service is having trouble right now. Please try again shortly. The BCA calculations are still available.',
    GEMINI_API_ERROR: 'The AI service returned an error. Please try again, or rephrase your question.',
    GEMINI_BLOCKED: 'The request was blocked by the AI safety filter. Please rephrase your question.',
    CORS_ORIGIN_NOT_ALLOWED: 'This site is not allowed to use the assistant backend. The allowed origins may need updating.',
    BACKEND_UNREACHABLE: 'The Assistant backend could not be reached. Please check the Worker URL or your network connection.',
    CANCELLED: 'Generation stopped.'
  };
  function friendly(code, fallback) { return (code && ERROR_MESSAGES[code]) ? ERROR_MESSAGES[code] : (fallback || 'The AI request did not complete.'); }

  let _abort = null;

  async function ask(question, actionType, controller) {
    const ts = toolState();
    DEBUG.toolStatePopulated = !!(ts && ts.hasResults);
    const ctrl = controller || new AbortController();
    const timer = setTimeout(() => ctrl.abort('timeout'), 45000);
    const started = Date.now();
    let resp;
    try {
      resp = await fetch(CHATBOT_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question, actionType: actionType || 'free_text', toolState: ts || {} }),
        signal: ctrl.signal
      });
    } catch (e) {
      clearTimeout(timer);
      DEBUG.lastDurationMs = Date.now() - started;
      if (e && e.name === 'AbortError') {
        const cancelled = ctrl.__cancelledByUser;
        const err = new Error(friendly(cancelled ? 'CANCELLED' : 'TIMEOUT'));
        err.code = cancelled ? 'CANCELLED' : 'TIMEOUT';
        throw err;
      }
      const err = new Error(friendly('BACKEND_UNREACHABLE')); err.code = 'BACKEND_UNREACHABLE'; throw err;
    }
    clearTimeout(timer);
    DEBUG.lastDurationMs = Date.now() - started;
    DEBUG.lastStatus = resp.status;
    let data = {};
    try { data = await resp.json(); }
    catch (e) { const err = new Error('The assistant returned an unreadable response (HTTP ' + resp.status + ').'); err.code = 'AI_PROVIDER_ERROR'; throw err; }
    if (!resp.ok || data.ok === false) {
      const code = data.code || 'UNKNOWN_ERROR';
      DEBUG.lastErrorCode = code;
      let msg = friendly(code, data.message || data.error);
      if (data.message && /Details:/.test(data.message)) msg = msg + ' ' + data.message.substring(data.message.indexOf('Details:'));
      const err = new Error(msg); err.code = code; throw err;
    }
    DEBUG.lastErrorCode = null;
    if (!data.answer || !String(data.answer).trim()) { const err = new Error(friendly('EMPTY_RESPONSE')); err.code = 'EMPTY_RESPONSE'; throw err; }
    dlog('answer ok', { durationMs: DEBUG.lastDurationMs, model: data.model });
    return String(data.answer).trim();
  }

  /* ---- offline fallback from live numbers ---------------------------- */
  function money(v) { return v == null ? 'not available' : '$' + Math.round(v).toLocaleString(); }
  function localSummary() {
    const ts = toolState();
    if (!ts) return 'Apply settings and run the analysis first, then I can summarise the result.';
    if (!ts.hasResults) return 'No results yet. Upload a workbook or load the sample data, set the grain price in Settings, then run the analysis.';
    const top = ts.ranking && ts.ranking[0];
    const lines = [];
    if (top) {
      lines.push('Top treatment by NPV: ' + (top.treatmentName || top.treatmentId) + '.');
      lines.push('NPV ' + money(top.npv_per_ha) + '/ha, BCR ' + (top.bcr ?? 'n/a') + ', ROI ' + (top.roiPct ?? 'n/a') + '%, gross profit margin ' + (top.grossProfitMarginPct ?? 'n/a') + '%.');
      if (top.deltaNpvVsControl_per_ha != null) lines.push('Difference vs control: ' + money(top.deltaNpvVsControl_per_ha) + '/ha.');
    }
    if (ts.settings) lines.push('Settings: grain price ' + money(ts.settings.grainPrice_per_t) + '/t, ' + ts.settings.analysisYears + ' years, ' + ts.settings.discountMode + ' discounting.');
    lines.push('(Offline summary from the current tool values. The AI service was not reachable.)');
    return lines.join('\n');
  }

  /* ===================================================================
     UI
     =================================================================== */
  const $ = (id) => document.getElementById(id);
  const st = { open: false, greeted: false, busy: false, userMessages: 0, lastAnswer: '' };
  const OPENING = 'I can interpret your benefit-cost results, explain NPV, BCR, gross profit margin and ROI, compare treatments with the control, draft report text, and suggest sensitivity checks. I use your live tool state and do not invent numbers. Please do not enter personal or confidential information.';

  function els() {
    return {
      fab: $('bca-fab'), panel: $('bca-panel'), scrim: $('bca-scrim'),
      close: $('bca-close'), min: $('bca-min'), messages: $('bca-messages'),
      form: $('bca-form'), input: $('bca-input'), send: $('bca-send'), stop: $('bca-stop'),
      clear: $('bca-clear'), download: $('bca-download'), count: $('bca-count'),
      quick: $('bca-quick'), toast: $('bca-toast'),
      badgeBackend: $('bca-badge-backend'), badgeCurrent: $('bca-badge-current'), badgeSaved: $('bca-badge-saved')
    };
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function inlineMd(s) { return s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/`([^`]+)`/g, '<code>$1</code>'); }
  function formatAnswer(text) {
    const lines = String(text).split('\n'); let html = ''; let inUl = false, inOl = false;
    const closeLists = () => { if (inUl) { html += '</ul>'; inUl = false; } if (inOl) { html += '</ol>'; inOl = false; } };
    for (let raw of lines) {
      const line = raw.trim();
      if (!line) { closeLists(); continue; }
      if (/^[-*]\s+/.test(line)) { if (!inUl) { closeLists(); html += '<ul>'; inUl = true; } html += '<li>' + inlineMd(escapeHtml(line.replace(/^[-*]\s+/, ''))) + '</li>'; continue; }
      if (/^\d+[.)]\s+/.test(line)) { if (!inOl) { closeLists(); html += '<ol>'; inOl = true; } html += '<li>' + inlineMd(escapeHtml(line.replace(/^\d+[.)]\s+/, ''))) + '</li>'; continue; }
      closeLists(); html += '<p>' + inlineMd(escapeHtml(line)) + '</p>';
    }
    closeLists(); return html;
  }

  function addMessage(role, text, opts) {
    const e = els();
    const wrap = document.createElement('div');
    wrap.className = 'bca-msg bca-msg-' + role;
    wrap.dataset.role = role; wrap.dataset.raw = text;
    const bubble = document.createElement('div'); bubble.className = 'bca-bubble';
    bubble.innerHTML = role === 'assistant' ? formatAnswer(text) : escapeHtml(text).replace(/\n/g, '<br>');
    wrap.appendChild(bubble);
    if (role === 'assistant' && (!opts || !opts.noActions)) {
      const actions = document.createElement('div'); actions.className = 'bca-msg-actions';
      const copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.className = 'bca-mini'; copyBtn.textContent = 'Copy answer';
      copyBtn.addEventListener('click', () => copyText(text, copyBtn));
      const repBtn = document.createElement('button'); repBtn.type = 'button'; repBtn.className = 'bca-mini'; repBtn.textContent = 'Add to report';
      repBtn.addEventListener('click', () => addToReport(text, repBtn));
      actions.appendChild(copyBtn); actions.appendChild(repBtn); wrap.appendChild(actions);
    }
    e.messages.appendChild(wrap); e.messages.scrollTop = e.messages.scrollHeight; return wrap;
  }

  let _toastTimer = null;
  function panelToast(msg, kind) {
    const t = els().toast; if (!t) return;
    t.textContent = msg; t.hidden = false; t.dataset.kind = kind || 'ok';
    clearTimeout(_toastTimer); _toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function markDone(btn, label) { if (!btn) return; const o = btn.textContent; btn.textContent = label; btn.disabled = true; setTimeout(() => { btn.textContent = o; btn.disabled = false; }, 1400); }
  function copyText(text, btn) {
    const done = () => { panelToast('Answer copied.'); markDone(btn, 'Copied'); };
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done)); }
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    try { const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.left = '-9999px'; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); }
    catch (e) { panelToast('Could not copy.', 'warn'); }
  }
  function addToReport(text, btn) {
    const ta = document.getElementById('reportNarrative');
    if (!ta) { panelToast('The report narrative box is not available.', 'warn'); return; }
    const block = '----- AI-generated text (review before use) -----\n' + text + '\n----- end AI-generated text -----';
    ta.value = (ta.value ? ta.value.trim() + '\n\n' : '') + block;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    panelToast('Added to the report narrative (marked AI-generated).');
    markDone(btn, 'Added');
  }

  function showTyping() { const e = els(); const w = document.createElement('div'); w.className = 'bca-msg bca-msg-assistant bca-typing'; w.id = 'bca-typing'; w.innerHTML = '<div class="bca-bubble"><span class="bca-dot"></span><span class="bca-dot"></span><span class="bca-dot"></span></div>'; e.messages.appendChild(w); e.messages.scrollTop = e.messages.scrollHeight; }
  function hideTyping() { const t = $('bca-typing'); if (t) t.remove(); }
  function updateCount() {
    const e = els(); if (!e.count) return;
    e.count.textContent = st.userMessages + ' of ' + SESSION_LIMIT + ' messages this session';
    if (st.userMessages >= SESSION_LIMIT) { e.input.disabled = true; e.send.disabled = true; e.input.placeholder = 'Session limit reached. Clear chat to start again.'; }
  }
  function setBusy(b) {
    st.busy = b; const e = els();
    e.send.disabled = b || st.userMessages >= SESSION_LIMIT; e.send.hidden = !!b;
    if (e.stop) e.stop.hidden = !b;
    // Disable every quick prompt, including those inside the "More prompts" panel.
    e.panel.querySelectorAll('[data-action]').forEach((btn) => { btn.disabled = b; });
  }
  function setBadge(el, state, text) { if (!el) return; el.dataset.state = state; const t = el.querySelector('.bca-badge-text'); if (t && text) t.textContent = text; }
  function updateBadges() {
    const e = els(); const ts = toolState();
    const dataLoaded = !!(ts && ts.dataLoaded);
    const analysisRun = !!(ts && ts.analysisRun);
    const valid = !!(ts && ts.analysisValid);
    const n = ts ? (ts.treatmentsRanked || 0) : 0;
    if (valid) {
      setBadge(e.badgeCurrent, 'on', 'Analysis: Current');
      setBadge(e.badgeSaved, 'on', 'Treatments: ' + n + ' ranked');
    } else if (analysisRun) {
      // analysis was run but data or settings changed since
      setBadge(e.badgeCurrent, 'warn', 'Analysis: Out of date');
      setBadge(e.badgeSaved, 'warn', 'Action required: Run analysis again');
    } else {
      setBadge(e.badgeCurrent, 'off', 'Analysis: Not run');
      setBadge(e.badgeSaved, 'off', dataLoaded ? 'Data: Loaded, not analysed' : 'Data: No treatments ranked');
    }
  }
  async function checkHealth() {
    const e = els();
    if (!configured()) { setBadge(e.badgeBackend, 'off', 'Backend: Not set'); return; }
    setBadge(e.badgeBackend, 'checking', 'Backend: Checking');
    try {
      const healthUrl = CHATBOT_WORKER_URL.replace(/\/api\/.*$/, '/api/health');
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 8000);
      const r = await fetch(healthUrl, { method: 'GET', signal: c.signal }); clearTimeout(t);
      const d = await r.json().catch(() => ({}));
      DEBUG.backendHealthy = !!(r.ok && d && d.ok);
      setBadge(e.badgeBackend, (r.ok && d && d.ok) ? 'on' : 'warn', (r.ok && d && d.ok) ? 'Backend: Connected' : 'Backend: Issue');
      dlog('health', d);
    } catch (e2) { DEBUG.backendHealthy = false; setBadge(e.badgeBackend, 'warn', 'Backend: Unreachable'); }
  }

  function setOpen(open) {
    const e = els(); if (!e.panel) return; st.open = open;
    e.panel.classList.toggle('is-open', open); if (e.scrim) e.scrim.classList.toggle('is-open', open);
    e.fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    e.panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) e.panel.removeAttribute('inert'); else e.panel.setAttribute('inert', '');
    document.body.classList.toggle('bca-assistant-open', open);
  }
  function openPanel() {
    const e = els(); if (!e.panel) return; setOpen(true);
    if (!st.greeted) { addMessage('assistant', OPENING, { noActions: true }); st.greeted = true; updateCount(); }
    updateBadges(); checkHealth();
    setTimeout(() => { try { e.input.focus(); } catch (x) {} }, 60);
  }
  function closePanel() { const e = els(); if (!e.panel) return; setOpen(false); try { e.fab.focus(); } catch (x) {} }
  function clearChat() {
    const e = els(); e.messages.innerHTML = ''; st.userMessages = 0; st.greeted = false;
    e.input.disabled = false; e.send.disabled = false; e.input.placeholder = 'Ask a detailed question about your results, the metrics, or sensitivity';
    addMessage('assistant', OPENING, { noActions: true }); st.greeted = true; updateCount(); updateBadges();
  }
  function downloadTranscript() {
    const e = els(); const msgs = [].slice.call(e.messages.querySelectorAll('.bca-msg'));
    if (!msgs.length) { panelToast('Nothing to download yet.', 'warn'); return; }
    const lines = ['SOIL CRC BCA Analysis Assistant transcript', new Date().toISOString(), '', 'Note: AI-generated text. Review before use.', ''];
    msgs.forEach((m) => { const who = m.dataset.role === 'user' ? 'You' : 'Assistant'; const text = (m.dataset.raw != null) ? String(m.dataset.raw).trim() : ''; if (text) lines.push(who + ': ' + text, ''); });
    try {
      const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = 'bca-assistant-transcript.txt'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); panelToast('Transcript downloaded.');
    } catch (x) { panelToast('Could not download the transcript.', 'warn'); }
  }

  async function send(question, actionType, displayText) {
    if (st.busy) return;
    if (st.userMessages >= SESSION_LIMIT) { updateCount(); return; }
    addMessage('user', displayText || question); st.userMessages += 1; updateCount(); updateBadges();
    // If this is a result-interpretation request but no analysis has been run, answer locally.
    if (RESULT_ACTIONS.has(actionType)) {
      const ts = toolState();
      if (!ts || !ts.hasResults) {
        let m;
        if (!ts || !ts.dataLoaded) m = NEEDS_ANALYSIS_MSG;            // nothing loaded
        else if (ts.staleReason === 'settings') m = NEEDS_SETTINGS_MSG; // settings changed after a run
        else if (ts.analysisRun) m = NEEDS_SETTINGS_MSG;               // ran, now stale (settings)
        else m = NEEDS_NEWDATA_MSG;                                    // data loaded / replaced, not run
        addMessage('assistant', m, { noActions: true });
        return;
      }
    }
    setBusy(true); showTyping();
    if (!configured()) {
      hideTyping();
      addMessage('assistant', 'The assistant is not connected yet. After the Cloudflare Worker is deployed, set its URL in assistant.js (CHATBOT_WORKER_URL).\n\n' + localSummary());
      setBusy(false); return;
    }
    const controller = new AbortController(); _abort = controller;
    try {
      const answer = await ask(question, actionType || 'free_text', controller);
      hideTyping(); st.lastAnswer = answer; addMessage('assistant', answer);
    } catch (err) {
      hideTyping();
      const code = err && err.code ? err.code : 'UNKNOWN_ERROR';
      const msg = (err && err.message) ? err.message : 'The AI request did not complete.';
      if (code === 'CANCELLED') addMessage('assistant', 'Generation stopped. You can ask again or refine your question.', { noActions: true });
      else addMessage('assistant', msg + '\n\n' + localSummary());
      dlog('error', { code: code, message: msg });
    } finally { _abort = null; setBusy(false); }
  }
  function stopGenerating() { if (_abort) { try { _abort.__cancelledByUser = true; _abort.abort('cancelled'); } catch (e) {} } }

  function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 220) + 'px'; }

  let _inited = false;
  function init() {
    if (_inited) return; const e = els(); if (!e.fab || !e.panel) return; _inited = true;
    e.fab.addEventListener('click', () => (st.open ? closePanel() : openPanel()));
    if (e.close) e.close.addEventListener('click', closePanel);
    if (e.min) e.min.addEventListener('click', closePanel);
    if (e.scrim) e.scrim.addEventListener('click', closePanel);
    e.clear.addEventListener('click', clearChat);
    if (e.download) e.download.addEventListener('click', downloadTranscript);
    if (e.stop) e.stop.addEventListener('click', stopGenerating);
    e.form.addEventListener('submit', (ev) => {
      ev.preventDefault(); if (st.busy) return;
      const q = e.input.value.trim(); if (!q) return;
      e.input.value = ''; autoGrow(e.input); send(q, 'free_text');
    });
    e.input.addEventListener('input', () => autoGrow(e.input));
    e.input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); e.form.requestSubmit ? e.form.requestSubmit() : e.form.dispatchEvent(new Event('submit', { cancelable: true })); } });
    e.panel.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action]'); if (!btn || st.busy) return;
      const action = btn.dataset.action; const prompt = QUICK_PROMPTS[action]; if (!prompt) return;
      // If the chip lives in the "More prompts" disclosure, collapse it afterwards.
      const moreEl = $('bca-more');
      if (moreEl && moreEl.contains(btn)) moreEl.open = false;
      send(prompt, action, QUICK_LABELS[action] || btn.textContent.trim());
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && st.open) closePanel(); });
    updateBadges();
    dlog('initialised', { workerUrl: DEBUG.workerUrl, configured: configured() });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
