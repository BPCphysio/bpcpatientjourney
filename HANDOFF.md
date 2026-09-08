# Handoff — put this site on GitHub and reconnect Netlify

Paste this whole file to Claude Code (or follow it yourself). Everything needed
is in this folder; nothing has to be built or compiled.

## Context

- The site is **one self-contained file**: `index.html` (~600 KB). All CSS, JS,
  fonts and scenario data are inlined. No npm, no bundler, no framework install,
  no API keys, no environment variables.
- It is currently live at **bpcpatientjourney.netlify.app**, last deployed by
  **Netlify Drop** (manual drag-and-drop). That's the problem being solved: drop
  deploys can't be updated from a repo.
- Goal: create a new GitHub repository, push these files, and point the existing
  Netlify project at that repo so future updates are `git push` instead of a
  manual drop.
- Note: the Netlify team is currently on operational credits, so **production
  deploys are paused** until the plan is upgraded or the billing cycle resets.
  Do the GitHub side now; the Netlify link will deploy once deploys resume.

## Files to commit

```
index.html      the whole application — do not modify
netlify.toml    Netlify config (publish ".", no build command)
README.md       what the project is and how to update it
.gitignore
```

## Step 1 — create the repo and push

```bash
cd path/to/this/folder

git init
git add .
git commit -m "Initial commit: BPC patient journey scenario trainer"
git branch -M main

# Requires GitHub CLI (`brew install gh`, then `gh auth login`)
gh repo create bpcpatientjourney --public --source=. --remote=origin --push
```

No GitHub CLI? Create an empty repo named `bpcpatientjourney` at
github.com/new (no README, no .gitignore, no licence), then:

```bash
git remote add origin https://github.com/<username>/bpcpatientjourney.git
git push -u origin main
```

`index.html` is ~600 KB — well under every GitHub limit. No Git LFS needed.

## Step 2 — connect Netlify to the repo

In the Netlify dashboard, in the existing **bpcpatientjourney** project:

1. **Project configuration → Build & deploy → Continuous deployment**
2. **Link repository** → GitHub → authorise → pick `bpcpatientjourney`
3. Settings:
   - Branch to deploy: `main`
   - Build command: **leave empty**
   - Publish directory: `.`
4. Save.

The `netlify.toml` in the repo already declares these, so Netlify should read
them automatically — confirm rather than retype.

Linking a repo replaces the Drop deploy source. The domain
`bpcpatientjourney.netlify.app` stays the same and the currently published site
keeps serving until a new deploy succeeds.

## Step 3 — verify

After the first repo deploy:

- Load `https://bpcpatientjourney.netlify.app` and check the trainer renders and
  a case can be worked through end to end.
- Confirm the deploy log shows "No build command" and publishes 1 file.
- Confirm a trivial push (edit README) triggers an automatic redeploy.

## How updates work from here

`index.html` is **generated output**, not source. New scenario cases and UI
changes are authored in the design tool that produced it and re-bundled into a
fresh single file. To publish:

```bash
# replace index.html with the newly bundled file, then
git add index.html
git commit -m "Update scenario cases"
git push
```

Netlify redeploys on push. Claude Code should **not** rewrite, reformat,
prettify, minify or refactor `index.html` — it is bundled output and any edit
will be lost on the next bundle. Small one-off text corrections are fine if the
same fix is also reported back so it can be made in the source.

## Current content state

Three finished scenario cases (English + Thai), levels 1, 3 and 5 of 5, are in
the live bundle and awaiting sign-off. The remaining 42 cases are still being
written and will arrive as replacement bundles.
