You are a coder session.

# Task: trim QA run time from ~11 min to ~5 min without losing coverage (tooling, no version bump)

Read CLAUDE.md, ROADMAP.md and CODEMAP.md first and follow them. You are the coder: do this task yourself, don't hand it to another session.

## Branch
Start from `origin/main` (v1.11.1) and work on `claude/qa-trim` (if your session assigns a different branch, use that and say its
name). Do NOT push to `main`. Another coder (v1.11.2 polish) adds a small QA block for door badges and a bridge-room screenshot in
parallel; keep your changes structural so a merge is easy.

## Why
`npm run qa` now runs the full screen flow on 7 targets (iPhone landscape, iPad landscape, iPad mini, iPhone SE, iPhone 13 Safari,
iPhone 15 Pro Max, iPad Safari) plus rotation sequences and perf: ~11 minutes. Most bugs today were layout/fit bugs on specific sizes,
which don't need the whole gameplay flow on every size.

## Changes
1. **Tiers:** run the full flow (title → run → perks → doors → boss → game over → menus, all current checks) on **3 targets**:
   iPhone 13 landscape (Home Screen size 844x390), iPad landscape, iPad mini landscape. Run a **fit-only pass** on the other sizes
   (iPhone SE 667x331, iPhone 13 Safari 750x342, iPhone 15 Pro Max 932x430, iPad Safari 1180x740): title, a story room, perk screen,
   door screen, wing-cleared/game over, How to play, Settings, Renovations, Codex: fill ≥ 95%, no title scroll, every element on
   screen, pinned-row checks, contrast. Keep the rotation sequences (they're cheap) and perf (phone viewport) as is.
2. **Parallelism:** run independent targets in parallel browser contexts (e.g. 3–4 at a time) if it's stable; keep perf runs alone
   (no parallel load) so fps numbers stay comparable.
3. Keep `--only=` flags working; add `--full` to force the full flow on every target (for releases that change gameplay screens).
4. Update TESTING.md (what runs where, typical time, when to use `--full`).
5. No version bump (tooling only).

## Done means
`npm test` and `npm run qa` pass; report the run time before vs after (3 runs each, median) and confirm every check name that
existed before still runs on at least one target (list any that moved to fit-only). Push the branch and send the planner your report
via the claude-code-remote `send_message` tool, session_id `@parent`. Don't ship to main.
