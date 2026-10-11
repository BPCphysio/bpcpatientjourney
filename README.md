# BPC Patient Journey — Scenario Trainer

Staff training tool for Bangkok Physiotherapy Center. Physiotherapists work through real
patient-enquiry scenarios: what reception received, how they'd handle it
pre-arrival, what three questions they'd ask on the call, and why.

**Live:** https://bpcpatientjourney.vercel.app/

## What's in here

| File | Purpose |
| --- | --- |
| `index.html` | The application: HTML, CSS, JS, case data and fonts, inlined. |
| `grading/grader.js` | The auto-grader for the two written answers. Runs in the browser; no service, no key, no cost. |
| `grading/answers.json` | What the grader compares against: for every case and written question, three key points with their Thai and English cue words, and ten full-marks reference answers (five Thai, five English). Edit this to change how a case is graded. |
| `grading/testset.json` | Real staff answers (no names), marked point by point by a blind human marker. |
| `grading/test.js` | Measures the wording grader against that marking. `node grading/test.js` |
| `grading/ai/` | The language-model reader the clinic PC runs, and its accuracy test `node grading/ai/eval.mjs`. |
| `apps-script/Code.gs` | The clinic's collection script, as deployed. |
| `tools/preflight.py` | Run before every push. `python tools/preflight.py` |

A static site: no build step. The page itself works offline; the marking view
reads the grader from `grading/` beside it, and without it simply shows no
auto-grade.

## Auto-grading

Each written question has three key points. Two readers mark them:

- **The wording grader** (`grading/grader.js`) runs in the page on every typed
  answer. For each point it looks for the point's cue words and for likeness
  to ten full-marks reference answers and the head physiotherapists' own
  phrasings, and gives full, half or no credit.
- **The language model** (Qwen3 8B, open-source, free) runs on the clinic
  PC every 10 minutes, reads each new answer for meaning, and stores its
  reading, with a short note per point, beside the answer. See HANDOFF.md.

**The clinic's rule:** a good question counts as long as it relates to this
patient. So on "the three questions", each extra question tied to a detail of
this patient's chart earns half a point toward a missed key point. The model
names those extras and must quote the chart detail, which the job checks is
really in the chart; generic questions that fit any patient never count.

**Which reader leads,** measured against a blind marking of 58 real answers
under that rule (`node grading/ai/eval.mjs`): on "why those three" the model's
reading of the key points; on "the three questions" the wording grader's key
points plus the model's checked extras. Together: suggested mark within one of
the human's 97% of the time, the same mark 60%, average gap 9.5 points, against
90%, 50% and 12 for the wording grader alone. The page shows the other reader
as a second opinion and flags a big disagreement. The suggested mark out of 5
is pre-selected; the senior accepts or changes it, and saving records both.
Staff taking cases never see it.

Spoken answers are marked by the physiotherapist, not auto-graded.

### Claude, learning from the seniors

Every new answer is read by Claude (`claude-haiku-5-5` by default; set `CLAUDE_MODEL` in Vercel to change it) on the server the
moment it arrives (`api/_claude.js`). With it go the case, the question, and
up to ten answers to the same case that seniors have already marked, with
their scores and comments, so every mark a senior saves becomes an example
for the next answer. Claude suggests a mark out of 5, a note per key point and
a comment to the junior in the junior's language; it leads, the older readers
stay as a second opinion. When a senior opens an answer whose case has gained
new marked examples, it is read again. A comment saved exactly as Claude
drafted it is flagged (`commentBy: 'claude'`) and never used as an example.
What BPC expects (the patient journey, how seniors mark) is in `api/_guide.js`.

## Where the data lives

The clinic record is in **Neon** (Postgres, project "BPC Patient Journey",
Singapore), behind `api/clinic.js`, which answers the page with exactly the
parameters and JSON the old Google script used. Tables: `responses` (one row
per answer: the light record, marks, readings), `media` (pictures and
recordings), `kv` (the People and Markers lists, refreshed from the Google
Sheet every ten minutes), `marking_log`, `google_outbox`.

The Google script and Drive folder stay as the **backup**: every write is
queued and sent on to it in order (`google_outbox`). The People and Markers
tabs in the Google Sheet are still where the clinic edits staff and markers.
`api/migrate.js` copies Google into Neon, repeatably (`step: list | media | status`).

Vercel holds the settings: `DATABASE_URL` (from the Neon integration) and
`ANTHROPIC_API_KEY` (Claude Console key "BPC Patient Journey", paid from the
Max plan's monthly API credit; org spend capped at $15/month, no auto-reload).

## Deploying

### Vercel (connected to this repo)
The Vercel project `bpcpatientjourney` imports this repo with no framework and
no build command. Every push to `main` redeploys automatically within a
minute. GitHub Pages is switched off.

### Anywhere else
Serve the folder. Or just open `index.html` in a browser — it works offline.

## Updating the content

This repository is the source of truth. The site is no longer exported from
Claude Design; Claude Code edits `index.html` and the files beside it
directly, runs `python tools/preflight.py`, and pushes. Nothing needs
uploading by hand.

`index.html` keeps the single-file shape it was exported in: the page
template and the case modules are embedded inside it. Preflight checks that
every fix made so far is still in place before anything is pushed.

To edit the page, `python tools/template.py extract` writes it out as plain
HTML at `build/template.html`; edit that, then `python tools/template.py inject`.
The look (Rubik, navy and teal, after bpcphysio.com) is the "BPC clinic look"
block at the end of the template's styles; the logo is `assets/bpc-logo.png`.

## Structure of a case

Every scenario runs the same five steps:

1. **Case information** — exactly what reception received (a LINE message, a
   web form, or a multi-page patient history).
2. **Step 1 — multiple choice.** How would you handle this before the patient
   arrives? Four broad, human options; three are plausible-but-worse judgment
   calls, not obvious mistakes.
3. **Three questions.** The physiotherapist types or speaks the three questions
   they'd ask on the call, then explains why those three. Typed answers are
   auto-graded for the marker; see above.
4. **Next step** — reveals what the call actually surfaced and locks the
   learner's earlier answers so they can't revise with hindsight.
5. **Second MCQ + image upload** — a judgment question on the new information,
   plus one supporting image.

Cases are graded 1–5 on difficulty and each teaches one specific thing.
All Thai copy is written natively as clinic Thai, not translated from English.
