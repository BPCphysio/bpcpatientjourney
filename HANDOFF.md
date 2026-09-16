# Maintenance notes

The site lives at [github.com/BPCphysio/bpcpatientjourney](https://github.com/BPCphysio/bpcpatientjourney)
and deploys via GitHub Pages (`main` branch, root folder) — no tokens, no
build step. Live: https://bpcphysio.github.io/bpcpatientjourney/

**This repo is the source of truth for `index.html`.** The bug fixes below
were made directly in the bundle here. If a new bundle is ever exported from
the design tool, it will not contain them — either re-apply them there first
or keep updating the file in this repo.

## The two halves

| Piece | Where | Purpose |
| --- | --- | --- |
| `index.html` | this repo → GitHub Pages | The whole trainer UI and the 45 cases |
| Apps Script "Patient Journey" | Google Drive of contact@bpcphysio.com | Stores answers, the staff passcode, the People roster |

The Apps Script keeps its data in the Drive folder **BPC Trainer Responses**:
one `.json` per submitted answer, plus a spreadsheet of the same name with a
`Sheet1` log and a **People** tab.

Changing the script: edit `Code.gs`, save, then **Deploy → Manage
deployments → pencil → Version: New version → Deploy**. Saving alone does not
change the live `/exec` URL.

## Staff passcode

`var ADMIN_KEY` at the top of `Code.gs` (currently `12345678`). The passcode
is checked by the script, not by `index.html`.

## People roster (Thai / English names are one person)

The **People** tab in the spreadsheet has one row per physio:

| Name | Thai name | Other spellings (comma-separated) |
| --- | --- | --- |
| Moo | หมู | Mu, Mhoo |

Any of those spellings typed on the start screen resolves to the row's
`Name`, for progress and for the marking-view folders. The tab is created
automatically the first time the script needs it, pre-filled with every name
that has answered so far — the clinic only fills in the Thai/English pairs.
The start screen shows the roster as tap-to-pick chips (Thai names in Thai
mode), so typing is the fallback, not the norm.

## How progress works

Progress follows the **person**, not the browser. When someone presses
*Start my six cases* the trainer asks the script which cases that name has
already answered, and continues from there: one answered → *Case 2 of 6*,
two → *Case 3 of 6*, and so on, on any device. Answers in progress but not
yet submitted are still only on the device they were written on.

Submissions carry one id per attempt, and the script treats a resend of the
same id as already received — a phone that drops the connection mid-submit
no longer produces a duplicate record.

## Current content state

45 cases are in the live bundle. Each case runs four steps: 1 multiple choice
(what you do before the patient arrives), 2 the three questions you would ask on
the call, 3 why those three — then **Next step** locks those answers and reveals
what the call actually found, followed by 4, upload the image you would have on
the screen when the patient walks in, with a box to explain why that image and
what it changes about the session.

The four step prompts, labels and buttons follow the chosen language. Case
prose (title, brief, reveal, model answer, options) is still English for the
45 current cases; translating them is a separate batch of work.
