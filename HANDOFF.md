# Maintenance notes

The GitHub migration described in earlier versions of this file is done: the
site lives at [github.com/BPCphysio/bpcpatientjourney](https://github.com/BPCphysio/bpcpatientjourney)
and deploys via GitHub Pages (`main` branch, root folder) — no Netlify, no
tokens, no build step.

## How updates work

`index.html` is **generated output**, not source. New scenario cases and UI
changes are authored in the design tool that produced it and re-bundled into a
fresh single file. To publish:

```bash
# replace index.html with the newly bundled file, then
git add index.html
git commit -m "Update scenario cases"
git push
```

GitHub Pages redeploys on push, usually within a minute or two. Claude Code
should **not** rewrite, reformat, prettify, minify or refactor `index.html` —
it is bundled output and any edit will be lost on the next bundle. Small
one-off text corrections are fine if the same fix is also reported back so it
can be made in the source.

A design-tool export bundles `index.html` alongside its own copies of
`README.md`, `netlify.toml` and `.gitignore` — those are stale (still
Netlify-flavored) and should **not** overwrite the versions in this repo; only
`index.html` gets replaced wholesale.

## What changed in this build (Sept 2026)

1. **Staff passcode is now `12345678`** (was `BPC12345678`).
2. **The marking view is now folders, not one long list.** One card per person;
   click a person to read only their answers; "← All people" goes back.
3. **People are grouped by the nickname they type**, matched case- and
   spacing-insensitively. Nobody is pre-registered — the first time a person
   types a name that becomes their folder, and typing it again returns them to
   it. Names used on a device are offered as one-tap chips.
4. **Dashboard on the marking home screen** — four headline figures (people,
   answers in, still to mark, cases covered) and a "where the team is weakest"
   list ranking cases by how often the pre-arrival multiple choice was answered
   wrong. Each person card now shows a marked/unmarked progress bar.
5. **Thai mode fixed.** The four step prompts were hard-baked in English and
   stayed English when Thai was selected — they now follow the language, as does
   every label, button and note. Case prose (title, brief, reveal, model answer,
   the multiple-choice options) is still English for the 45 current cases: the
   Thai translation table is keyed to the retired case ids, so it no longer
   matches. In Thai mode each case now says so honestly instead of silently
   showing English. Translating the 45 cases is a separate batch of work.

Nothing about deployment changes: the rebuilt `index.html` in this folder is the
whole site.

## Current content state

45 cases are in the live bundle. Each case runs four steps: 1 multiple choice
(what you do before the patient arrives), 2 the three questions you would ask on
the call, 3 why those three — then **Next step** locks those answers and reveals
what the call actually found, followed by 4, upload the image you would have on
the screen when the patient walks in, with a box to explain why that image and
what it changes about the session.

Three of the 45 are written out in full for review in the separate sample-cases
document; the rest follow the same four-step shape.
