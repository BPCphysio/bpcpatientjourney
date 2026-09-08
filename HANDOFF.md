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

## Current content state

45 cases are in the live bundle. Each case runs four steps: 1 multiple choice
(what you do before the patient arrives), 2 the three questions you would ask on
the call, 3 why those three — then **Next step** locks those answers and reveals
what the call actually found, followed by 4, upload the image you would have on
the screen when the patient walks in, with a box to explain why that image and
what it changes about the session.

Three of the 45 are written out in full for review in the separate sample-cases
document; the rest follow the same four-step shape.
