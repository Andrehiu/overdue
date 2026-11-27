You are the planner session for Overdue ("Overdue · planning 7"), not a coder.

Read CLAUDE.md, then ROADMAP.md "Current state" (written by planning 6, commit 4653620 or later). Keep using the planner branch
`claude/brave-galileo-jyg38o` (= main + docs; check `git status` says you are ON that branch before committing, planning 6 once committed
on a detached copy of main by mistake). Follow the owner's working rules (short tables, end with the one thing needed, filtered tool output,
one docs commit per conversation where possible).

## First thing: the owner starts with a PLAYTEST
Playtest mode (owner rule): only log the owner's notes as a numbered list (bug / fix / feature / balance), one short line each, and start
nothing (no coders, no testers, no fixes, no investigations) until the owner says "done testing". Then propose how to split the notes
into releases (small fixes first, batched; 3 options with a pick where it's a design choice). Start your first reply with a one-line
"Ready for playtest notes. Live: v1.17.0" and nothing else heavy.

## State at handover (2026-11-27)
- **Live: v1.17.0 (a8191e8)**, Pages + CI green. Shipped 26 Nov: 1.16.2, 1.16.3, 1.16.4, 1.17.0 (details in ROADMAP).
- **No coders or testers running.** Finished sessions (not archived; owner archives himself, don't archive on your own):
  coders 1.16.2 `session_014kswNmfiiQKdCmUrzteg2D`, 1.16.3 `session_014kswNhXrL8KCuKhNuJym7M`, 1.16.4 `session_014kswNkpbEH5rLwmrqQdJ9Y`,
  1.17.0 `session_014kswNitTbPzGKAChHp7FV8`; testers 1.16.2 re-test, 1.16.3, 1.16.4, 1.17.0.
- **Usage:** weekly usage warning active (resets Sun 29 Nov 09:00 SGT). Owner rations: one coder at a time unless he says otherwise,
  lean testers (no bot unless balance changed), balance bot runs ONCE per release (tune only a wing > ±8 pts off, one re-run), full Act II
  tuning once after wing 20. Owner resumes usage-limited sessions himself: don't auto-resume; tell him which session stopped.
- **Owner's phone checks pending** (ask for results after the playtest if he doesn't mention them): cursed books never free from Head Start;
  no blue aim circle after iOS swipe / Control Centre / app switch; Harbourmaster ship fully visible in the top lane vs notch, clear of the
  HP bar in the bottom lane; wall gaps reachable with a thumb; anchor circle + ram line readable; golems not stuck in island rooms.
- **Known balance:** bot (max Renos, 60 runs) w10 52%, w11 42%, w12 30%, w13 28%, w14 15% (target 25), w15 13% (target 22). Wings 14–15 are
  hard on purpose until the full Act II tuning. If the owner finds 14–15 or the Harbourmaster unfair, that's a balance note for the list.
- **Parked / next (after the playtest releases):** wings 16–20 + Old Inkmaw (giant eel, Act II finale; design page
  https://claude.ai/artifact/Y2okcfTgkycMZzwahoxEWB option B); Book Bag (Renovations 2.0, `docs/plans/renovations-2.md`) before 16–20;
  eel-only room stall (HUNT.maxLeft, wing 11 room 8); QA flake pass (rare one-off failures in older auto-aim / wing-cleared checks);
  late-boss perf check sits at its 3-valid-sample minimum (one-line fix if CI fails on it).
- **Sessions:** tag every new session `overdue` + role tag. The "Overdue Game" sidebar group is manual (owner drags sessions in); starting
  from the planner branch does NOT add a session to it (tested). Coders can only message their parent planner, so create coders from
  this session; put your session id in each handoff's "Report back" line.
- **Ship rules:** fast-forward main only on the owner's "ship" (or "ship if good" after your own review + green QA); confirm "Deploy to
  GitHub Pages" + CI green for that commit before saying live; failed deploy with "Fetching artifact metadata failed" → fresh
  workflow_dispatch, never "re-run failed jobs".
