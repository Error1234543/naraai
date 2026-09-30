/* ============================================================================
   SONIC AI — Vercel serverless proxy  (api.js)

   Browser (index.html)  →  POST /api  →  this function  →  Nara router
   https://router.bynara.id/v1/chat/completions

   This file IS the server-side layer. There is no other backend.

   Environment variables (Vercel → Project → Settings → Environment Variables)
   ---------------------------------------------------------------------------
   AGNES_API_KEY      REQUIRED. The provider key. Never sent to the browser.
                      (NARA_API_KEY is accepted as an alias.)
   ACCESS_CODE        Optional but recommended for a public URL. When set, every
                      request must carry a matching X-Access-Code header (the
                      app has an "Access code" field in Settings).
   ALLOWED_ORIGINS    Optional, comma-separated. Only needed if a page served
                      from a DIFFERENT origin must call this function.
                      Same-origin use (index.html on the same deployment) needs
                      no CORS at all, so by default no CORS headers are sent.
   DEFAULT_MODEL      Optional. Default: agnes-2.5-flash
   DEFAULT_MAX_TOKENS Optional. Default: 8192
   MAX_TOKENS_CAP     Optional. Hard ceiling for max_tokens. Default: 32768
   TIME_BUDGET_MS     Optional. How long one request may run before this function
                      ends it cleanly (so the app can offer "Continue").
                      Default: 50000. Keep it below the function's maxDuration.
   NARA_BASE_URL      Optional. Default: https://router.bynara.id/v1
   ============================================================================ */

'use strict';

const crypto = require('crypto');

/* ---------------------------------------------------------------- config -- */

function intEnv(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const UPSTREAM_BASE = (process.env.NARA_BASE_URL || 'https://router.bynara.id/v1')
  .replace(/\/+$/, '');
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'agnes-2.5-flash';
const DEFAULT_MAX_TOKENS = intEnv('DEFAULT_MAX_TOKENS', 8192);
const MAX_TOKENS_CAP = intEnv('MAX_TOKENS_CAP', 32768);
const TIME_BUDGET_MS = intEnv('TIME_BUDGET_MS', 50000);

const MAX_MESSAGES = 400;
const MAX_BODY_BYTES = 4 * 1024 * 1024;        /* Vercel rejects > 4.5 MB anyway */
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(function (s) { return s.trim().replace(/\/+$/, ''); })
  .filter(Boolean);

function apiKey() {
  return process.env.AGNES_API_KEY || process.env.NARA_API_KEY || '';
}

/* -------------------------------------------------------- system prompt --- */
/* Kept on the server so every request gets the same instructions and the
   browser payload stays small. Edit here to change the assistant's behaviour. */

const SYSTEM_PROMPT = [
  'You are SONIC AI, a personal coding and research assistant: a senior software engineer, debugger, project architect and file generator. Work first: when asked to build, write the code; when asked to fix, fix it; when asked for a project, create every file. Do not answer with only an explanation of how something could be built.',
  '',
  'CODE RULES',
  '- Deliver complete, working, production-quality code. Never use pseudocode, "code omitted for brevity", "rest is the same", placeholders, fake functions or invented APIs/endpoints.',
  '- Keep all imports, handlers, styles and closing tags. Never cut a file short because it is long.',
  '- When modifying existing code, keep working features intact, keep existing names and architecture, and return the COMPLETE updated file (only for the files that changed).',
  '- Make reasonable engineering assumptions when a request is ambiguous, state them in one line, and continue.',
  '- Consider security, error handling, performance, mobile/Android compatibility and browser compatibility, but do not over-engineer simple requests.',
  '- Never put private API keys in frontend code. Use a server-side proxy and environment variables.',
  '',
  'FILE FORMAT (the app detects files from this exact layout)',
  '- Put the filename on its own line immediately before the code block, exactly like:  FILE: path/name.ext',
  '- Then one fenced code block with the correct language tag containing the complete file. One file per block. Keep the filename and path stable across the conversation.',
  '- For a project, first show a short file tree, then every file in its own FILE: block, then setup steps.',
  '- Short snippets, shell commands and examples that are not files do not need a FILE: line.',
  '',
  'LONG OUTPUT',
  '- If a task is large, keep going. The app continues automatically when output is cut off: when you are asked to continue, output ONLY the remaining text, starting at the exact character where you stopped. Do not repeat earlier text, do not reopen a code fence you are already inside, do not restart the file and add no commentary.',
  '- Do not put [PART x/N] markers inside code. If you deliberately split a large project across replies, finish whole files in each reply and end with one line: NEXT: <remaining files>.',
  '',
  'DEBUGGING',
  '- Identify the actual cause first, state it briefly, name the file to change, give the exact fix as corrected code, and do not rewrite unrelated code.',
  '',
  'RESEARCH AND HONESTY',
  '- Prefer official documentation. Separate facts from assumptions. Never claim to have verified something you did not, and never fabricate documentation, package APIs or options.',
  '- Never claim unlimited output. Long work is handled by streaming, continuation and splitting into files.',
  '',
  'STYLE',
  '- No filler ("Sure!", "Absolutely!", "Hope this helps!"). For coding tasks use a short explanation plus the implementation. Keep prose brief; spend the output on the work.'
].join('\n');

/* --------------------------------------------------------------- helpers -- */

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function fail(res, status, message, code) {
  sendJson(res, status, { error: { message: message, code: code || 'error', status: status } });
}

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0].trim().toLowerCase();
}

/* Browsers send an Origin header on cross-origin requests and on all POSTs.
   Same host → same origin → fine. Anything else must be listed in
   ALLOWED_ORIGINS. (Non-browser clients send no Origin at all; ACCESS_CODE is
   what protects against those.) */
function classifyOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) { return { ok: true, cors: false }; }
  let host = '';
  try { host = new URL(origin).host.toLowerCase(); } catch (e) { return { ok: false, cors: false }; }
  if (host === requestHost(req)) { return { ok: true, cors: false }; }
  const clean = origin.replace(/\/+$/, '');
  if (ALLOWED_ORIGINS.indexOf(clean) !== -1) { return { ok: true, cors: true, origin: clean }; }
  return { ok: false, cors: false };
}

function applyCors(res, info) {
  if (!info.cors) { return; }
  res.setHeader('Access-Control-Allow-Origin', info.origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Access-Code');
  res.setHeader('Access-Control-Max-Age', '600');
}

function accessCodeOk(req) {
  const expected = process.env.ACCESS_CODE;
  if (!expected) { return true; }
  const given = String(req.headers['x-access-code'] || '');
  /* hash both sides so the comparison is constant-time and length-safe */
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) { return JSON.parse(req.body.toString('utf8')); }
    if (typeof req.body === 'string') { return JSON.parse(req.body); }
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) { const e = new Error('too large'); e.code = 'TOO_LARGE'; throw e; }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function num(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) { return fallback; }
  return Math.min(max, Math.max(min, n));
}

/* Only the fields we understand are forwarded. Client-sent system messages are
   dropped so the server prompt above stays authoritative. */
function buildUpstreamBody(input) {
  const messages = input.messages
    .filter(function (m) {
      return m && (m.role === 'user' || m.role === 'assistant') &&
             (typeof m.content === 'string' || Array.isArray(m.content));
    })
    .map(function (m) { return { role: m.role, content: m.content }; });

  return {
    model: typeof input.model === 'string' && input.model.trim()
      ? input.model.trim().slice(0, 120) : DEFAULT_MODEL,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }].concat(messages),
    temperature: num(input.temperature, 0, 2, 0.7),
    max_tokens: Math.round(num(input.max_tokens, 1, MAX_TOKENS_CAP, DEFAULT_MAX_TOKENS)),
    stream: input.stream === true
  };
}

async function upstreamErrorMessage(response) {
  let text = '';
  try { text = await response.text(); } catch (e) { text = ''; }
  let message = '';
  try {
    const parsed = JSON.parse(text);
    message = (parsed && parsed.error && (parsed.error.message || parsed.error.type)) ||
              (parsed && parsed.message) || '';
    if (typeof message !== 'string') { message = JSON.stringify(message); }
  } catch (e) {
    message = text.slice(0, 400);
  }
  return message || ('HTTP ' + response.status);
}

/* --------------------------------------------------------------- handler -- */

module.exports = async function handler(req, res) {
  const origin = classifyOrigin(req);
  if (!origin.ok) { return fail(res, 403, 'Origin not allowed.', 'origin_denied'); }
  applyCors(res, origin);

  if (req.method === 'OPTIONS') {
    res.statusCode = origin.cors ? 204 : 403;
    return res.end();
  }

  /* Health / configuration check — reveals no secrets. */
  if (req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      service: 'sonic-ai-proxy',
      keyConfigured: Boolean(apiKey()),
      accessCodeRequired: Boolean(process.env.ACCESS_CODE),
      model: DEFAULT_MODEL,
      defaultMaxTokens: DEFAULT_MAX_TOKENS,
      maxTokensCap: MAX_TOKENS_CAP,
      timeBudgetMs: TIME_BUDGET_MS
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return fail(res, 405, 'Method not allowed.', 'method_not_allowed');
  }

  if (!accessCodeOk(req)) {
    return fail(res, 401,
      'Access code missing or incorrect. Set it in Settings → Access code.', 'access_denied');
  }

  const key = apiKey();
  if (!key) {
    return fail(res, 500,
      'The server has no API key. Add AGNES_API_KEY in Vercel → Settings → Environment Variables and redeploy.',
      'server_not_configured');
  }

  let input;
  try {
    input = await readBody(req);
  } catch (err) {
    if (err && err.code === 'TOO_LARGE') {
      return fail(res, 413, 'Request too large. Remove attachments or start a new chat.', 'too_large');
    }
    return fail(res, 400, 'Request body is not valid JSON.', 'bad_json');
  }

  if (!input || !Array.isArray(input.messages) || input.messages.length === 0) {
    return fail(res, 400, 'messages must be a non-empty array.', 'bad_request');
  }
  if (input.messages.length > MAX_MESSAGES) {
    return fail(res, 400,
      'Too many messages in one request (max ' + MAX_MESSAGES + '). Start a new chat.', 'bad_request');
  }

  const body = buildUpstreamBody(input);
  if (body.messages.length < 2) {
    return fail(res, 400, 'messages must contain at least one user or assistant message.', 'bad_request');
  }

  /* One controller covers both the time budget and the browser going away. */
  const controller = new AbortController();
  let budgetHit = false;
  const budgetTimer = setTimeout(function () {
    budgetHit = true;
    controller.abort();
  }, TIME_BUDGET_MS);

  res.on('close', function () {
    /* 'close' also fires after a normal end; only abort if we did not finish */
    if (!res.writableFinished) { controller.abort(); }
  });

  console.log('[sonic-ai]', new Date().toISOString(), 'model=' + body.model,
    'messages=' + body.messages.length, 'max_tokens=' + body.max_tokens, 'stream=' + body.stream);

  let upstream;
  try {
    upstream = await fetch(UPSTREAM_BASE + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Accept': body.stream ? 'text/event-stream' : 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(budgetTimer);
    if (budgetHit) {
      return fail(res, 504,
        'The model did not answer within the server time limit. Try again or lower Max tokens.',
        'time_limit');
    }
    if (controller.signal.aborted) { return; }          /* the browser left */
    console.error('[sonic-ai] upstream fetch failed:', err && err.message);
    return fail(res, 502, 'Could not reach the model provider. Try again in a moment.',
      'upstream_unreachable');
  }

  if (!upstream.ok) {
    clearTimeout(budgetTimer);
    const message = await upstreamErrorMessage(upstream);
    console.error('[sonic-ai] upstream status', upstream.status);
    const status = upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502;
    return fail(res, status, message, 'upstream_error');
  }

  /* ------------------------------ non-streaming: pass the JSON straight on */
  if (!body.stream) {
    try {
      const text = await upstream.text();
      clearTimeout(budgetTimer);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(text);
    } catch (err) {
      clearTimeout(budgetTimer);
      if (budgetHit) {
        return fail(res, 504,
          'The model did not finish within the server time limit. Turn streaming on, or lower Max tokens.',
          'time_limit');
      }
      if (controller.signal.aborted) { return; }
      return fail(res, 502, 'The model provider connection dropped.', 'upstream_dropped');
    }
  }

  /* ------------------------------------------ streaming: relay SSE as-is -- */
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') { res.flushHeaders(); }

  function sseError(message, code) {
    if (res.writableEnded || res.destroyed) { return; }
    res.write('data: ' + JSON.stringify({ error: { message: message, code: code } }) + '\n\n');
  }

  try {
    const reader = upstream.body.getReader();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) { break; }
      if (res.destroyed) { break; }
      res.write(Buffer.from(chunk.value));
    }
  } catch (err) {
    if (budgetHit) {
      sseError('Server time limit reached. The reply was cut off — tap Continue.', 'time_limit');
    } else if (!controller.signal.aborted) {
      sseError('The connection to the model provider dropped.', 'upstream_dropped');
    }
  } finally {
    clearTimeout(budgetTimer);
    if (!res.writableEnded) { res.end(); }
  }
};

module.exports.SYSTEM_PROMPT = SYSTEM_PROMPT;      /* exposed for local tests */
