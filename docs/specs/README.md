# Spec-Driven Development (SDD)

Every non-trivial change (new tool, new endpoint, schema change, refactor touching
3+ files) gets a spec **before** any code is written. Trivial fixes (typos, one-file
bugs) don't need one.

## Why

Specs let a human review the plan cheaply, keep AI agents on-rails across
sessions, and leave a record of _why_ something exists. The spec is the contract;
the code is the implementation of it.

## Workflow

1. **Create** `docs/specs/NNN-short-slug.md` from [\_TEMPLATE.md](_TEMPLATE.md).
   `NNN` = next free number (001, 002, …).
2. **Fill sections 1–6** (the _what_ and _how_). Stop. **Get the spec approved**
   by the owner before writing code — post it, ask, wait.
3. **Implement task by task** (section 7). Check off tasks as you complete them
   — the checklist is the cross-session progress tracker. Small commits,
   one logical step each.
4. **Verify** using section 8 — actually run the app/tests, don't just build.
5. **Close**: set Status to `Done` in the header, add a completion note in
   section 9, and update [../ai/STATE.md](../ai/STATE.md).

## Rules for agents

- If you're implementing and there is no spec: write one first (steps 1–2).
- If reality diverges from the spec mid-implementation: **update the spec**, note
  the change in section 9, then continue. Never let spec and code silently drift.
- One spec = one PR/branch (`feature/NNN-short-slug`) whenever possible.
- Keep specs short. A spec longer than ~150 lines usually means the change should
  be split into two specs.

## Index

| #   | Spec       | Status |
| --- | ---------- | ------ |
| —   | _none yet_ | —      |

(Keep this table updated — it's how agents discover active work.)
