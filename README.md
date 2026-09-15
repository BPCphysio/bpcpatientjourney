# BPC Patient Journey — Scenario Trainer

Staff training tool for Bangkok Physiotherapy Center. Physios work through real
patient-enquiry scenarios: what reception received, how they'd handle it
pre-arrival, what three questions they'd ask on the call, and why.

**Live:** https://bpcphysio.github.io/bpcpatientjourney/

## What's in here

| File | Purpose |
| --- | --- |
| `index.html` | The entire application. Self-contained — all HTML, CSS, JS, case data and fonts are inlined. No build step, no dependencies, no network calls. |

That's it. This is a single-file static site.

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
3. **Three questions.** Learner types or speaks the three questions they'd ask
   on the call, then explains why those three.
4. **Next step** — reveals what the call actually surfaced and locks the
   learner's earlier answers so they can't revise with hindsight.
5. **Second MCQ + image upload** — a judgment question on the new information,
   plus one supporting image.

Cases are graded 1–5 on difficulty and each teaches one specific thing.
All Thai copy is written natively as clinic Thai, not translated from English.
