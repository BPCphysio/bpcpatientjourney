// The clinic record in Neon (Postgres): every answer, its pictures and
// recordings, the seniors' marks and Claude's readings. Vercel holds the
// connection string (DATABASE_URL); it is never in the page or the repo.
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

let _sql = null, _ready = null;

function sql() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('not configured'), { code: 'NOCONF' });
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

// Tables are created on first use, so a fresh database needs no setup step.
async function ready() {
  if (_ready) return _ready;
  const db = module.exports.sql();
  _ready = (async () => {
    await db`CREATE TABLE IF NOT EXISTS responses (
      id text PRIMARY KEY,
      scenario_id text,
      who text,
      sent_at bigint,
      rec jsonb NOT NULL,
      marks jsonb,
      marked_at bigint,
      marked_by text,
      mark_history jsonb,
      save_id text,
      ai jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await db`CREATE INDEX IF NOT EXISTS responses_case ON responses (scenario_id)`;
    await db`CREATE TABLE IF NOT EXISTS media (
      response_id text NOT NULL,
      k text NOT NULL,
      value text NOT NULL,
      PRIMARY KEY (response_id, k)
    )`;
    await db`CREATE TABLE IF NOT EXISTS kv (
      k text PRIMARY KEY,
      v jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await db`CREATE TABLE IF NOT EXISTS marking_log (
      id bigserial PRIMARY KEY,
      at timestamptz NOT NULL DEFAULT now(),
      who text, what text, answer_from text, case_title text, response_id text
    )`;
    // Every write is also sent on to the Google script, so the Drive folder
    // and the sheet stay a complete backup. Sent in order, one at a time.
    await db`CREATE TABLE IF NOT EXISTS google_outbox (
      id bigserial PRIMARY KEY,
      body jsonb NOT NULL,
      tries int NOT NULL DEFAULT 0,
      last_error text,
      done_at timestamptz,
      claimed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  })();
  try { await _ready; } catch (e) { _ready = null; throw e; }
  return _ready;
}

// The staff passcode's fingerprint, as in index.html.
const STAFF_PASSCODE_SHA256 = 'ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f';
const keyOk = k => crypto.createHash('sha256').update(String(k || '').trim()).digest('hex') === STAFF_PASSCODE_SHA256;

// q3:img is the first image; q3:img2, q3:img3 ... the rest; q1:audio, q2:audio.
const isMedia = k => /:(img\d*|audio)$/.test(k);

module.exports = { sql, ready, keyOk, isMedia };
