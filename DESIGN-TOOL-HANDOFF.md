# For Claude Design — fold these live fixes into `BPC Scenario Trainer.dc.html`

Paste this whole file into the Claude Design chat.

The live site (github.com/BPCphysio/bpcpatientjourney, deployed by GitHub
Pages) is build **TH-45** plus a set of fixes that were made directly in the
compiled `index.html` by Claude Code. Every export from here overwrites them,
so please make them part of the source. Nothing below changes the cases, the
Thai, the marking-view layout or the dashboard — keep all of that exactly as
it is, and keep the `NAME_ALIASES` table.

The backend (Google Apps Script "Patient Journey", same `ENDPOINT` URL as
today) already supports everything below. Its contract:

| Request | Returns |
| --- | --- |
| `GET ?roster=1` | `{ok, people:[{name, th, aliases:[]}]}` — the clinic's People sheet |
| `GET ?who=<name>` | `{ok, done:[scenarioId…]}` — cases this person has already answered (any spelling; the script resolves aliases) |
| `GET ?exists=<responseId>` | `{ok, exists:true/false}` |
| `GET ?key=<passcode>` | `{ok, responses:[…]}` — **light** records: no image/audio data, each has `media:[answerKeys]` and `person` (resolved name) |
| `GET ?key=<passcode>&id=<responseId>` | `{ok, response}` — one full record with image/audio |
| `POST {response}` | `{ok, id}`; a resend of the same `id` returns `{ok, duplicate:true}` and stores nothing |
| `POST {action:'mark'|'delete', key, id, marks}` | unchanged |

## 1. Progress follows the person, not the device

Today the six-case set and its position live only in the browser's
localStorage. Someone who did case 1 on the phone and comes back on another
device, or presses *Start my six cases* instead of *Carry on*, starts at
"Case 1 of 6" again.

Wanted behaviour:

- `begin` first checks the stored session; if its `taker` resolves to the same
  person as the typed name, it **resumes** it instead of starting fresh.
- Otherwise it asks the script `?who=<name>` (allow up to 45 s; show
  "Checking your progress with the clinic…" / "กำลังตรวจสอบความคืบหน้าของคุณกับคลินิก…"
  and disable the button meanwhile). On failure fall back to the local `done`
  list.
- `offset = done.length % 6`. Build the queue from the remaining difficulty
  bands only — `BUCKETS.slice(offset)` — and keep `qiOffset` in state and in
  the saved session. Labels count from the real position:
  `Case (qi + qiOffset + 1) of 6`, next-case label `qi + qiOffset + 2`, the
  welcome-back note likewise. `total` is `BUCKETS.length`, not the queue length.
- `moreCases` starts a fresh set with offset 0; `finish` resets `qiOffset`.

## 2. One id per attempt (no duplicates)

`submit` currently mints a new response id on every click. A phone that lost
the confirmation re-sends and creates a copy.

- Keep `attemptId` in state and in the saved session; create it when a case is
  shown (in `begin`, `resume`, `moreCases`) and after each successful submit
  (`advance` sets a fresh one for the next case).
- `submit` uses `id: this.state.attemptId`.

## 3. Confirm before reporting a failed send, and an outbox

Big answers (voice + image) on a weak signal often reach the clinic while the
reply never reaches the phone.

- `landed(id)`: `GET ?exists=<id>` (two tries, 20 s each) → true/false.
- In `submit`: on any error, `if (await this.landed(id))` treat as received.
  On a retry while an error is showing, call `landed` **before** uploading.
- If it really did not land: `queueOutbox(r)` (localStorage `bpc_pj_outbox`),
  still `advance()` and go to the *between* screen with title
  "Saved — will send when there is signal." / "เก็บคำตอบไว้แล้ว — จะส่งเมื่อมีสัญญาณ"
  and body "…kept on this device and will send themselves when there is a
  connection. Nothing more to do; carry on to the next case."
- `drainOutbox()`: for each queued answer, `landed` → drop; else POST → on
  `ok` drop; else if `landed` drop. Run it 3 s after mount, every 60 s, on the
  `window` `online` event, and 0.5 s after each successful submit. Guard with a
  `draining` flag.
- State `pending` = outbox length. On the start screen and the between screen
  show, when `pending > 0`:
  "N answers are waiting to send — they go automatically when there is signal;
  just open this page for a moment somewhere with a good connection." (Thai:
  "มี N คำตอบรอส่ง — จะส่งให้เองเมื่อมีสัญญาณ เปิดหน้านี้ทิ้งไว้สักครู่เมื่อมีสัญญาณดี").

## 4. Roster chips + canonical names (on top of `NAME_ALIASES`)

- On mount, `GET ?roster=1`; cache in localStorage `bpc_pj_roster`.
- Start screen: when the roster is non-empty, the chips under the name field
  are the roster ("Tap your name:" / "แตะชื่อของคุณ:"), showing the Thai name in
  Thai mode; picking one sets the name field. Fall back to the device's
  remembered names when the roster is empty.
- `canonical(name)`: `canonName(name)` from `NAME_ALIASES` first, then match
  the result against roster `name` / `th` / `aliases` (using `folderKey`).
  Use it for `who` on submit and for the `?who=` lookup.
- Marking view: group folders by `r.person || r.who` (the script resolves
  the person), keep the "Signed in as …" note.

## 5. Fast marking view

- `load(key)` unchanged — the list is already light (no media).
- When a card is opened (`toggle` with `open === false`), call `hydrate(r)`:
  `GET ?key=&id=<r.id>` and merge `response.answers` into that record, mark
  `full: true`. While a media key is listed in `r.media` but not yet loaded,
  show "Loading…" / "กำลังโหลด…" instead of "No answer".

## 6. Scores by person on the marking dashboard

Added live on 23 Sept, from the senior's meeting: above "Everyone who has
answered", a list headed **"Scores by person — weakest first"** / **"คะแนนรายคน
— คนที่ต้องช่วยก่อน"**. One row per person: their percentage of correct
pre-arrival multiple choices, their name, and a note reading
`N of M pre-arrival choices right · K marked, average X/5` (or
`· nothing marked yet`). Sorted lowest first, and tapping a row opens that
person's folder. No marking needed — the multiple choice is objective.

Watch the `MK` dictionary for duplicate keys: `notMarked` already existed as
the per-question verdict label, so these use `noMarksYet`, `byPerson`,
`scoreOf` and `markedOf`. A repeated key in that object literal is silently
overwritten rather than flagged.

## 7. Small things

- `<title>` is `BPC Patient Journey Trainer` (the export ships "Bundled Page").
- Keep the build stamp in the footer and bump it with each export.
- No timer (already agreed).

## After the next export

Send the export folder to Claude Code, not to GitHub. Claude Code checks the
footer stamp and that all six behaviours above are present, then commits. Once
an export contains them all, uploading straight to GitHub becomes safe again.
