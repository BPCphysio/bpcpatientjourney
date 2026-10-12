# BPC Patient Journey trainer

Live at https://bpcpatientjourney.vercel.app/ (Vercel, deploys on push to `main`).
See README.md for what lives where. Before every push: `python tools/preflight.py`.
The staff site is built from `web/` with `cd web && npm run build` (output in `trainer/`, committed).

## Rules from the clinic
- Zero spending. Nothing paid, anywhere. The site's Claude marker runs only on the plan's API credit (Haiku), capped at $15/month; don't run batches of Claude calls (tests, re-marking) without asking first.
- Write "physiotherapist", never "physio" (Thai: นักกายภาพบำบัด). Dates day/month/year.
- Thai must be natural everyday clinic Thai, not translated.
- Never delete staff answers or marks. Retire a case from new sets instead.

## Tools (all free; installed 12/10/2026)
- **Playwright MCP** (`mcp__playwright__*`): click through the live or local site like a user and read the page. Use it to test a flow end to end before saying it works: start screen → case → reveal → submit; Clinic staff → marking → save; "Try version 2". Check English and Thai, and a phone-sized screen.
- **Chrome DevTools MCP** (`mcp__chrome-devtools__*`): console errors, failed requests, Core Web Vitals, Lighthouse. Use it when something is slow or broken, especially on phones.
- Both only load in a session started after they were installed; if the tools are missing, start a fresh session in this folder.
- **Vercel skills** (load automatically): `web-design-guidelines` for UI and accessibility reviews of `web/`, `vercel-react-best-practices` and `vercel-composition-patterns` for React changes, `vercel-optimize` for speed, `deploy-to-vercel` if a deploy needs help, `writing-guidelines` for copy.
- **Superpowers plugin**: brainstorming, writing-plans, systematic-debugging, test-driven-development, verification-before-completion. Use it for anything bigger than a quick fix.
- **gws** (Google Workspace CLI) and **clasp**, signed in with the clinic's Google account: read or write the People and Markers sheet and the Apps Script backup directly when needed. Writing to the clinic's Google files still needs the owner's OK.
- Testing that writes to the real clinic record (e.g. submitting a test answer on the live site) leaves a row only the passcode holder can delete, so prefer the local test copy (`.claude/launch.json`: `neontest` + `webtest`).
