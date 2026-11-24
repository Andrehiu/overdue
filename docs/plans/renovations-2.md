# Renovations 2.0: three directions

**What we have now (src/meta.js):** 10 Renovations, about **5,190 fines** to buy them all. Spines alone costs 1,176. A full wing clear pays 76 fines in wing 1 and 250 in wing 10, plus a first-clear bonus of 40 to 130. So a late-game player banks about 150–380 fines a run and has nothing left to buy.

**Goal:** give fines places to go that change *how* a run plays, with no free perks and no stat inflation. The 1.14.0 balance pass handles difficulty separately.

---

## A. The Book Bag: kits you equip before a run

**Pitch:** "Pack your bag." You buy **kits** once. Before each run you equip 1 of them (more slots can be bought later). Every kit gives a gain and has a cost, so the run plays differently from the first room.

**Why spend:** each kit is a new way to play. Kits also fit wing themes: tight mazes (wings 5, 10) and the open Map Room (wing 9) each reward a different bag. That gives late wings an answer that comes from planning, not from bigger numbers.

| Icon | Name | Caption (≤ 8 words) | Cost | Trade-off |
|---|---|---|---|---|
| 🎒 | Second Strap | Equip 2 kits at once | 400 | none (slot) |
| 🎒 | Third Strap | Equip 3 kits at once | 900 | none (slot) |
| 🔦 | Night Owl Lantern | Bigger lantern, see enemies coming | 60 | −1 max heart |
| 🧱 | Bookend Brace | Shelf perks show up twice as often | 90 | Other perks show up less often |
| 🏃 | Returns Cart | Dash twice in a row | 150 | SHHH! recharges 30% slower |
| 🤐 | Shush Badge | SHHH! reaches 40% further, stuns longer | 120 | −15% throw speed |
| 🎲 | Gambler's Tote | Mystery Shelf prize: reroll it once | 200 | Fewer Break Rooms offered |
| 🩹 | Patched Coat | Heal 1 heart after each elite room | 250 | −10% move speed |
| 💀 | Forbidden Satchel | Start with a cursed book you choose | 300 | The curse applies all run |
| 📏 | Due-Date Stamp | Every 3rd room: +1 perk choice | 500 | Rooms carry 10% more enemies |

**How it ties in:** perks keep their 3/3 cap. Bookend Brace only changes card *weights*, never what the cards do, so combos and Masterworks work as they do now. Forbidden Satchel works well with the planned cursed-book rebalance (take it or walk away). Gambler's Tote changes the Mystery Shelf door, and Due-Date Stamp works through the existing `cards` bonus.
- **Endless:** kits apply in both modes, like today's Renovations. Most are roughly power-neutral, but not all: Second Strap stacks kits, and Patched Coat and Due-Date Stamp only matter in story. New Hall of Fame entries would get an additive `kit` field so a bag icon shows next to the score. Old entries simply have no icon.
- Patched Coat, Gambler's Tote and Due-Date Stamp depend on doors or elite rooms, so they only work in story. Their shop text should say so.

**Save data:** additive fields in `overdue.progress.v1` through `normalizeProgress()`: `kits: { id: true }`, `bag: [id…]` (trimmed to the slots owned), `straps: 0–2`. Unknown ids are dropped. They live in the same key as `fines`, so a purchase saves fines and unlocks in one write. Spending fines from a second key could leave the two out of step.
**Effort: 2.** Each kit is a small `apply` or a `runBonuses` flag, plus one equip screen.
**Balance risk: medium.** Kit pairs can stack badly (Returns Cart + Shush Badge). The bot needs a policy that picks a kit.

**New players:** the bag doesn't exist until the **first clear of wing 1**. Then a one-time card says "🎒 Book Bag unlocked: pack one kit before each run." One empty slot appears on the story screen. The first kit is priced at about one wing-2 run.

---

## B. New Acquisitions: buy new content into your runs

**Pitch:** "The library keeps growing." Fines buy new perks, combos, doors and room events. Once bought, they can show up in future runs. You aren't buying power. You're buying variety, and with it the option of new builds.

**Why spend:** the next run has something you've never seen. The Codex fills up, and each purchase opens a new combo to chase.

| Icon | Name | Caption | Cost | Trade-off |
|---|---|---|---|---|
| 📎 | Paperclip Chain (perk) | Hits chain to one nearby enemy | 80 | Makes the card pool bigger |
| 🧲 | Magnetic Strip (perk) | Fines and hearts fly to you | 60 | Takes a perk slot |
| 🗂️ | Cross-Reference (combo: Paperclip + Dewey) | Chains jump to every marked enemy | 150 | Needs both perks |
| 📓 | Field Notes (Masterwork for Paperclip) | Every 4th hit chains to three | 250 | Needs 3/3 |
| 🔍 | Lost & Found (door) | Pick 1 of 3 owned perks, +1 level | 200 | The room is harder than normal |
| 📖 | Book Club (door) | Swap one perk for another | 180 | Fewer fines |
| 🧯 | Fire Drill (room event) | Rooms can flip to Survive | 120 | none (variety) |
| ⚖️ | Plea Bargain (cursed book) | Double fines; enemies hit for 2 | 220 | Pure risk |
| 🗑️ | Weeding Cart | Take a perk out of your deck | 100 each, max 3 | Fewer surprises |
| 🏷️ | Card Catalogue Index | Door screens offer 3 doors | 400 | none (more choice) |

**How it ties in:** a new perk follows the same perk → combo → Masterwork pattern, so it brings no new rules. Each purchase is a small bundle, and the Codex already tracks them. The doors join `POOL` in `src/doors.js` and must still never make a room easier. Lost & Found's room keeps `applyDoor`'s elite bonus. Plea Bargain is a fourth cursed book for the Mystery Shelf. Weeding Cart reuses Banish's logic, made permanent.
- **Endless:** **story only.** Endless keeps today's card pool, so its waves and Hall of Fame scores stay comparable. Doors and events are story-only already.

**Save data:** additive field `progress.acq: { id: true }` plus `progress.weeded: [perkId…]` (max 3, repaired in `normalizeProgress`). The perk roller gets an `allowed` set. With no purchases it behaves exactly as today.
**Effort: 3.** Each new perk needs art, card text, codex entries, unit tests and a bot check, so one coder can build about 4–6 items per release.
**Balance risk: low–medium.** A bigger pool dilutes perk odds, and Weeding Cart offsets that. New doors need a bot check against "never easier".

**New players:** nothing changes on day one, because the new items aren't in the pool until bought. The shop gets a second tab, "New Acquisitions", after the second run ends. New content is marked "NEW in your library" the first time it shows up in a run.

---

## C. Signature Editions: unlock new weapons

**Pitch:** "Choose what you throw." This builds the parked weapon-types idea as a fines track. You buy weapons and pick one at the start of a run. Every weapon deals about the same damage per second (within ±25%), but each moves and aims in its own way.

**Why spend:** this is the biggest change to how the game feels. Perks you already know play differently with each weapon: Bookmark on Index Cards gives a ricochet storm, and Plot Twist on the Encyclopedia gives a battering ram.

| Icon | Name | Caption | Cost | Trade-off |
|---|---|---|---|---|
| 📘 | Paperback (default) | Steady, reliable throws | owned | none |
| 🗃️ | Index Cards | Fast flurry of light cards | 150 | Low knockback |
| 📕 | Encyclopedia | Slow, heavy, knocks enemies back | 250 | Slow throw speed |
| 🗄️ | Card Drawer | Five-card spread up close | 350 | Short range |
| 🖋️ | Ink Pot | Lobbed; leaves a sticky puddle | 450 | Arcs over enemies, slow |
| 📜 | Scroll Boomerang | Comes back to you, hits twice | 550 | You must catch it |
| ✨ | Gilded Cover (per weapon) | That weapon's own Masterwork card | 300 each | Needs that weapon's perk at 3/3 |
| 🎨 | Edition Colours | New book covers, blue shades only | 40 each | Cosmetic only |

**How it ties in:** every perk must make sense with every weapon, or that weapon takes it out of its card pool. Ink Pot has no use for Bookmark. That's the main cost of this direction. Combos stay as they are, and each weapon gets one Masterwork through Gilded Cover. Auto-aim stays as it is, and Ink Pot lobs over shelves on purpose. Cursed books and doors don't change.
- **Endless:** **story only at first.** Endless stays Paperback-only, which keeps the Hall of Fame pure. If endless gets weapons later, they go on a separate board column.
- Edition Colours is the cosmetic side sink. Covers stay in library blue, with patterns like stripes, gilt edges or cloth texture.

**Save data:** additive `progress.weapons: { id: true }`, `progress.weapon: 'paperback'` (repaired to `'paperback'` if missing or unknown), `progress.gilded: { weaponId: true }`.
**Effort: 5.** Each weapon needs a projectile and hit model, its own perk-pool rules, a perf check (Index Cards puts a lot of projectiles on screen) and bot runs for each weapon. That's 2–3 coder sessions.
**Balance risk: high.** With 15 perks × 6 weapons, outliers are likely. The perf budget for a wave-15 boss with a stacked build (≥ 0.85× speed, ≥ 50 fps) must hold for every weapon.

**New players:** weapons stay hidden until the **wing 2 first clear**. A one-time card then offers Index Cards as a trial for the next run. After that, Paperback is the default and the weapon picker is one row on the story screen.

---

## Comparison

| | A. Book Bag (kits) | B. New Acquisitions | C. Signature Editions |
|---|---|---|---|
| Fun / variety | ●●●○ new run shapes | ●●●○ new things to find | ●●●● biggest change in feel |
| Clarity for new players | ●●●○ one slot, gated | ●●●● invisible until bought | ●●○○ more to learn |
| Build effort (1–5) | 2 | 3 (ongoing) | 5 |
| Balance risk | medium | low–medium | high |
| Fine sink depth | ~3,600 | ~1,760 now, grows with each content drop | ~4,000+ (with Gilded Covers + colours) |
| Endless / HoF | both modes, kit icon on entries | story only | story only (at first) |
| Helps late wings without stats | yes (fit kit to wing theme) | some (Lost & Found, 3 doors) | yes (weapon fits the room) |

## Recommendation

**Build A + B together, A first, and keep C as the big feature for later.**

- **A (Book Bag)** is cheap, about one coder session. It changes how a run plays on day one of the feature, and it gives late wings answers you plan for instead of bigger numbers.
- **B (New Acquisitions)** becomes the ongoing sink. Each later release adds 3–5 acquisitions, so fines keep having a place to go without a big redesign.
- **C (Signature Editions)** is the most exciting but costs the most and carries the most risk. Revisit it after the 1.14.0 balance pass settles the curve. Ship Edition Colours early as a small cosmetic sink.

For both A and B, measure with the balance bot before shipping. The story-meta tests stay green: no kit, door or acquisition may make a room easier. Endless only gains the kit icon on new Hall of Fame entries.
