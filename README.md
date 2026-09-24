# BPC Patient Journey — Scenario Trainer

Staff training tool for Bangkok Physiotherapy Center. Physiotherapists work through real
patient-enquiry scenarios: what reception received, how they'd handle it
pre-arrival, what three questions they'd ask on the call, and why.

**Live:** https://bpcphysio.github.io/bpcpatientjourney/

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

Against a blind marking of 58 real answers, the model is clearly better on
"why those three" and the wording grader on "the three questions", so the
page suggests the model's mark for "why" and the wording mark for the
questions, and shows the other as a second opinion; a big disagreement is
flagged. The suggested mark out of 5 is pre-selected; the senior accepts or
changes it, and saving records both. Staff taking cases never see it.

Spoken-only answers are not auto-graded.

## Deploying

### GitHub Pages (connected to this repo)
Settings → Pages → Build and deployment → Source: **Deploy from a branch**,
Branch: `main`, folder `/ (root)`. Every push to `main` redeploys automatically
within a minute or two — no tokens, no build step, no config file needed.

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
