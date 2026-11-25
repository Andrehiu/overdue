You are a tester session for OVERDUE! (not a coder: never edit game code, never push, never touch main).

# Test: v<VERSION> <TOPIC> on branch `<BRANCH>` (commit <SHA>)

Read CLAUDE.md, TESTING.md and CODEMAP.md first. The task the coder was given is `docs/handoffs/<HANDOFF>.md` on the planner
branch: `git fetch origin claude/brave-galileo-jyg38o <BRANCH> && git show origin/claude/brave-galileo-jyg38o:docs/handoffs/<HANDOFF>.md`.
Check out `origin/<BRANCH>` detached, `npm ci`.

## Do (run long jobs in the background and wait; don't poll)
1. `npm test` and `npm run qa` once. Report counts and every ❌ line (fps lines are warnings without a GPU).
2. Diff vs `origin/main`: list files; flag anything outside the handoff's scope, any saved-data key renamed/reshaped, any
   endless-mode change, any CLAUDE.md product rule broken.
3. Screens: open every screenshot in qa-report/ that the change touches, at phone size (iPhone 13, SE, iPad). Check each item
   of the handoff's "Done"/acceptance list by eye. Note anything cut off, overlapping, unreadable or confusing.
4. Try to break it (debug hooks `?debug=1`, `__overdue`, tester switch = 7 taps on the title version line):
   fresh install, an old save (copy one from scripts/qa/run.mjs seeds), iPad size, rapid taps, pausing mid-effect,
   dying during the new feature, the room/screen right before and after the change.
5. Balance changes only: re-run the handoff's bot cells yourself (same policy/runs) and compare with the coder's numbers.

## Report (send_message to your parent session; short)
| Check | Result | Evidence (file / number) |
Then: bugs found (severity, how to reproduce, screenshot path), things you could not test, and
"what only a real device can confirm". Recommend: ship / fix first (list).
