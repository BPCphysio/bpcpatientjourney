// The job the clinic PC runs every ten minutes.
//
//   node grading/ai/grade-new.mjs [path to settings] [--dry-run]
//
// Asks the clinic record for its answers (one light request). If any written
// answer has no reading yet, or was changed since, it starts the model on the
// graphics card, reads each one, sends the readings back beside the answers,
// and stops the model again. With nothing new, it exits in seconds and never
// starts the model.
//
// --dry-run asks for the list and prints what a run would read, then stops:
// no model, nothing sent to the clinic, nothing in the log.
//
// Settings live outside the repository, because they hold the staff
// passcode: %USERPROFILE%\llm\config.json
//   { "endpoint": "https://script.google.com/macros/s/…/exec",
//     "key": "<staff passcode>",
//     "llamaDir": "C:\\Users\\…\\llm\\llama",
//     "modelDir": "C:\\Users\\…\\llm\\models",
//     "port": 8090 }
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MODEL_FILE, PROMPT_VERSION, fingerprint } from './prompt.mjs';
import { loadCases, loadAnswers, startServer, judge } from './engine.mjs';

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--dry-run');
const CFG_PATH = ARGS.find(a => !a.startsWith('--')) || path.join(os.homedir(), 'llm', 'config.json');
const cfg = Object.assign({ port: 8090, model: MODEL_FILE }, JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')));
const LOG = path.join(path.dirname(CFG_PATH), 'grader.log');
const LOCK = path.join(path.dirname(CFG_PATH), 'grader.lock');

function log(msg) {
  if (DRY) { console.log(msg); return; }
  const line = new Date().toISOString() + '  ' + msg + '\n';
  try {
    fs.appendFileSync(LOG, line);
    const s = fs.statSync(LOG);
    if (s.size > 400000) fs.writeFileSync(LOG, fs.readFileSync(LOG, 'utf8').slice(-200000));
  } catch (e) {}
}

// one run at a time; a lock older than an hour belongs to a run that died.
// A dry run changes nothing, so it neither waits for nor holds the lock.
if (!DRY) {
  try {
    const st = fs.statSync(LOCK);
    if (Date.now() - st.mtimeMs < 3600000) process.exit(0);
  } catch (e) {}
  fs.writeFileSync(LOCK, String(process.pid));
}
const unlock = () => { if (!DRY) try { fs.unlinkSync(LOCK); } catch (e) {} };

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function clinic(url, init, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(90000) }, init || {}));
      const j = JSON.parse(await r.text());
      if (j && j.ok) return j;
      last = new Error(j && j.error || 'refused');
      if (String(last.message).includes('bad key')) break;
    } catch (e) { last = e; }
    // the clinic script finishes our last request even after we stop waiting
    await sleep(10000 * (i + 1));
  }
  throw last;
}

async function main() {
  const q = (cfg.endpoint.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(cfg.key);
  const list = (await clinic(cfg.endpoint + q)).responses || [];
  const answers = loadAnswers();
  const work = [];
  for (const r of list) {
    const a = r.answers || {};
    for (const qk of ['q1', 'q2']) {
      const text = String(a[qk + ':text'] || '').trim();
      if (text.replace(/\s/g, '').length < 3) continue;
      if (!answers.cases[r.scenarioId] || !answers.cases[r.scenarioId][qk]) continue;
      const h = fingerprint(qk, text);
      if (r.ai && r.ai[qk] && r.ai[qk].h === h) continue;
      work.push({ r, qk, text, h });
    }
  }
  if (!work.length) { log(`${list.length} submissions, nothing new`); return; }

  // Counted two ways on purpose: a submission holds up to two written
  // answers (Q1 and Q2), so "2 answers from 1 submission" is one new person,
  // not the same answer read twice. The ids show which ones.
  const subs = [...new Set(work.map(w => w.r.id))];
  log(`${work.length} written answers to read, from ${subs.length} submissions: ` +
    work.map(w => w.r.id + ' ' + w.qk).join(', '));
  if (DRY) return;
  const cases = loadCases();
  const server = await startServer(cfg);
  const out = {};
  let done = 0, failed = 0;
  try {
    for (const w of work) {
      const c = cases[w.r.scenarioId];
      const got = await judge(cfg.port, c, answers.cases[w.r.scenarioId][w.qk], w.qk, w.text);
      if (!got) { failed++; continue; }
      const pct = Math.round(got.credits.reduce((s, x) => s + x, 0) / 3 * 100);
      (out[w.r.id] = out[w.r.id] || {})[w.qk] = {
        credits: got.credits, notes: got.notes, pct: pct, h: w.h,
        extras: got.extras.map(x => x.item), extrasChart: got.extras.map(x => x.chart),
        model: cfg.model.replace(/\.gguf$/, ''), v: PROMPT_VERSION, at: Date.now()
      };
      done++;
    }
  } finally {
    await server.stop();
  }
  // send in small batches; each is merged beside the answer on the clinic side
  const ids = Object.keys(out);
  let saved = 0;
  for (let i = 0; i < ids.length; i += 8) {
    const items = ids.slice(i, i + 8).map(id => ({ id, ai: out[id] }));
    const j = await clinic(cfg.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'ai', key: cfg.key, items })
    });
    saved += Number(j.saved) || 0;
    await sleep(1500);
  }
  log(`read ${done} answers, could not read ${failed}; sent readings for ${ids.length} submissions, clinic stored ${saved}`);
  // The clinic stores a reading only if it finds the answer's own file. One it
  // lists but cannot find would be read again on every run, so say so.
  if (saved < ids.length) log(`clinic stored ${saved} of ${ids.length}; any it did not store will be read again next run. Sent: ${ids.join(', ')}`);
}

main().catch(e => log('stopped: ' + (e && e.message || e))).finally(unlock);
