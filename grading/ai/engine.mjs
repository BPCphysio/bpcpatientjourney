// Running the model, and reading the cases, for the job and the test.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import zlib from 'zlib';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { SYSTEM, userPrompt, parseReply, groundExtras } from './prompt.mjs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The cases live inside index.html, compressed. Read them the way the page
// does, so the prompt always shows the case exactly as staff saw it.
export function loadCases() {
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const man = JSON.parse(html.match(/<script type="__bundler\/manifest">\n([\s\S]*?)\n {2}<\/script>/)[1]);
  const ctx = { window: {} };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  const mods = [];
  for (const v of Object.values(man)) {
    if (!String(v.mime || '').includes('javascript')) continue;
    let raw = Buffer.from(v.data, 'base64');
    if (String(v.compressed).toLowerCase() === 'true') raw = zlib.gunzipSync(raw);
    const src = raw.toString('utf8');
    if (src.slice(0, 200).includes('BPC pre-arrival cases')) mods.push(src);
  }
  mods.sort((a, b) => (a.includes('BPC_TH') ? 1 : 0) - (b.includes('BPC_TH') ? 1 : 0));
  mods.forEach(s => vm.runInContext(s, ctx));
  return Object.fromEntries((ctx.window.BPC_CASES_EN || []).map(c => [c.id, c]));
}

export function loadAnswers() {
  return JSON.parse(fs.readFileSync(path.join(REPO, 'grading', 'answers.json'), 'utf8'));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function healthy(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch (e) { return false; }
}

// Start llama-server on the graphics card unless one is already listening.
// Returns a stop() that only stops what this call started.
export async function startServer(cfg) {
  if (await healthy(cfg.port)) return { stop: async () => {} };
  const exe = path.join(cfg.llamaDir, 'llama-server.exe');
  const proc = spawn(exe, ['-m', path.join(cfg.modelDir, cfg.model), '-ngl', '99', '-c', '12288',
    '--port', String(cfg.port), '--host', '127.0.0.1', '-np', '1', '--jinja', '--reasoning-format', 'deepseek'],
  { cwd: cfg.llamaDir, windowsHide: true, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    if (await healthy(cfg.port)) return { stop: async () => { try { proc.kill(); } catch (e) {} } };
    if (proc.exitCode !== null) break;
    await sleep(1000);
  }
  try { proc.kill(); } catch (e) {}
  throw new Error('the model server did not start');
}

// Mark one answer. The model thinks first, then answers; a reply that is not
// usable is asked for again, up to three times, then given up on.
export async function judge(port, c, block, q, answer) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const body = {
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userPrompt(c, block, q, answer) }],
      temperature: 0.6, top_p: 0.95, top_k: 20, max_tokens: 4000, seed: 1 + attempt,
      chat_template_kwargs: { enable_thinking: true }
    };
    try {
      const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(180000)
      });
      const j = await r.json();
      const out = parseReply(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
      if (out) { out.extras = groundExtras(out.extras, c.brief); return out; }
    } catch (e) { /* try again */ }
  }
  return null;
}
