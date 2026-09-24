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
| `grading/test.js` | Measures the grader against that marking. `node grading/test.js` |
| `apps-script/Code.gs` | The clinic's collection script, as deployed. |
| `tools/preflight.py` | Run before every push. `python tools/preflight.py` |

A static site: no build step. The page itself works offline; the marking view
reads the grader from `grading/` beside it, and without it simply shows no
auto-grade.

## Auto-grading

Each written question has three key points. For each one the grader looks for
the point's cue words, and for likeness to its ten reference phrasings, and
gives full, half or no credit. The question's percentage is the average; the
suggested mark out of 5 is that divided by 20. The senior physiotherapist sees
which points were found and why, and the suggested mark is pre-selected so
they can accept it or change it. Saving records both. Physiotherapists taking
the cases never see the auto-grade.

Spoken-only answers are not auto-graded: the grader cannot listen.

## Deploying

### GitHub Pages (connected to this repo)
Settings → Pages → Build and deployment → Source: **Deploy from a branch**,
Branch: `main`, folder `/ (root)`. Every push to `main` redeploys automatically
within a minute or two — no tokens, no build step, no config file needed.

### Anywhere else
Serve the folder. Or just open `index.html` in a browser — it works offline.

## Updating the content

`index.html` is a **generated bundle**, not the source of truth. The scenario
cases and app UI are authored elsewhere and re-bundled into this one file.
To publish an update: replace `index.html` wholesale, commit, push.

Do not hand-edit `index.html` unless the change is a one-off text fix — edits
will be overwritten by the next bundle.

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
