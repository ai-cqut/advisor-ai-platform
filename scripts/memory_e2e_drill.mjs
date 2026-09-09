#!/usr/bin/env node

const DEFAULT_BACKEND = 'http://localhost:8080';
const DEFAULT_AUTH_BASE = 'http://localhost:8081';

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
  return `memory_debug_${Math.floor(Date.now() / 1000)}_${Math.floor(Math.random() * 10000)}`;
}

function randomTurnId() {
  return `turn_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
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

function parseJwtUserId(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
  try {
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
    const raw = decoded?.userId;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') return Number.parseInt(raw, 10);
    return null;
  } catch {
    return null;
  }
}

async function registerAndLogin(authBaseUrl) {
  const username = randomUser();
  const password = 'Test@123456';

  log('register', { username });
  const reg = await fetchJson(`${authBaseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, realName: 'memory-debug', phone: '', email: '' }),
  });
  if (!reg.res.ok) {
    throw new Error(`register failed: ${reg.res.status} ${reg.text}`);
  }

  log('login', { username });
  const login = await fetchJson(`${authBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!login.res.ok || !login.json?.data?.token) {
    throw new Error(`login failed: ${login.res.status} ${login.text}`);
  }

  return { username, token: login.json.data.token };
}

function ensureApiSuccess(label, result) {
  if (!result.res.ok) {
    throw new Error(`${label} http failed: ${result.res.status} ${result.text}`);
  }
  if (result.json?.code !== 200) {
    throw new Error(`${label} api failed: ${result.text}`);
  }
}

function parseArgs(argv) {
  const baseUrl = argv[2] || DEFAULT_BACKEND;
  const authBaseUrl = argv[3] || process.env.E2E_AUTH_BASE_URL || DEFAULT_AUTH_BASE;
  const memoryToken = argv[4] || process.env.MEMORY_API_TOKEN || '';
  return { baseUrl, authBaseUrl, memoryToken };
}

async function main() {
  const { baseUrl, authBaseUrl, memoryToken } = parseArgs(process.argv);
  if (!memoryToken) {
    throw new Error('MEMORY_API_TOKEN is required');
  }

  const { username, token } = await registerAndLogin(authBaseUrl);
  const userId = parseJwtUserId(token);
  if (!userId || Number.isNaN(userId)) {
    throw new Error('failed to parse userId from jwt');
  }

  const userAuth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const memoryAuth = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Memory-Token': memoryToken,
  };

  log('create chat session');
  const createSession = await fetchJson(`${baseUrl}/api/chat/sessions`, {
    method: 'POST',
    headers: userAuth,
  });
  ensureApiSuccess('create session', createSession);
  const sessionId = createSession.json?.data?.id;
  if (!sessionId) {
    throw new Error('create session failed: missing sessionId');
  }

  log('memory health');
  const health = await fetchJson(`${baseUrl}/api/memory/health`, {
    method: 'GET',
    headers: memoryAuth,
  });
  ensureApiSuccess('memory health', health);
  if (health.json?.data?.ok !== true) {
    throw new Error(`memory health failed: ${health.text}`);
  }

  const turnIdDone = randomTurnId();
  const turnIdFail = randomTurnId();

  log('memory upsert candidates');
  const upsert = await fetchJson(`${baseUrl}/api/memory/long-term/candidates`, {
    method: 'POST',
    headers: memoryAuth,
    body: JSON.stringify({
      userId,
      knowledgeBaseId: 0,
      candidates: [
        {
          content: `memory e2e candidate ${Date.now()}`,
          confidence: 0.88,
          sourceTurnId: turnIdDone,
          tags: { memory_key: 'e2e-key', type: 'fact' },
        },
      ],
    }),
  });
  ensureApiSuccess('memory upsert', upsert);

  log('memory search long-term');
  const search = await fetchJson(`${baseUrl}/api/memory/long-term/search`, {
    method: 'POST',
    headers: memoryAuth,
    body: JSON.stringify({
      userId,
      knowledgeBaseId: 0,
      query: 'memory e2e candidate',
      topK: 5,
      mode: 'hybrid',
    }),
  });
  ensureApiSuccess('memory search', search);
  const searchCount = Array.isArray(search.json?.data) ? search.json.data.length : 0;

  log('memory session summary get (before put)');
  const summaryBefore = await fetchJson(`${baseUrl}/api/memory/session-summary/${sessionId}`, {
    method: 'GET',
    headers: memoryAuth,
  });
  ensureApiSuccess('summary get before', summaryBefore);

  const summaryText = `memory summary ${Date.now()}`;
  log('memory session summary put');
  const summaryPut = await fetchJson(`${baseUrl}/api/memory/session-summary/${sessionId}`, {
    method: 'PUT',
    headers: memoryAuth,
    body: JSON.stringify({ summary: summaryText }),
  });
  ensureApiSuccess('summary put', summaryPut);

  log('memory session summary get (after put)');
  const summaryAfter = await fetchJson(`${baseUrl}/api/memory/session-summary/${sessionId}`, {
    method: 'GET',
    headers: memoryAuth,
  });
  ensureApiSuccess('summary get after', summaryAfter);
  if (summaryAfter.json?.data?.summary !== summaryText) {
    throw new Error(`summary mismatch: ${summaryAfter.text}`);
  }

  log('memory task submit #1');
  const taskSubmit1 = await fetchJson(`${baseUrl}/api/memory/task/submit`, {
    method: 'POST',
    headers: memoryAuth,
    body: JSON.stringify({
      userId,
      knowledgeBaseId: 0,
      sessionId,
      turnId: turnIdDone,
      userText: 'memory e2e user text',
      assistantText: 'memory e2e assistant text',
      recentMessages: [
        { role: 'user', content: 'memory e2e user text' },
        { role: 'assistant', content: 'memory e2e assistant text' },
      ],
    }),
  });
  ensureApiSuccess('task submit #1', taskSubmit1);
  const taskId1 = taskSubmit1.json?.data?.id;
  if (!taskId1) {
    throw new Error(`task submit #1 missing id: ${taskSubmit1.text}`);
  }

  log('memory task submit #2');
  const taskSubmit2 = await fetchJson(`${baseUrl}/api/memory/task/submit`, {
    method: 'POST',
    headers: memoryAuth,
    body: JSON.stringify({
      userId,
      knowledgeBaseId: 0,
      sessionId,
      turnId: turnIdFail,
      userText: 'memory e2e user text #2',
      assistantText: 'memory e2e assistant text #2',
      recentMessages: [
        { role: 'user', content: 'memory e2e user text #2' },
        { role: 'assistant', content: 'memory e2e assistant text #2' },
      ],
    }),
  });
  ensureApiSuccess('task submit #2', taskSubmit2);
  const taskId2 = taskSubmit2.json?.data?.id;
  if (!taskId2) {
    throw new Error(`task submit #2 missing id: ${taskSubmit2.text}`);
  }

  log('memory task pending');
  const pending = await fetchJson(`${baseUrl}/api/memory/task/pending?limit=10`, {
    method: 'GET',
    headers: memoryAuth,
  });
  ensureApiSuccess('task pending', pending);
  const pendingIds = Array.isArray(pending.json?.data) ? pending.json.data.map((x) => x.id) : [];
  if (!pendingIds.includes(taskId1) || !pendingIds.includes(taskId2)) {
    throw new Error(`pending list missing submitted tasks: ${pending.text}`);
  }

  log('memory task done');
  const done = await fetchJson(`${baseUrl}/api/memory/task/${taskId1}/done`, {
    method: 'POST',
    headers: memoryAuth,
  });
  ensureApiSuccess('task done', done);

  log('memory task fail');
  const fail = await fetchJson(
    `${baseUrl}/api/memory/task/${taskId2}/fail?error=${encodeURIComponent('e2e-fail')}`,
    {
      method: 'POST',
      headers: memoryAuth,
    },
  );
  ensureApiSuccess('task fail', fail);

  console.log(
    JSON.stringify(
      {
        ok: true,
        username,
        userId,
        sessionId,
        searchCount,
        summaryBeforeIsNull: summaryBefore.json?.data == null,
        summaryAfter: summaryAfter.json?.data?.summary,
        taskId1,
        taskId2,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
