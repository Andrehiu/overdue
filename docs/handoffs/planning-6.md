You are the planner session for Overdue ("Overdue · planning 6"), not a coder.

Read CLAUDE.md, then ROADMAP.md "Current state" (written by planning 5, commit 88010a7 or later). Keep using the planner branch
`claude/brave-galileo-jyg38o` (= main + docs). Follow the owner's working rules (tables, one thing needed, filtered tool output,
one docs commit per conversation where possible) and the usage rules in ROADMAP "Usage": one start check per session, then wait for the
coder's report message (it wakes you) plus one late fallback check; no frequent progress polling.

## State at handover (2026-11-25 ~13:50 UTC)
- **Live:** v1.16.1 (6e23f80), Pages + CI green.
- **1.16.2** coder `session_014kswNmfiiQKdCmUrzteg2D`, branch `claude/buttons-bannedbook` (rebased on 1.16.1). Owner said **"ship 1.16.2"**
  with Banned Book **A = +50% damage** (keep pierce 1, lose ⅓ max hearts). Coder is (1) applying +50%, (2) fixing a flaky QA check
  "act2 · no ground enemy stands still at a shore" (fails in the full `npm run qa`, passes with `--only=act2`, failing room changes per run;
  likely state carried over between QA areas; owner rule: make it deterministic, never loosen/skip), (3) full QA twice + 60-run
  take/walk bot pair (`--wings=4,7,10 --renos=half --policies=mystery --cursed=take|walk`). The 1.16.2 tester (`session_014kswNkdTkdwNKhsVebkjUq`)
  already passed this build except balance; no re-test needed for a one-number change, but if the flake turns out to be a real game bug
  fixed in game code, send the tester a short re-check list first.
  **On a green report:** review the diff vs origin/main (only 1.16.2 scope + the QA fix), run `npm test` yourself, fast-forward main
  (`git push origin origin/claude/buttons-bannedbook:main`), confirm "Deploy to GitHub Pages" + CI green for that commit (fresh
  workflow_dispatch if deploy fails; never "re-run failed jobs"), then tell the owner it is live with a phone checklist (DASH/SHHH reach in
  the corner, pause clear of the iOS status pill on their iPad, Skip button position, Banned Book −⅓ hearts). Archive coder + tester.
- **1.16.3** coder `session_014kswNhXrL8KCuKhNuJym7M`, branch `claude/playtest-fixes`, handoff `docs/handoffs/1.16.3-playtest-fixes.md`
  (screens fit without scrolling + QA check; Renovations "Now → Next"; Trilogy books side by side, 2–4 in a row). Started 13:42 UTC;
  it branches after 1.16.2 is on main. Needs a tester (template `docs/handoffs/tester-template.md`, full prompt inline) and the owner's own "ship".
- **Owner approved plan:** wings 13–15 next (gentle steps, max-Reno bot targets ~28 / 25 / 22%, wing 15 new boss), then Book Bag
  (Renovations 2.0, `docs/plans/renovations-2.md`) before wings 16–20. **Your first new task: a 3-option page for the wing 15 boss**
  (concept, attack patterns, how it fits The Sunken Stacks look; read `src/story.js` Act II wings and the Act II look artifact
  https://claude.ai/artifact/9wgzQWpVvdovMR5fiGdu95). Owner answers with a letter; then write the 13–15 handoff.
- **Owner is not playtesting** right now ("done testing" given). Next playtest notes: numbered log only until "done testing".
- Scheduled checks from planning 5 were cancelled; set your own (start check of whatever you start, one fallback check per coder).
