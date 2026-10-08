---
name: wrap-session
description: Update docs/ai/STATE.md to match reality at the end of a work session — branch status, work in progress, gaps, next steps, and a capped session log.
disable-model-invocation: true
---

# Wrap session

`docs/ai/STATE.md` is the hand-off note between sessions and between agents
(AGENTS.md rule #8). It is only useful if it describes reality, so this rewrites
it from evidence rather than from memory.

## 1. Gather evidence — do not skip, do not guess

```
git status --short
git log --oneline -8
git diff --stat HEAD
git branch --show-current
```

Also re-read the current `docs/ai/STATE.md` so you know what is being replaced.

If something in the existing file contradicts what you observe, the observation
wins. If you cannot verify a claim either way, delete it rather than carry it
forward — a stale STATE.md is worse than a short one.

## 2. Rewrite, do not append

Keep the existing section structure and rewrite each in place:

- **`_Last updated:`** — today's date, `YYYY-MM-DD`. Never a relative date.
- **Branch & repo status** — current branch, whether the tree is clean, recent
  merged work.
- **Work in progress** — only genuinely unfinished work. If a section describes
  something that has since been committed and finished, delete the section and
  fold a one-liner into "What works today".
- **What works today** — verified working features. Do not add anything you did
  not see run or test.
- **Known gaps / not production-ready** — add gaps discovered this session,
  remove ones that were closed.
- **Next steps** — the owner's apparent intent. Mark inferred items as
  inferred; this file is read as fact by the next agent.
- **Session log** — prepend one entry, newest first, then **truncate to the
  last 5 entries.** Format:

  ```
  - **YYYY-MM-DD** — What changed, in one or two lines. Files or areas touched.
  ```

## 3. Rules

- Facts only. No plans you did not verify, no "should work", no aspirations.
- Never let the file grow monotonically — it is a snapshot, not a changelog.
  Git history is the changelog.
- Do not touch anything but `docs/ai/STATE.md`. If `CONVENTIONS.md`,
  `ARCHITECTURE.md`, or `AGENTS.md` turned out to be wrong during the session,
  say so in your reply and let the user decide — those are not this skill's job.
- Run `pnpm format:write docs/ai/STATE.md` (or `pnpm format:check`) afterwards
  so Prettier does not fail CI on the file.

## 4. Report

Reply with a short diff summary: which sections changed, what was dropped, and
anything you deliberately left out because you could not verify it.
