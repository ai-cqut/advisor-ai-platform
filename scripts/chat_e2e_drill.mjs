#!/usr/bin/env node

import http from 'node:http';

const DEFAULT_BACKEND = 'http://localhost:8080';
const DEFAULT_AGENT = 'http://127.0.0.1:8001';
const TRANSIENT_HTTP_STATUSES = new Set([429, 502, 503, 504]);

function ts() {
  return new Date().toISOString();
}

function log(msg, data) {
  if (data === undefined) {
    console.log(`[${ts()}] ${msg}`);
  } else {
    console.log(`[${ts()}] ${msg}`, data);
  }
}

function randomUser() {
  return `debug_${Math.floor(Date.now() / 1000)}_${Math.floor(Math.random() * 10000)}`;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  return { res, text, json };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickDiagHeaders(headers) {
  const keep = [
    'www-authenticate',
    'x-trace-id',
    'x-request-id',
    'content-type',
    'server',
  ];
  const out = {};
  for (const k of keep) {
    const v = headers.get(k);
    if (v) {
      out[k] = v;
    }
  }
  return out;
}

function tokenDigest(token) {
  if (!token || typeof token !== 'string') return 'empty';
  const prefix = token.slice(0, 12);
  return `${prefix}...(${token.length})`;
}

async function withTransientRetry(label, requestFn, attempts = 8, baseDelayMs = 400) {
  let lastError = null;

  for (let i = 1; i <= attempts; i += 1) {
    try {
      const result = await requestFn();
      if (!TRANSIENT_HTTP_STATUSES.has(result.res.status)) {
        return result;
      }
      lastError = new Error(
        `${label} transient http ${result.res.status}: ${result.text.slice(0, 300)}`,
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (i < attempts) {
      const delay = Math.min(baseDelayMs * 2 ** (i - 1), 5000);
      log(`${label} transient failure, retrying`, { attempt: i, delayMs: delay });
      await sleep(delay);
    }
  }

  throw lastError ?? new Error(`${label} failed after retries`);
}

async function registerAndLogin(authBaseUrl) {
  const username = randomUser();
  const password = 'Test@123456';

  log('register', { username });
  const reg = await withTransientRetry('register', () =>
    fetchJson(`${authBaseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, realName: 'debug-user', phone: '', email: '' }),
    }),
  );
  if (!reg.res.ok) {
    throw new Error(`register failed: ${reg.res.status} ${reg.text}`);
  }

  log('login', { username });
  const login = await withTransientRetry('login', () =>
    fetchJson(`${authBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),
  );
  if (!login.res.ok || !login.json?.data?.token) {
    throw new Error(`login failed: ${login.res.status} ${login.text}`);
  }

  return { username, token: login.json.data.token };
}

async function readSseUntilDone(response, hardTimeoutMs = 600_000) {
  if (!response.body) {
    throw new Error('empty stream body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let hasDelta = false;
  let hasDone = false;
  let hasError = false;
  let deltaCount = 0;

  const kill = setTimeout(async () => {
    try { await reader.cancel(); } catch {}
  }, hardTimeoutMs);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');

      let idx = buffer.indexOf('\n\n');
      while (idx >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        let event = 'message';
        for (const line of block.split('\n')) {
          const trimmed = line.trimEnd();
          if (trimmed.startsWith('event:')) {
            event = trimmed.slice(6).trim();
          }
        }

        if (event === 'delta') {
          hasDelta = true;
          deltaCount += 1;
        }
        if (event === 'error') {
          hasError = true;
        }
        if (event === 'done' || event === 'end') {
          hasDone = true;
          try { await reader.cancel(); } catch {}
          return { hasDelta, hasDone, hasError, deltaCount };
        }

        idx = buffer.indexOf('\n\n');
      }
    }
  } finally {
    clearTimeout(kill);
  }

  return { hasDelta, hasDone, hasError, deltaCount };
}

async function runSmoke(baseUrl, authBaseUrl) {
  const { username, token } = await registerAndLogin(authBaseUrl);
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  log('create session');
  const create = await fetchJson(`${baseUrl}/api/chat/sessions`, { method: 'POST', headers: auth });
  if (!create.res.ok) {
    const diag = {
      status: create.res.status,
      body: create.text,
      headers: pickDiagHeaders(create.res.headers),
      authHeader: auth.Authorization ? 'present' : 'missing',
      tokenDigest: tokenDigest(token),
    };
    throw new Error(`create session failed: ${JSON.stringify(diag)}`);
  }
  const sessionId = create.json?.data?.id;
  if (!sessionId) throw new Error(`session id missing: status=${create.res.status} body=${create.text.slice(0, 500)}`);

  log('list sessions');
  const sessions = await fetchJson(`${baseUrl}/api/chat/sessions`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!sessions.res.ok) throw new Error(`list sessions failed: ${sessions.res.status}`);
  const row = (sessions.json?.data ?? []).find((x) => x.id === sessionId);
  if (!row) throw new Error('session not found in list');

  log('non-stream send without knowledge base');
  const send = await fetchJson(`${baseUrl}/api/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ content: 'smoke non-stream: reply OK' }),
  });
  if (!send.res.ok) throw new Error(`send failed: ${send.res.status}`);

  log('stream send and assert done');
  const stream = await streamSendWithRetry(baseUrl, token, sessionId);

  log('list messages');
  const msgs = await fetchJson(`${baseUrl}/api/chat/sessions/${sessionId}/messages`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!msgs.res.ok) throw new Error(`list messages failed: ${msgs.res.status}`);

  const out = {
    username,
    sessionId,
    nonStreamRole: send.json?.data?.role,
    streamHasDone: stream.hasDone,
    streamHasDelta: stream.hasDelta,
    streamHasError: stream.hasError,
    streamDeltaCount: stream.deltaCount,
    messageCount: (msgs.json?.data ?? []).length,
  };

  if (!out.streamHasDone) throw new Error('expected done event, got none');
  if (out.messageCount < 2) throw new Error(`expected >=2 messages, got ${out.messageCount}`);

  return out;
}

async function streamSendWithRetry(baseUrl, token, sessionId, attempts = 3) {
  let lastError = null;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const streamRes = await fetch(`${baseUrl}/api/chat/stream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          sessionId,
          messages: [{ role: 'user', content: 'smoke stream: reply stream ok' }],
        }),
      });
      if (!streamRes.ok) {
        if (TRANSIENT_HTTP_STATUSES.has(streamRes.status)) {
          throw new Error(`stream transient http ${streamRes.status}`);
        }
        throw new Error(`stream failed: ${streamRes.status}`);
      }
      return await readSseUntilDone(streamRes, 600_000);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = (lastError.message || '').toLowerCase();
      const retryable =
        msg.includes('terminated') ||
        msg.includes('econnreset') ||
        msg.includes('socket') ||
        msg.includes('network');
      if (!retryable || i >= attempts) {
        break;
      }
      const delay = Math.min(500 * 2 ** (i - 1), 3000);
      log('stream transient failure, retrying', { attempt: i, delayMs: delay, reason: lastError.message });
      await sleep(delay);
    }
  }
  throw lastError ?? new Error('stream failed');
}

function startTimeoutMockServer(port = 19081) {
  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }

    if (req.url === '/first-packet') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.flushHeaders();
      setTimeout(() => {
        res.write('event: done\ndata: {"finish_reason":"stop"}\n\n');
        res.end();
      }, 35_000);
      return;
    }

    if (req.url === '/idle-gap') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.flushHeaders();
      res.write('event: start\ndata: {"message":"started"}\n\n');
      setTimeout(() => {
        res.write('event: done\ndata: {"finish_reason":"stop"}\n\n');
        res.end();
      }, 65_000);
      return;
    }

    res.statusCode = 404;
    res.end('not found');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function streamWithFrontendTimeout(url, firstPacketMs, idleMs) {
  const controller = new AbortController();
  let timeoutType = null;
  let firstTimer = null;
  let idleTimer = null;

  const clearFirst = () => { if (firstTimer) { clearTimeout(firstTimer); firstTimer = null; } };
  const clearIdle = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } };

  const startFirst = () => {
    clearFirst();
    firstTimer = setTimeout(() => {
      timeoutType = 'first_packet';
      controller.abort();
    }, firstPacketMs);
  };

  const resetIdle = () => {
    clearIdle();
    idleTimer = setTimeout(() => {
      timeoutType = 'idle';
      controller.abort();
    }, idleMs);
  };

  startFirst();

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    if (!resp.ok || !resp.body) throw new Error(`stream failed: ${resp.status}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let sawAny = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');

      let idx = buffer.indexOf('\n\n');
      while (idx >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        if (block.trim()) {
          if (!sawAny) {
            sawAny = true;
            clearFirst();
          }
          resetIdle();
        }

        if (block.includes('event: done') || block.includes('event: end')) {
          clearFirst();
          clearIdle();
          try { await reader.cancel(); } catch {}
          return 'done';
        }

        idx = buffer.indexOf('\n\n');
      }
    }

    throw new Error('stream closed without done event');
  } catch (err) {
    if (timeoutType === 'first_packet') throw new Error('stream timeout: first packet > 30s');
    if (timeoutType === 'idle') throw new Error('stream timeout: idle > 60s');
    if (err instanceof Error && err.name === 'AbortError') throw new Error('stream aborted');
    throw err;
  } finally {
    clearFirst();
    clearIdle();
  }
}

async function runTimeoutDrill() {
  const mock = await startTimeoutMockServer(19081);
  try {
    const result = { firstPacket: null, idleGap: null };

    log('timeout drill first-packet 30s');
    const t1 = Date.now();
    try {
      await streamWithFrontendTimeout(`${mock.baseUrl}/first-packet`, 30_000, 60_000);
      result.firstPacket = { ok: false, reason: 'unexpected success' };
    } catch (e) {
      result.firstPacket = {
        ok: String(e.message).includes('first packet > 30s'),
        error: String(e.message),
        elapsedMs: Date.now() - t1,
      };
    }

    log('timeout drill idle-gap 60s');
    const t2 = Date.now();
    try {
      await streamWithFrontendTimeout(`${mock.baseUrl}/idle-gap`, 30_000, 60_000);
      result.idleGap = { ok: false, reason: 'unexpected success' };
    } catch (e) {
      result.idleGap = {
        ok: String(e.message).includes('idle > 60s'),
        error: String(e.message),
        elapsedMs: Date.now() - t2,
      };
    }

    if (!result.firstPacket?.ok) {
      throw new Error(`first packet drill failed: ${JSON.stringify(result.firstPacket)}`);
    }
    if (!result.idleGap?.ok) {
      throw new Error(`idle drill failed: ${JSON.stringify(result.idleGap)}`);
    }

    return result;
  } finally {
    await mock.close();
  }
}

async function runAgentAuthDrill(agentBaseUrl) {
  log('agent auth drill expect 401 without token', { agentBaseUrl });
  const payload = {
    messages: [{ role: 'user', content: 'auth drill' }],
    userId: 1,
    sessionId: 1001,
  };
  const res = await fetch(`${agentBaseUrl}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  const ok = res.status === 401 || res.status === 403;
  if (!ok) {
    throw new Error(`agent auth drill failed: expected 401/403, got ${res.status}, body=${text}`);
  }
  return { ok: true, status: res.status, bodyPreview: text.slice(0, 200) };
}

function parseArgs(argv) {
  const mode = argv[2] || 'smoke';
  const baseUrl = argv[3] || DEFAULT_BACKEND;
  const agentBaseUrl = argv[4] || process.env.AGENT_BASE_URL || DEFAULT_AGENT;
  const authBaseUrl = argv[5] || process.env.E2E_AUTH_BASE_URL || baseUrl;
  return { mode, baseUrl, agentBaseUrl, authBaseUrl };
}

async function main() {
  const { mode, baseUrl, agentBaseUrl, authBaseUrl } = parseArgs(process.argv);

  if (mode === 'smoke') {
    const result = await runSmoke(baseUrl, authBaseUrl);
    console.log(JSON.stringify({ ok: true, mode, result }, null, 2));
    return;
  }
  if (mode === 'timeout') {
    const result = await runTimeoutDrill();
    console.log(JSON.stringify({ ok: true, mode, result }, null, 2));
    return;
  }
  if (mode === 'all') {
    const smoke = await runSmoke(baseUrl, authBaseUrl);
    const timeout = await runTimeoutDrill();
    console.log(JSON.stringify({ ok: true, mode, smoke, timeout }, null, 2));
    return;
  }
  if (mode === 'auth') {
    const result = await runAgentAuthDrill(agentBaseUrl);
    console.log(JSON.stringify({ ok: true, mode, result }, null, 2));
    return;
  }
  if (mode === 'full') {
    const smoke = await runSmoke(baseUrl, authBaseUrl);
    const timeout = await runTimeoutDrill();
    const auth = await runAgentAuthDrill(agentBaseUrl);
    console.log(JSON.stringify({ ok: true, mode, smoke, timeout, auth }, null, 2));
    return;
  }

  throw new Error('unknown mode, use smoke|timeout|all|auth|full');
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
