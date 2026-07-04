# CLAUDE.md — project-scoped rules for Amble

Loaded by Claude Code at the start of every session in this repo. Global user preferences live in `~/.claude/projects/…/memory/MEMORY.md`; this file holds rules that are specific to the Amble codebase and should apply regardless of who's collaborating.

## Manual-action steps → NEXT-STEPS.md, ALWAYS

**EVERY time** the user has a manual step to take — even a single "click Save in Firebase Console" — write it to `NEXT-STEPS.md` at the repo root, not only in chat.

- Trigger: any manual action. Console click, URL to open, terminal command, secret to paste, file to download. No matter how small.
- Also mirror in chat as a short summary — but the file is the copy-friendly source of truth.
- Include: raw URL (not markdown link so it's copy-able), exact commands, exact values, one-line "why".
- `NEXT-STEPS.md` is gitignored — it's a scratch pad, overwrite each time, don't accumulate history there.

**Why:** the user cannot reliably copy-paste from the chat pane and forgets manual steps mentioned only inline. They've flagged this multiple times. Any lapse is a bug.

## Bug screenshots → `error screenshot/`

When the user references a screen error or says "cf screen", the file is in `error screenshot/*.png` at the repo root (gitignored, personal to Robin).

- Go read it directly. Don't ask where.
- After the fix is confirmed, move the file to `error screenshot/archived/` with a timestamp prefix:
  ```bash
  mv "error screenshot/<file>" "error screenshot/archived/$(date +%Y-%m-%dT%H-%M)_<slug>.png"
  ```

## Product context (short)

Amble is a React Native + Expo iOS app that turns Instagram screenshots into a personal map, with a full social layer (follow / feed / activity / save-from-network). The full spec is in `docs/PRD.md`. The 9 social V1 slices are all merged and deployed.

## Codebase conventions

- **Single seam** per domain: `src/services/lieuxService.ts` for pins, `src/services/socialService.ts` for the social graph. UI never touches Firebase directly — go through the seam.
- **Test at the seam**, not at Firebase or React internals. Prior art: `src/services/__tests__/lieuxService.test.ts`, `src/services/__tests__/socialService.test.ts`.
- Cloud Functions live in `functions/src/`, deployed to `europe-west1`.
- Firestore rules in `firestore.rules`, indexes in `firestore.indexes.json` — both deployed via `firebase deploy --only firestore`.
- No new npm deps without a real reason (RN primitives cover most needs). CI runs on PRs (see `.github/workflows/ci.yml`).

## Deployment shortcuts

- `firebase deploy --only firestore` — rules + indexes
- `firebase deploy --only functions:<name>` — one function at a time is safer
- `npm run emulator:start` + `npm run emulator:seed` + `npm run dev:emulator` — full local stack (added in PR #31)

## Docs to reference

- `docs/PRD.md` — product spec
- `docs/testing-social.md` — how to test the social layer
- `docs/curation-playbook.md` — editorial rules for the Amble Curated accounts (LLM curation IS forbidden here)
- `docs/app-store-metadata.md` — App Store copy, positioning
