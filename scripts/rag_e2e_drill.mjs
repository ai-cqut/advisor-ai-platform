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
  return `rag_debug_${Math.floor(Date.now() / 1000)}_${Math.floor(Math.random() * 10000)}`;
}

function randomKbName() {
  return `rag_kb_${Math.floor(Date.now() / 1000)}_${Math.floor(Math.random() * 10000)}`;
}

async function fetchText(url, options = {}) {
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

async function registerAndLogin(authBaseUrl) {
  const username = randomUser();
  const password = 'Test@123456';

  log('register', { username });
  const reg = await fetchText(`${authBaseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, realName: 'rag-debug', phone: '', email: '' }),
  });
  if (!reg.res.ok) {
    throw new Error(`register failed: ${reg.res.status} ${reg.text}`);
  }

  log('login', { username });
  const login = await fetchText(`${authBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!login.res.ok || !login.json?.data?.token) {
    throw new Error(`login failed: ${login.res.status} ${login.text}`);
  }

  return { username, token: login.json.data.token };
}

function parseArgs(argv) {
  const baseUrl = argv[2] || DEFAULT_BACKEND;
  const authBaseUrl = argv[3] || process.env.E2E_AUTH_BASE_URL || DEFAULT_AUTH_BASE;
  return { baseUrl, authBaseUrl };
}

async function main() {
  const { baseUrl, authBaseUrl } = parseArgs(process.argv);
  const { username, token } = await registerAndLogin(authBaseUrl);
  const auth = { Authorization: `Bearer ${token}` };

  const kbName = randomKbName();
  log('create knowledge base', { kbName });
  const kb = await fetchText(`${baseUrl}/api/rag/knowledge-bases`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: kbName, description: 'rag e2e' }),
  });
  if (!kb.res.ok) {
    throw new Error(`create kb failed: ${kb.res.status} ${kb.text}`);
  }
  const knowledgeBaseId = kb.json?.data?.id;
  if (!knowledgeBaseId) {
    throw new Error('create knowledge base failed: missing knowledgeBaseId');
  }

  log('list knowledge bases');
  const kbList = await fetchText(`${baseUrl}/api/rag/knowledge-bases`, {
    method: 'GET',
    headers: auth,
  });
  if (!kbList.res.ok) {
    throw new Error(`list kb failed: ${kbList.res.status} ${kbList.text}`);
  }

  const text = `RAG e2e doc ${Date.now()} hello advisor`;
  const form = new FormData();
  form.append('file', new Blob([text], { type: 'text/plain' }), 'rag-e2e.txt');
  log('upload document');
  const upload = await fetchText(`${baseUrl}/api/rag/knowledge-bases/${knowledgeBaseId}/documents`, {
    method: 'POST',
    headers: auth,
    body: form,
  });
  if (!upload.res.ok) {
    throw new Error(`upload failed: ${upload.res.status} ${upload.text}`);
  }
  const docId = upload.json?.data?.id;
  if (!docId) {
    throw new Error('upload failed: missing docId');
  }

  log('list documents');
  const docs = await fetchText(`${baseUrl}/api/rag/knowledge-bases/${knowledgeBaseId}/documents`, {
    method: 'GET',
    headers: auth,
  });
  if (!docs.res.ok) {
    throw new Error(`list docs failed: ${docs.res.status} ${docs.text}`);
  }

  log('delete document');
  const delDoc = await fetchText(`${baseUrl}/api/rag/documents/${docId}`, {
    method: 'DELETE',
    headers: auth,
  });
  if (!delDoc.res.ok) {
    throw new Error(`delete doc failed: ${delDoc.res.status} ${delDoc.text}`);
  }

  log('delete knowledge base');
  const delKb = await fetchText(`${baseUrl}/api/rag/knowledge-bases/${knowledgeBaseId}`, {
    method: 'DELETE',
    headers: auth,
  });
  if (!delKb.res.ok) {
    throw new Error(`delete kb failed: ${delKb.res.status} ${delKb.text}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        username,
        knowledgeBaseId,
        docId,
        kbCount: Array.isArray(kbList.json?.data) ? kbList.json.data.length : 0,
        docCount: Array.isArray(docs.json?.data) ? docs.json.data.length : 0,
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
