# Maintenance notes

The site lives at [github.com/BPCphysio/bpcpatientjourney](https://github.com/BPCphysio/bpcpatientjourney)
and deploys via GitHub Pages (`main` branch, root folder): every push is live
within a minute or two, no tokens, no build step.
Live: https://bpcphysio.github.io/bpcpatientjourney/

**This repository is the only source.** Claude Design is no longer used.
Claude Code edits the files here, runs `python tools/preflight.py`, and
pushes. The footer shows the build stamp (`build TH-…`) so you can see which
build is live.

## The pieces

| Piece | Where | Purpose |
| --- | --- | --- |
| `index.html` | this repo, on GitHub Pages | The trainer and the 45 cases, English and Thai |
| `grading/` | this repo, on GitHub Pages | The auto-grader the marking view uses, and its reference answers |
| Apps Script "Patient Journey" | Google Drive of contact@bpcphysio.com | Stores answers and marks, checks the staff passcode, holds the People roster |
| `grading/ai/` job | the clinic PC, every 10 minutes | Reads new written answers with a language model and stores its reading beside them |

The repo is public, so nothing secret is written in it. The staff passcode
lives only in the deployed Apps Script (line 1 of the editor's copy) and in
the clinic PC's settings file. `apps-script/Code.gs` here carries a
placeholder on that line.

## Apps Script

Data sits in the Drive folder **BPC Trainer Responses**: one `.json` per
submitted answer, and an `index.json` the script keeps with every answer in
light form (no image or audio data). The marking view reads the index in one
request and fetches an answer's image or audio only when its card is opened.
The spreadsheet of the same name has a `Sheet1` log and the **People** tab.

The script answers one request per person at a time and is slow to wake:
eight seconds or more on the first call after a quiet spell. The page queues
every call, leaves a gap between them, and gives the first attempt a minute.

Changing the script: edit it in the Apps Script editor, keeping the editor's
own line 1, save, then **Deploy → Manage deployments → pencil → Version: New
version → Deploy**. Saving alone does not change the live `/exec` URL. Keep
`apps-script/Code.gs` in step, apart from line 1.

## People roster

The **People** tab has one row per physiotherapist: Name, Thai name, other
spellings, full name (reference only), Branch. Any spelling typed on the start
screen resolves to the row's Name, for progress and for the marking view,
which groups answers by branch, then person.

## How progress works

Progress follows the person, not the browser. Each set is four cases,
rising in difficulty; starting again continues from the next case that
person has not answered, on any device. Each attempt has one id, so a resend
is never a duplicate. A failed send is checked with the script first, then
kept in an outbox on the phone that sends itself when there is signal.

## Auto-grading

See the README. In short: the wording grader (`grading/grader.js`) runs in
the page for every typed answer. The language model's reading, when the job
on the clinic PC has made one, leads on "why those three" and is a second
opinion on "the three questions". Both are measured against a blind marking
of real staff answers: `node grading/test.js` and `node grading/ai/eval.mjs`.

## The job on the clinic PC

- **What runs:** Task Scheduler task *BPC answer grader*, every 10 minutes
  while someone is signed in, launching `%USERPROFILE%\llm\run-grader.vbs`
  (no window), which runs `node grading\ai\grade-new.mjs`.
- **What it needs:** `%USERPROFILE%\llm\config.json` (clinic script address,
  staff passcode, folders), llama.cpp in `%USERPROFILE%\llm\llama`, and the
  model `Qwen3-8B-Q4_K_M.gguf` in `%USERPROFILE%\llm\models`. All free and
  open-source; nothing is sent anywhere but the clinic's own script.
- **What it does:** one light request to the clinic script. If a written
  answer has no reading, it starts the model on the graphics card, reads
  each new answer (about 7 seconds each), stores the readings beside the
  answers, and stops the model. With nothing new it finishes in seconds.
- **Log:** `%USERPROFILE%\llm\grader.log`.
- **If the PC is off:** nothing breaks. New answers show the wording grade
  until the PC is next on, then the model's reading appears.
- **If the passcode changes:** update `key` in `config.json`.
