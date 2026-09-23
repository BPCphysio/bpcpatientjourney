# For Claude Design — work for the next export

Paste this whole file into the Claude Design chat.

The live site is github.com/BPCphysio/bpcpatientjourney, deployed by GitHub
Pages. It is currently your **build TH-46** plus small corrections made in the
compiled `index.html` by Claude Code. Every export overwrites that file, so
anything in Part B has to become part of your source or it is lost.

Do not change the 45 cases, the Thai translations, the marking-view layout,
the dashboard or the `NAME_ALIASES` table beyond what is asked below.

## The backend contract

Google Apps Script "Patient Journey", same `ENDPOINT` URL as today. It already
supports all of this — no backend work is needed from you.

| Request | Returns |
| --- | --- |
| `GET ?roster=1` | `{ok, people:[{name, th, aliases:[]}]}` — the clinic's People sheet |
| `GET ?who=<name>` | `{ok, done:[scenarioId…]}` — cases this person has answered (any spelling; the script resolves aliases) |
| `GET ?exists=<responseId>` | `{ok, exists:true/false}` |
| `GET ?key=<passcode>` | `{ok, responses:[…]}` — **light** records: no image/audio, each has `media:[answerKeys]` and `person` (resolved name) |
| `GET ?key=<passcode>&id=<responseId>` | `{ok, response}` — one full record |
| `GET ?key=<passcode>&id=<responseId>&k=<answerKey>` | `{ok, key, value}` — **one** image or recording on its own |
| `POST {response}` | `{ok, id}`; a resend of the same `id` returns `{ok, duplicate:true}` and stores nothing |
| `POST {action:'mark'\|'delete', key, id, marks}` | unchanged |

---

# Part A — already in your TH-46 source. Keep it, don't rebuild it.

These six were checked and confirmed present in your last export. Listed only
so they are not dropped by accident:

1. **Progress follows the person**, via `?who=`, with `qiOffset` and
   `BUCKETS.slice(offset)`.
2. **One `attemptId` per attempt**, so a resend never duplicates.
3. **`?exists=` check before reporting a failed send**, plus the offline
   outbox that resends by itself.
4. **Roster chips and `canonical()`**, layered over `NAME_ALIASES`.
5. **Hydrate-on-open** in the marking view.
6. **Page title** `BPC Patient Journey Trainer`.

Two corrections Claude Code had to make on top of TH-46 — please fix these in
source so they stop coming back:

- `begin()` called `buildQueue(offset)` **inside** the `setState` literal, so
  the queue was still built from the stale local `done` list and a returning
  physio could be handed a case they had already answered. Pass the freshly
  fetched list in: `buildQueue(offset, done)`.
- The bundler shell still ships `<title>Bundled Page</title>` in the outer
  HTML even though the app sets its own title.

Also, when a card is opened, fetch its media **one piece at a time** (images
first), not in parallel — Apps Script refuses concurrent requests from the
same person and answers all of them with an error page after about a minute.
Retry each piece up to three times; the script intermittently returns an error
page under load.

---

# Part B — from the clinic's meeting with the Senior PT

B1, B2 and B3 were delivered in build TH-49 and verified. They are kept
here only so they are not lost by a later export. **B5 and B6 are the
outstanding work.**

## B1. Thai example answers — DONE in TH-49

The Thai case files carry Thai `title`, `brief`, `model` and `reveal` for all
45 cases — but **zero** per-question `key` entries and **zero** `q5key`.

The marking view shows the per-question `key` under the label
"คำตอบตัวอย่าง", so in Thai mode the senior sees a Thai label with English
text underneath. This is the Senior PT's complaint at 00:42 and 05:04 of the
meeting.

Add, for all 45 cases in `th-cases-1.js`, `th-cases-2.js`, `th-cases-3.js`:

- a Thai `key` on **every** question, and
- `q5key`.

Clinic Thai in the existing style — not a word-for-word translation of the
English.

## B2. Four cases per physio — DONE in TH-49

Do **not** simply trim `BUCKETS`. Trimming to the first four caps difficulty
at 4, and the Senior PT's specific complaint (02:00) is that he has never yet
reached a level-5 case. Rebalance so four cases still climb to 5:

```js
const BUCKETS = [[1, 2], [2], [3], [3, 4], [4], [5]];   // now
const BUCKETS = [[1, 2], [3], [4], [5]];                // wanted
```

Progress labels ("Case 2 of 4", the welcome-back note, the next-case button)
already derive from `BUCKETS.length`. Keep it that way rather than hardcoding
a 4 anywhere.

These eight copy strings still say six and must change in both languages:
`startBody`, `begin`, `ready`, `doneTitle` in the English `UI`, and the same
four in the Thai `UI`.

## B3. Scores by person — DONE in TH-49

Built live on 23 Sept — bake it into source so the next export keeps it. The
Senior PT asked for this twice (03:37 and 04:21): he wants **names, not
scenario titles**, as the headline of the dashboard.

Above "Everyone who has answered", a list headed **"Scores by person —
weakest first"** / **"คะแนนรายคน — คนที่ต้องช่วยก่อน"**. One row per person:

- their percentage of correct pre-arrival multiple choices,
- their name,
- a note: `N of M pre-arrival choices right · K marked, average X/5`, or
  `· nothing marked yet` when he has not scored any of their answers.

Sorted lowest percentage first. Tapping a row opens that person's folder —
that is his "zoom in on the 30% people and read what they wrote" (04:43).

No marking is required for this: the pre-arrival multiple choice is
objectively right or wrong, and whatever he has already scored out of 5 is
averaged into the note.

**Careful with the `MK` dictionary:** `notMarked` already exists as the
per-question verdict label. These strings are `noMarksYet`, `byPerson`,
`scoreOf`, `markedOf`. A duplicate key in that object literal is silently
overwritten rather than flagged — it cost an afternoon once already.

## B5. The marking card must show the scenario — OUTSTANDING

An opened marking card listed the physio's answers, the model answers and the
verdicts — but never the case itself, so a senior was judging replies without
seeing the chart the physio had read. The Senior PT raised it as "the
scenarios are not there in marking mode".

An opened card now starts with two blocks, above the questions, both taken
from the language-resolved case (`this.view(rawSc)`) so they follow the
toggle:

- **"The chart they were given"** / **"ชาร์ตที่เขาได้รับ"** — the case `brief`.
- **"What the call surfaced"** / **"สิ่งที่ได้จากการโทร"** — the case `reveal`,
  slightly dimmer. Needed because question 4 is answered after the reveal.

New `MK` keys: `theCase`, `theCall`. Row fields: `brief`, `hasBrief`,
`reveal`, `hasReveal`, `mkTheCase`, `mkTheCall`. Both use `white-space:
pre-wrap` — the charts rely on their line breaks.

## B6. Stop shipping the Netlify files — OUTSTANDING

Every export still contains `netlify.toml` and a `README.md` whose **Live**
link points at `bpcpatientjourney.netlify.app`. The site has been on GitHub
Pages since 8 Sept; neither file is in the repo and both are discarded on
every merge, but they keep making the clinic think Netlify is still involved.
Please drop `netlify.toml` from the export, and either drop `README.md` or
point it at https://bpcphysio.github.io/bpcpatientjourney/ with the Netlify
section removed.

## B4. Heads-up only — no work yet

Automatic grading of questions 2 and 3 is being built on the Claude Code side,
**without any AI service or API key**, by checking whether an answer covers
the concepts a good answer must contain. The Senior PT named the recurring
ones himself at 05:40: Severity of Symptoms, History of Treatment, Mechanism
of Injury.

That will add a new per-question data field holding those concepts together
with the different Thai and English wordings physios use for each. Question 4
(the image) stays manually graded — he said so explicitly at 05:04.

Do not build anything for this. Just expect case data to grow a field.

---

## When you are done

Hand the export folder to Claude Code rather than uploading it to GitHub. It
checks the footer build stamp and that everything in Part A survived, then
commits. Once an export arrives with all of it intact, uploading straight to
GitHub becomes safe again.
