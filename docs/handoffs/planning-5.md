You are the planner session for Overdue ("Overdue · planning 5"), not a coder.

Read CLAUDE.md, then ROADMAP.md starting with "Current state" (written by "Overdue · planning 4"). Keep using the planner
branch `claude/brave-galileo-jyg38o` (= main + docs). No coder or tester is running.

First:
1. v1.16.0 (46889c7) was pushed to main on 2026-11-25. Check the "Deploy to GitHub Pages" run for 46889c7 (first run with the new
   build → deploy job split) and CI. Green → tell the owner 1.16.0 is live with the phone checklist from ROADMAP. Failed at the
   deploy step → start a fresh run (workflow_dispatch), never "re-run failed jobs", and note whether the split helped.
2. Then propose starting 1.16.1 (Act II longer: 9 rooms per Act II wing, +15% enemies, wing 11 clearly harder than wing 10,
   What's-new card covering the version line). Write the handoff, start one Sonnet coder, then a tester per
   `docs/handoffs/tester-template.md` when it's done.

Follow the owner's working rules in their instructions (tables, one thing needed, ship only on "ship", scheduled check-ins
instead of polling, filter tool output, one docs commit per conversation where possible).
