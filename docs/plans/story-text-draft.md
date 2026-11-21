# Story text draft (for owner review, not in the game yet)

Draft copy for a possible "story beats" feature: a one-line intro when a wing starts, a named Rogue Author who bosses room 10
with a taunt, and a line when the wing is cleared. Tone: meme library on the night shift, deadpan, short enough for a
landscape phone banner (≤ 60 characters per line where possible).

**Naming note:** today bosses take a random name from `src/catalogue.js` authors. That list includes a real person
(Rick Astley), a real animal's memorial (Harambe Memorial) and a copyrighted character (Boromir of Gondor). The bosses below
are original characters instead, one per wing, so each wing has a recognisable nemesis. Owner decides whether to (a) use these
fixed bosses in story mode and keep random catalogue authors in endless, or (b) keep random names everywhere.

| # | Wing | Intro (wing start) | Rogue Author (room 10) | Taunt (boss appears) | Cleared line |
|---|---|---|---|---|---|
| 1 | 🛎️ Front Desk | "Clock in. The returns bin is growling." | **Mrs. Overdue**, Keeper of the Late Slip | "Your fines have fines now, dear." | "Front Desk quiet. The bell rings for no one." |
| 2 | 🧸 Children's Wing | "Story time is over. The bunnies didn't hear." | **Captain Crayon** | "I'm drawing outside the lines. And on YOU." | "Nap time, finally. Every last bunny." |
| 3 | 📰 Periodicals | "Yesterday's news wants a word. Several thousand words." | **The Editor-in-Chaos** | "Breaking news: you're done." | "Periodicals filed. Even the crossword is solved." |
| 4 | 📖 Reference Section | "Loud patrons, louder opinions. Bring a SHHH." | **Professor Footnote** | "Ahem. As I said in footnote 4,182..." | "Reference closed. Citations: needed no longer." |
| 5 | 📚 The Stacks | "Aisles so long the bookworms brought snacks." | **The Burrowing Bibliophile** | "I've read every book in here. Twice. Through the spine." | "The Stacks stand still. Mind the worm holes." |
| 6 | 🗄️ Archive | "The ledgers remember every unpaid fine. Every one." | **The Golem Accountant** | "Your balance is overdue. Settle up." | "Archive audited. The books are balanced." |
| 7 | ✏️ Study Hall | "Finals week. Nobody is quiet. Nobody." | **The All-Nighter** | "Sleep is for people who returned their books." | "Study Hall silent. Pencils down." |
| 8 | 💎 Rare Books Vault | "Behind glass, first editions with teeth." | **The Collector** | "Mint condition. Unlike you, shortly." | "The Vault is sealed. Priceless, and quiet." |
| 9 | 🗺️ Map Room | "Wide open floor. Nowhere to hide. Nowhere." | **The Lost Cartographer** | "You are here. Not for long." | "Map Room charted. You are, in fact, here." |
| 10 | 🔒 The Restricted Section | "The last door. Everything banned is awake." | **The Unwritten** | "Every story ends. Yours ends overdue." | "The library sleeps. Shift complete. SHHH." |

## Extra lines (optional)
- **First death in a wing:** "Even librarians need a reshelving."
- **Clearing all 10 wings:** "Night shift complete. The library is quiet. For now."
- **Elite room (room 5) subtitle, per wing:** could reuse the intro's tone, e.g. Vault: "★ The Collector's favourites."

## Where this would go (for the coder handoff)
- `src/story.js` `WINGS`: add `intro`, `boss: { name, taunt }`, `cleared` per wing (pure data, unit test: all present, ≤ 60 chars).
- `startWave()` story banner: room 1 subtitle = intro; room 10 subtitle = boss name; boss spawn shows the taunt as float text.
- Wing-cleared screen (`renderStory`/game over for a cleared wing): show the cleared line.
- Endless: unchanged.
