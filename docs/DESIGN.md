# Orbital Fury: Design Document

**Version 0.53.9 · 8 November 2026**

This is the design reference for Orbital Fury. It brings together the first pitch, the original design document (revisions 1 to 12), the difficulty policy decisions, the release notes in the [README](../README.md), and the design notes kept for each release. It describes the game as it stands, the principles behind it, how it got here, and how we work on it, so the next update starts from the same understanding.

When this document and the code disagree, this document states the intent and the code is the bug, unless a later decision changed the intent. In that case, update this document.

## Contents

1. [What Orbital Fury is](#1-what-orbital-fury-is)
2. [Design principles](#2-design-principles)
3. [The game, element by element](#3-the-game-element-by-element)
4. [How it came together](#4-how-it-came-together)
5. [How we work](#5-how-we-work)
6. [For the next update](#6-for-the-next-update)
7. [Related documents](#7-related-documents)

---

## 1. What Orbital Fury is

Orbital Fury is a free browser game made for the **Super Earth Special Forces (SESF)** Helldivers 2 community. You are the gunner on a Super Destroyer in orbit. Four Helldivers drop to the planet below and fight on their own. You watch through a thermal view and keep them alive: you scan with the UAV, call orbital and Eagle strikes, fire the ship gun, drop and command SEAF troops, and have those troops build a defensive line.

You never control the Helldivers. They pick their own route, call their own stratagems and decide when to extract. What you do from orbit decides whether they get out.

- **Where it runs:** any modern browser on a computer, tablet or phone, at [orbitalfury.com](https://orbitalfury.com). There is nothing to install.
- **Who made it:** Robert Troumbley (RamziesSGXR), Head Admin of the SESF, with SESF members as testers. Claude (Anthropic) was used as a coding assistant.
- **What it is not:** an official product. It is an unofficial fan project, uses no Arrowhead or Sony assets, and sells nothing.

### The core loop

1. **Operation.** Start an operation (Quick Play or the campaign) at a level from 1 to 10.
2. **Armory.** Spend credits on stratagems, upgrades, SEAF and buildings.
3. **Mission.** The squad drops after a 30-second countdown and goes for the objective. You support it in real time.
4. **Debrief.** The result, the pay and a rank. Then choose a commendation and the next mission from three offers.
5. **Repeat.** Each mission is harder than the last. The operation ends when a mission fails or you end it yourself, and the final score is posted to the SESF Discord.

---

## 2. Design principles

These are the rules the game has been built on. Most were written down early and then sharpened by playtests. Each one says where it came from, because knowing why a rule exists is what lets you decide when it applies.

### 2.1 You are fire support, not the squad

The Helldivers play themselves. The player aims, scans, drops and commands SEAF, but never gives the Helldivers an order.

*Origin:* the first pitch (26 October 2026) and revision 2, which made it explicit: "Helldivers are never directed." Revision 4 removed the free-fire guns and turret control so the player "runs the sky and SEAF, and nothing else."

*In practice:* when the squad does something dumb, fix the squad's AI (`js/sim/planner.js`, `squad.js`, `helldiver.js`). Don't add a way for the player to order them.

### 2.2 The gunner is needed

From level 3 up, the Helldivers lose without you. Supporting them, instead of hitting something else, is the main choice in the game: every minute spent covering them is a minute not spent elsewhere.

*Origin:* revision 10 (0.10.0). Before it, the squad could win alone. After it, the squad won 2 of 18 first missions with nobody at the controls, and 12 of 12 with the bot gunner. Today about 5 in 18 survive alone at level 3.

*In practice:* the balance test `test/difficulty.mjs` checks that nobody at the controls loses from level 3 up. A change that lets the squad win alone breaks this principle.

### 2.3 Protect the dots

Your strikes hurt your own side. Allies show as bright marks on the thermal view, and careful aim beats volume of fire. The **ship gun** is the one exception: it never hurts allies, so there is always a safe tool.

*Origin:* the first pitch's pillar "Protect the dots." Revision 6 added trigger discipline (nobody fires through a friendly) and allies who run out of a marked blast.

### 2.4 Difficulty only climbs

- **Between missions,** difficulty never steps down. The starting level only moves you further along the same climb.
- **Inside a mission,** pressure never flattens out or ends easier than it started, even after the bases are down.
- **Destroying a base is a real, felt win.** That spawner is gone for good, and the alert spike it caused drops.
- **Every run ends.** Player power stops growing once the armory is full, while the climb goes on. The war outgrows you eventually, and that is by design.

*Origin:* the difficulty policy decisions (November 2026), built on revision 4's "a session that only ends in failure."

### 2.5 Levels mean something

Level 3 is easy, level 6 is hard, level 9 is very hard, and it keeps climbing past 10. At the same level, each enemy faction should be about as hard as the others.

*Origin:* restated by the project lead on 8 November 2026, and built into 0.53.8 with a bot sweep of 12 missions per cell.

### 2.6 Choices, not just numbers

Every system should hand the player a decision.

- **SEAF:** workers inside a work site or guards outside it.
- **Next mission:** three offers, each with a difficulty bump and matching pay. There is no easy option.
- **Troops:** a troop mix chosen before the mission, instead of more of everything.
- **Time:** the squad asks for more time near the end, and you decide whether to pay for it.

*Origin:* the decisions on mission choice, work sites and SEAF balance (0.50 to 0.52). They followed the finding that "SEAF in large numbers make the player very powerful."

### 2.7 Readable at a glance, on any screen

- **Layout:** the screen is laid out like a real-time strategy game (Age of Empires was the model), with nothing on top of anything else.
- **Phones:** the phone is a first-class layout, not a shrunken desktop.
- **Panels:** the command panel keeps the same height in every context, so nothing jumps.

*Origin:* 0.20 (the RTS layout), 0.21 (three layouts), and 0.42 (phones running hot and cramped, reported by SESF testers).

### 2.8 Nothing borrowed, nothing to install

- **Art:** every picture is drawn in code.
- **Sound:** every sound is synthesised live, and the music is composed in code.
- **No outside files:** there are no image or audio files, no game engine, no frameworks, and no third-party libraries in the game.
- **No account or server.** The game is one static site.

*Origin:* the first pitch's pillar "Cheap to build and host," and the need to stay clear of Arrowhead's and Sony's assets. It also keeps the game small and fast on phones.

### 2.9 Built with the community

- **Sharing:** every ending screen has a report to paste into Discord, and the SESF feed announces each operation.
- **Feedback:** players' reports drive the fix releases.
- **Credits:** every tester is credited by name.

*Origin:* the first pitch ("short, shareable runs" ending in a block of text to paste), and the way the game has been tested since its first week.

### 2.10 One game, three languages

The game is in English, French and Spanish, and every string exists in all three. Operation names, callsigns and Discord reports stay in English, so posts read the same in the channel whoever wrote them.

*Origin:* revision 10. KTL (P.H.A.N.T.O.M. Helldivers) reviews the French.

---

## 3. The game, element by element

This section is the map of the game as of 0.53.9. The [README](../README.md) has the player-facing detail, with every control and number. This section explains what each part is for.

### 3.1 The gunner's tools

| Tool | What it does | Why it's there |
|---|---|---|
| **UAV scan** (slot 1) | Opens a timed circle of vision you can strike into. Allies under it dodge more and move faster. Its radar sweeps the whole map every few seconds and leaves blips. | Vision is the gunner's first resource. You can only hit what someone can see. |
| **Orbital strikes** (slots 2 to 6) | Precision, barrage, 380 mm, railcannon, laser, gas, EMS, napalm, smoke and more. They land only inside the **strike zone** around allies or a UAV circle, and they hurt allies. | The main damage, and the jobs troops can't do. One precision strike kills one base spawner. |
| **Eagles** (Hangar tab) | Fast strikes. Each Eagle slot has its own runs, then the Eagle flies back to rearm. You can rearm early with `0`. | Fast answers with a cost in time. |
| **Minefields** | Only the enemy sets them off, but the blast hurts anyone near it. | Area denial for a line you can't hold with troops. |
| **Utilities** | Med pod, smoke, shield dome and sentry. They are safe to drop on allies. | Ways to help the squad instead of hurting the enemy. |
| **Ship gun** (slot 8) | Hold to fire anywhere you can see. It has heavy penetration, never hurts allies, and refills by itself. | The one tool ready at the drop, and always safe. |
| **Artillery cannon** (slot 9) | A mini-nuke on a slow recharge. It only fires while crewed, and it can be built or captured. | A big late-game choice with friendly-fire risk. |
| **Classified** | Four over-the-top stratagems for ranks 6 to 9, such as Super Earth's Final Word. | A reward for long operations. |

**Rules that shape aiming:**

- **The vision ladder (0.47).** Allies see farthest. They shoot less far than they see, and throw a stratagem beacon less far than they shoot. The strike zone always sits inside what the player can see. This cured enemies spawning beyond sight and walking in, and it made the strike range upgrade meaningful.
- **Shooters give themselves away.** An enemy firing on allies is marked, and after three seconds it is locked. Your strikes can then hit it outside the zone.
- **Facing matters.** Hits from behind do 1.5× damage, and 2.2× on heavies. Every unit shows which way it faces.
- **Critical hits** do double damage. Orbitals crit most often.

The catalogue holds 48 stratagems in all (`js/data/strat.js`). Twenty-eight are the gunner's: 17 orbitals (the utilities and three Classified included), 8 Eagles (Eagle Squadron included) and 3 minefields. The rest belong to the Helldivers.

### 3.2 The Helldivers

Four AI Helldivers with **20 lives every mission**. They are not upgraded in the armory.

**Kit:**

- **Weapons:** a Liberator, an Ultimatum (one round that kills anything in about 9 m), six grenades and stims.
- **Stratagems:** their own, on separate clocks, always including at least two orbitals and leaning toward heavy weapons.

**The planner** (`js/sim/planner.js`) runs the squad's decisions:

- **Main objective:** they go for it, and take side missions near the way while the clock allows.
- **Bases:** they mark an enemy base and wait about 18 seconds before going in. That pause is your window to soften it.
- **Breaking off (0.40):** they pull back when a fight is lost, which means three deaths close together or a big wave coming in. They head for a quiet side task or a scored fallback point.
- **Full clear (0.53.7):** after the objective, they go for a full clear of every base and side mission in 4 missions out of 5 when they have more than three lives. The roll is seeded per mission. Near the end they may ask for up to 2 more minutes, once.
- **Extraction:**
  - A Helldiver calls the pelican, and the squad holds the pad.
  - Everyone gathers 15 seconds before it lands.
  - A squad wiped after the call drops back at the pad.
  - The pelican waits for Helldivers still on their way.

**Teamwork rules:** grenades and Ultimatums are shared out, so the squad doesn't spend them all on one spot. Nobody fires through a friendly. Everyone runs from a marked blast.

### 3.3 SEAF: the troops you command

SEAF are the player's ground force.

**Drops and pickups:**

- **Drops:** each drop comes down by **Pelican** as a squad of its own (S1 to S9).
- **Fleet:** the Hangar sells up to six pelicans and bigger loads.
- **Pickups:** a **pickup** point flies troops back up to the destroyer, and they come back on a shorter turnaround.
- **Before the Helldivers land,** troops can drop in the landing zone's ring.

**Orders:**

- **Picking troops:** select by click, by squad, or by drawing a box.
- **Basic orders:** auto, move, protect, attack and escort.
- **Plays:** draw a route, a line or a ring on the map.
- **Move orders are forced (0.46):** troops keep moving and fire on the go. They don't stop to fight anything they meet.

**Roles:**

- **Squad Leader:** with **Leader Command**, he gives a buff aura to troops near him.
- **Riflemen.**
- **Specialist:** an MG-43 and an EAT-17.
- **Medic:** stims the wounded and revives the downed within 14 seconds.

**Troop mixes (0.50):** choose a preset (assault, anti-armour, medical and so on) before the mission, instead of buying more of every role.

**Cost:** every trooper lost is paid for at the end of the mission, each one dearer than the last.

### 3.4 Building

SEAF build what you order. A cargo pelican drops a crate, and the squad assembles it on the spot.

| Build | Role |
|---|---|
| **Concertina wire** | Free. It snaps on from a free end and slows the enemy without blocking fire. |
| **Foxhole** | Free and dug in a line, one place per trooper. It chains like wire to make a trench. |
| **Defilade bastion** | A ring, a line or an L-shaped corner of walls. |
| **Heavy turret nest** | A heavy gun behind thick concrete. |
| **Lookout tower** | It owns vision: a 180° cone at twice an ally's sight, so it also extends the strike zone. |
| **Propaganda tower** | It gives allies nearby the UAV's boosts, with no vision. SEAF can drop at it. |
| **Light bridge** | A hard-light span over water, sent down from the ship. |
| **SAM site** | It shoots down dropships and warp ships. |
| **Artillery cannon** | Weapon 9. |

**Supporting rules:**

- **Ghost preview:** every build shows a see-through preview with who builds it and the price.
- **Turning:** `Q` and `E` turn a build while you place it.
- **Build queue:** a squad moves on to the next unbuilt placement by itself.
- **Building in the pause:** you can lay out a whole position while paused.
- **Garrisons:** troops sent inside a building leave their squad, can't be seen, and make it work better.
- **Demolish:** blows a building up after a three-second fuse.
- **No building on enemy bases:** a build can't be placed on a standing enemy base.

*Why:* building turns SEAF from more guns into a defensive puzzle. The 0.47 changes (foxholes as lines, the build queue, building while paused, and separate jobs for the two towers) all came from SESF testers trying to lay out real positions.

### 3.5 The enemy

Three factions. Each has its own tactics, units and special operation.

| | Bugs (Terminids) | Bots (Automatons) | Squids (Illuminate) |
|---|---|---|---|
| Tactics | Swarm from every side, in close | Slow, form a firing line, see farthest | Spread out and surround |
| Light | Swarmer | Trooper | Drone |
| Medium | Bruiser | Raider | Warrior (rifle) |
| Special | Hive Guard | Commander (jams strikes in its ring) | Fleshmob |
| Heavy | Charger | Tank | Harvester (shield bubble) |
| Super heavy | Brood Titan | Siege Walker | Warp Colossus |
| Reinforcements | Bug holes | Dropships | Warp ships (shielded) |

**Where they come from:**

- **Bases (0.49).** Bases are clusters of 2 to 4 spawners, hidden under smoke until scouted. Each spawner sends enemies out one at a time and falls to one precision strike.
  - **Waking up:** a base sleeps until someone enters its detection range. When it wakes, its neighbours follow.
  - **Heavies:** they come only by call-in, or sometimes as part of a garrison when a base is first seen.
- **Patrols** walk routes from their bases and come over when they hear fighting.
- **Off-map patrols (0.31)** walk in for the whole mission, even with every base down. The enemy never runs out.
- **Flares.** A patrol that sees the squad may fire one. Kill the holder within about four seconds, or reinforcements come.
- **Defended sites** draw calls from two sides.
- **Extraction** draws waves sized by the alert level (0.53.7).

**The alert level (0.48)** works like a wanted level.

- **The spike:** attacking a base raises it, and destroying the base clears it.
- **The baseline:** each base destroyed, objective done, extraction called and time extension raises it a notch. It only goes up.
- **The levels:** shown on the HUD as rank chevrons, from CALM to EXTERMINATION. Higher alert brings new kinds of response, not just more enemies.
- **The gunner's own actions never change it.**

**Fairness rules:**

- No attack has accuracy above 0.9, so every enemy can miss.
- No single hit takes more than 70% of a Helldiver's health.
- A super heavy must die before the pelican lands.

### 3.6 Missions

**Main objectives:**

- **Nuclear Launch:** hold the launch site, then fire the nuke yourself.
- **VIP Rescue.**
- **Destroy the Citadel:** a walled ring of bases around a keep that only a Hellbomb brings down.
- **Evacuate Civilians.**

**Faction operations:**

- **Pump the Oil** (bugs).
- **Destroy the Defence Cannon** (bots). While it stands, your strikes land wide.
- **Bring Down the Shield Dome** (squids).
- **Defend the Gun** (squids). Hold the planetary defence gun while it fires on the Illuminate mothership overhead. It is the campaign finale, and it can also turn up among the mission offers.

**Side missions and finds:**

- **Side missions:** a radio tower (lasting vision), an enemy broadcaster, hidden SEAF, an abandoned artillery cannon, and jammers that only a Hellbomb destroys (from the second mission).
- **Finds:** a crashed pelican, a lost hellpod, a strongbox and a SEAF supply cache.

**Work sites (0.52)** are a refinery for bugs, a salvage yard for bots and a lab for squids.

- **Working it:** SEAF sent inside work it for pay and a buff to the gunner's tools (orbital charge, cheaper strikes, or UAV reveals).
- **Asleep until worked:** since 0.53.6 the enemy leaves a site alone until it's worked.
- **Defending it:** once worked, probes come with growing strength.
- **Fallen:** a fallen site stops drawing fire and can be retaken.

**The Hellbomb.** When the squad calls one, a panel opens in slow motion and you assemble the bomb part by part against a timer. A Helldiver arms it, and everyone runs.

**Supply drops.** When the Helldivers run low, one asks for supplies. You load the pod by hand, and a fast load gives the squad a boost.

**The map:**

- **Size:** round, from 760 m across on the first mission up to 1.5 km.
- **Terrain:** generated from the mission's seed, with water, slow ground and high ground.
- **Biomes:** six (grass, ice, desert, jungle, moon and city).
- **Time of day:** each mission drops at its own hour and the clock runs on through it. At night every soldier carries a flashlight (0.38).
- **Clock:** a mission has a 30-minute limit and usually takes 10 to 15 minutes.

**Winning and losing:**

- **Victory:** the squad extracts.
- **Objective complete:** the objective is done but the squad doesn't get out. The mission still counts, without the extraction pay.
- **Defeat:** every life is lost, or the clock runs out, before the objective is done.

### 3.7 Difficulty

Each level sets two things.

- **How many come:** patrols, backup, group sizes, the live cap, and how often mediums, heavies and super heavies turn up.
- **How far the war has gone:** this is measured in "war minutes" and sets toughness, damage, how fast pressure builds and how many heavies come.

**War minutes by level (0.53.8):**

| Level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| War minutes | 0 | 9 | 18 | 25 | 31 | 36 | 39 | 40.5 | 41.5 | 42 |

Past level 10 it carries on smoothly.

**The two curves:**

- **The operation curve, between missions.** Each mission climbs about 0.6 of a level, plus an eighth of a level for each rank earned. From level 3, missions 1 to 10 run at 3 4 4 5 6 7 7 8 9 10. Past mission 10, with the armory fully open, each mission adds a little more than the one before (0.48), so even a strong player's operation ends.
- **The mission curve, inside one mission.** Pressure starts at the mission's level and rises with mission time and the alert ratchet. It resets for the next mission.

**Pay:** credits scale with the level, from ×0.75 at level 1 to ×1.20 at level 10. A mission offer with a difficulty bump pays 15% more per level of bump.

**Faction balance (0.53.8):**

- **Bugs** had been the hardest by far. The fix was a slower charger that no longer outruns a Helldiver, lighter hits, and smaller packs.
- **Bots and squids** hit harder.

**Measured balance (0.53.8).** The sharp bot played first missions with a new player's kit, 12 per cell:

| Level | Bugs | Bots | Squids |
|---|---|---|---|
| 3 | 11/12 won, 2 lives lost | 12/12, 1 | 12/12, 0 |
| 6 | 11/12, 8 | 10/12, 15 | 12/12, 8 |
| 9 | 5/12, 22 | 8/12, 23 | 4/12, 23 |

### 3.8 Operations and progression

**What an operation is:**

- **One run:** an operation is one run. Quick Play and the campaign are each one, saved separately.
- **What carries over:** credits, rank and the armory carry from mission to mission.
- **Retry:** any mission can be flown again with the same map and enemy, from the state at the drop.

**The armory** has six tabs: ORBITALS, HANGAR, SHIP, SEAF, BUILDABLES and CLASSIFIED.

- **Slots:** all five orbital slots are open from the start.
- **Paying toward an item:** you can put credits toward any item and finish paying later. The deposit can't be taken back.
- **Upgrade display:** every upgrade shows what it does now, what the next level adds, and its whole path.

**Progression between missions:**

- **Ranks:** one rank per mission finished, nine in all, from Fresh Recruit to Super Earth's Favorite Gunner. Each rank pays a level bonus and opens more of the armory.
- **Commendations (0.51):** after each mission, pick one of three perks that lasts the operation. There are five kinds (Orbital Efficiency, Hangar Crews, Gun Overcharge, Veteran Troops and Engineering Corps). They stack, up to 10 per operation.
- **Mission offers (0.51):** three cards, each with its enemy, objective, pay and a bump of +1, +2 or +3 levels. The campaign offers the bump only.

**Score and ending:**

- **Score** is the credits earned over the operation, so risky offers raise it.
- **END OPERATION** ends a run on your terms and pays an **SESF coin** (you can hold up to 3). A coin is a credit deposit toward any later armory item, worth more the further the operation got.

**Saves:**

- **Slots:** three save slots in the browser's own storage, with autosave after every mission.
- **Ended runs:** an operation that ends frees its slot.
- **Reset:** 0.53 reset old saves once (`SAVE_VER 2`). Settings, names, keys, callsign and coins were kept.
- **Limits:** saves don't move between browsers, and clearing site data removes them. The title screen says so.

### 3.9 The tutorial and the campaign

**Tutorial: Last Stand on Mars.** It is set on 20 May 2185: the Illuminate Great Host is passing Mars on its way to Super Earth.

- **The cards:** 16 cards teach one control at a time. Each card pauses the game next to the thing it's about.
  - Since 0.53.6, you drop your own troops first and learn a drop's limits.
- **The evacuation:** the Great Host comes in stages at 30, 60, 90 and 120 people evacuated.
- **Winning:** at 70 evacuated it's MISSION COMPLETE. You then choose to fight on, go to the campaign, or go to the menu.
- **The ending:** fight on and it ends as it always did, with Mars glassed.

**Campaign: Operation Sweet Liberty (0.53).** The Illuminate mothership is coming for Super Earth. The only answer is the planetary defence gun *Sweet Liberty*, outside the capital. The campaign has ten chapters:

| Arc | Chapters | Enemy | What you gather | Objectives |
|---|---|---|---|---|
| The Dunes (desert) | 1 to 3 | Bugs | E-710 fuel | oil, VIP, citadel with a jammer |
| The Glaciers (ice) | 4 to 6 | Bots | Scrap parts | defence cannon, evacuation, nuke |
| The Jungle | 7 to 9 | Squids | Soften them up | shield dome, VIP at night, citadel |
| Finale (city) | 10 | Squids | Hold the gun | the defence gun against the jellyfish mothership |

**How the chapters run:**

- **Lessons:** each chapter teaches something new on the radio as it comes up.
- **Cinematics:** a briefing and debrief open and close each chapter, played like the tutorial's cinematics.
- **The cast:** SESF command speaks on the radio.
  - General Ramzies gives the orders.
  - KTL of the P.H.A.N.T.O.M. Helldivers is his second.
  - Rudolph the Red's Tibit Tigers are on the ground.
  - Neonboot of F.E.A.R. speaks for the Ministry of Science.
  - Mota, the SESF Knight of Midnight, speaks for the Ministry of Defense.
- **Progress:** it's saved by chapter checkpoint. After chapter 10 the war goes on endlessly.

**The finale:**

- **The gun:** it's dormant until the squad arrives. Then it sets up, charges, and fires five shots. Losing the gun is a defeat.
- **The music:** it has its own theme, *LAST LIGHT*.
- **The mothership:** it's drawn as a 3D jellyfish from the project lead's sketch (0.53.5).

### 3.10 Interface

- **The layout.** It's laid out like an RTS:
  - **Top left:** resources.
  - **Top centre:** the drop countdown and alerts.
  - **Top right:** the clock and objective.
  - **Left:** the Helldiver roster.
  - **Bottom centre:** the command panel, with weapons above it.
  - **Bottom right:** the minimap and log.
- **The command panel** (TROOPS, BUILD and ARMORY) is always up, runs in real time, and keeps the same height in every context.
- **Three layouts:** desktop, tablet and phone, picked automatically or in Settings. The phone layout puts the map first: thin top rows, Helldiver chips, a folded minimap, and the news in a radio tab instead of over the map.
- **Pause and plan (0.22).** Orders, builds, drops and strikes given in the pause are numbered on the map and go out in order when you play on. There's also a half-speed mode.
- **Tips everywhere.** Hover or tap anything for a one-line tip, and press ⓘ for the details. The field manual and the INFO panel explain every mission.
- **Rebindable keys (0.50.1)** and a **UI size** setting.
- **Phone performance (0.42):** a 30 fps cap by default, a resolution cap, a slower minimap, and a quality watchdog. These came from a report of phones running hot.

### 3.11 Look and sound

- **The look.** A gunship's thermal camera, white-hot or black-hot, with a deadpan radio voice.
  - Terrain is shaded relief.
  - Every unit, explosion, building and cinematic is drawn in Canvas 2D.
  - Day and night lighting comes with flashlights, muzzle flashes and glowing shells.
  - Health bars sit under unit names and scale with UI size.
- **The music** (`js/music.js`) is composed in code and played live with Web Audio.
  - **Pieces:** Orbit (menus), Briefing, Drop, a battle theme per faction (Bug Hunt, Iron Front, Cold Light), Swarm (a horde on screen), LAST LIGHT (the gun), Victory and Fallen.
  - **How it follows the fight:** battle music rises in levels with how close and how heavy the fight is. Changes land on the bar, and pieces crossfade between decks.
- **Sound effects** are synthesised from tones and noise. Every weapon, ours and theirs, has its own sound.

### 3.12 Community features

- **After action reports.** Every ending screen has COPY FOR DISCORD: a report in Discord's bold, always in English.
- **The SESF feed (0.43).** Each operation posts once when it starts and once when it ends to the SESF Discord. It can be turned off in Settings, and it is the only data the game sends anywhere.
- **Operation names (0.45)** can be typed or left as rolled.
- **Feedback.** A FEEDBACK (DISCORD) button sits on the title screen, the pause menu and the final screen.
- **Credits.** The CREDITS screen names the creator and every tester, tells the story from idea to launch, and lists the technology and the legal notice.

---

## 4. How it came together

### 4.1 Before the first build

- **2024.** Helldivers 2 launches, and one wish keeps coming up across the community: a gunship stratagem, an AC-130 circling overhead and raining fire for the squad below. The SESF is founded around the same time.
- **2024 to 2025.** The SESF tries other minigames, mostly Discord integrations, including a base-building game that grew too big and was set aside.
- **2026.** The SESF staff's experience was in web applications, so a game in the browser played to that strength.

### 4.2 The design revisions (26 to 29 October 2026)

The first pitch set out the game:

- five biomes;
- three factions with light, medium and heavy units, at a 10 : 1 : 1 ratio;
- 30-minute missions, with bases growing from 3 to 20 over a session;
- four Helldivers and SEAF;
- a score block with a session ID to paste into Discord.

The original design document then went through twelve revisions in four days, each one answering a play session:

| Rev | What changed | Why it matters now |
|---|---|---|
| 1 | The pitch: a thermal gunship view and shells that land a moment later. Big guns needed a laser designation. | The look and feel still come from here. |
| 2 | Helldivers drop alone with 20 lives. SEAF only come when called. A strike zone was added. | Set the "never directed" rule. |
| 3 | Stratagem loadouts, objectives, damage scaling | The first objective set. |
| 4 | The armory, the gunner reduced to the sky and SEAF, and a session that only ends in failure | Removed the free-fire guns and set up the operation loop. |
| 5 | The player directs and the Helldivers clear. Added the ship gun, troop pelicans, SEAF roles and drawn plays. | Where SEAF command was born. |
| 6 | Tougher Helldivers, faction tactics, one gun, and real terrain (water, slow ground, high ground) | Factions began to feel different, and terrain began to matter. |
| 7 | Facing, reinforcements, extraction, the evacuation, day and night | Hits from behind, and the extraction pad. |
| 8 | Performance, the tactical map, supply drops | The supply pod minigame. |
| 9 | A climb inside every mission, super heavies, utilities, range | The mission curve. |
| 10 | The gunner is needed. Patrols, side missions, radar, three languages. | The "you are necessary" principle. |
| 11 | Difficulty levels 1 to 10 | The level system. |
| 12 (0.12) | Camera control, orders that stick, building, the citadel | The base of today's building system. |

### 4.3 Becoming Orbital Fury (29 October to 6 November)

- **30 October: the name.** The game takes the name **Orbital Fury** and its home at orbitalfury.com.
- **0.19 to 0.32: tuning the climb.** The climb between missions was measured with whole bot sessions, halved when players found it steep, then raised to 0.6 a level per mission with a step per rank.
- **0.20 to 0.23: the RTS interface.**
  - The command panel and three layouts.
  - Pause and plan, and the light bridge.
  - Stratagem colours and Eagles.
- **0.25 to 0.28: progression and story.**
  - Ranks and Classified stratagems.
  - SEAF roles.
  - The tutorial's stages.
  - The first campaign, *Operation Freedom Vista* on Fronteria.
  - The command radio.
- **0.29 to 0.33: sound.** The original score, battle themes for each faction, and smooth transitions.
- **0.36 to 0.38: the title and more systems.**
  - Demolish.
  - The new title screen.
  - Hellbomb side jobs.
  - A five-chapter campaign.
  - Lighting by the hour.
- **0.39 to 0.45: features players asked for.**
  - Pelicans, pickups and wire.
  - Squad AI that knows when a fight is lost.
  - A rank every mission.
  - Save slots.
  - Phones that stay cool.
  - The SESF feed, the SESF coin, and named operations.

**The trailer.** Two trailers were filmed from the game itself, with a YouTube title, a description and an Instagram poster. The game's own art and music made that possible with no outside assets.

### 4.4 Twenty pull requests in two days (7 to 8 November)

The repository's history starts at 0.45.0. From 0.46 on, every release went through its own pull request, was merged, and deployed to orbitalfury.com. The plan was first scheduled one phase per weekend. Then the project lead asked for all of it at once, pushed live at each milestone so finished work was never left unpublished.

| Release | PR | What it did |
|---|---|---|
| 0.46 Fixes 1 | #1 | Autosave, ended runs clear their slot, SEAF drops as their own squad, forced move orders |
| 0.47 Fixes 2 | #2, #3 | The vision ladder, foxhole lines, build queue, building while paused, the corner bastion, separate jobs for the two towers |
| 0.48 Difficulty | #4, #5 | The alert level, the two curves, time extensions |
| 0.49 Base overhaul | #6 | Bases as clusters of spawners, scouting, spawns one at a time |
| 0.50 Armory and SEAF | #7, #8 | All slots open, paying toward items, coins as credits, troop mixes, Leader Command, rebindable keys |
| 0.51 Choosing missions | #9 | Commendations, mission offers, score as credits |
| 0.52 Work sites | #10 | Holdable work sites; one precision strike kills one spawner |
| 0.53 Sweet Liberty | #11 | The ten-chapter campaign, the city, the defence gun, a tutorial you can win, the save reset |
| 0.53.1 to 0.53.5 | #12 to #16 | Players' reports: work site doors, Eagles and bridges, the citadel stall, the jellyfish mothership, the development note |
| 0.53.6 | #17 | Work sites left alone until worked; the tutorial has you drop your own troops |
| 0.53.7 | #18 | Extraction waves sized by the alert; the squad goes for the full clear 80% of the time |
| 0.53.8 | #19 | Levels re-spaced (3 easy, 6 hard, 9 very hard); bugs evened out with the other factions |
| 0.53.9 | #20 | Phone armory scrolling, effects on the mission clock, one oil message instead of two |

### 4.5 By the numbers (0.53.9)

- **About 35,000 lines** of JavaScript, HTML and CSS, with no dependencies in the game.
  - The simulation is 33 files in `js/sim/`, the renderer is 15 files in `js/render/`, and every tuning value sits in one 600-line `js/config.js`.
  - About 2,450 lines of text in each of three languages.
- **89 test scripts:** simulation checks (`r*.mjs`), browser walk-throughs at desktop, upright phone and sideways phone sizes (`ui*.mjs`), and the balance harnesses.
- **48 stratagems,** 3 factions with 5 units each, 8 mission types, 6 biomes, 10 campaign chapters and a 16-step tutorial.
- **Two weeks** from the first pitch (26 October) to 0.53.9 (8 November), with a new build almost every day and several a day at the end.

---

## 5. How we work

These practices kept a fast-moving project from breaking. They are light rules, not a process manual.

### 5.1 Architecture that keeps things testable

- **The simulation never draws, and the renderer never changes the world.**
  - `js/sim/` holds the game. `js/render/` draws it. `js/ui.js` and `js/main.js` hold the screens and the wiring.
  - Because of this split, the same game runs in a browser, in headless Node tests, and in trailer filming, without changes.
- **A fixed step.** The simulation ticks at 30 Hz with an accumulator. Drawing runs at the display rate.
- **Seeded randomness only.** The simulation uses `js/util/rng.js` (mulberry32) and never `Math.random`, so a mission is reproducible from its seed.
  - New random features roll from their own stream, so adding one doesn't reshuffle every map. The Hellbomb jammer was placed this way.
- **One clock for the mission.** Anything that moves in the world, effects included, runs on the mission's clock (`m.t`, or `fxNow(m)` in the renderer), so the pause stops it. The wall clock is only for interface animation (0.53.9).
- **All tuning in `js/config.js`.** Balance changes never touch game logic. Tables of stratagems, perks, names, tips and the story live in `js/data/`.

### 5.2 Decide first, then build

- **Big changes start as decisions.** They are written down in *Orbital Fury: difficulty policy decisions* before any code: the principle, the options, and what was decided. Rules like "difficulty only climbs" and "every offer has a bump" came from there and settle later arguments.
- **The project lead decides feel, and the code is checked against it.** For example: "level 3 is easy, 6 is hard, 9 is very hard."
- **Parked questions stay visible.** One example is what can be upgraded mid-mission. They wait in the decisions doc until playtests settle them.

### 5.3 Measure, don't guess

- **The bot gunner** (`js/sim/bot.js`) plays whole missions headless in three modes: none (nobody at the controls), novice and sharp.
- **Balance harnesses:**
  - `test/difficulty.mjs` runs levels, objective types and whole operations with the bot shopping between missions.
  - `test/balance.mjs` runs each faction at each level. Use `OF_CFG` to try a config change without editing the file.
- **Cells, not single runs.** One mission swings widely with its seed, so compare 6 to 12 seeds per cell and record before and after in a table.
- **Find the real cause before tuning.** For example, the charger did 58% of the killing, so pack size and its speed mattered more than damage. In 0.53.7, extraction ignored the alert because its waves used the field's pressure, which every destroyed base cuts.
- **Try, measure, and revert when it's worse.** A change that makes another part of the game worse gets dropped. Examples include a hard map-edge clamp (squads got stuck), a cell-by-cell path check (SEAF got stuck more), and flooring the field's pressure (bugs got worse).
- **Bots aren't people.** The novice bot plays about as well as the sharp one. Real players' reports and the SESF feed are the better guide for levels 3 to 6.

### 5.4 Every fix gets a test

- **Reproduce first.** A bug report becomes a test that fails on the old code, then the fix makes it pass. For example, r532 reproduces two stuck bridge crossings, and three checks in r52 fail without the 0.53.6 fix.
- **Sim tests** (`test/rNN.mjs`) check rules in Node. **UI tests** (`test/uiNN.mjs`) drive Chromium through real screens with Playwright, at desktop, upright phone and sideways phone sizes.
- **Every release adds its own test** (r539, ui539 and so on), and the full suite runs before a merge.
- **When balance moves, fix the test fixture, not the rule.** For example, a test that measures what each level sends makes the squad unkillable while it measures.
- **Flaky tests are listed by name.** ui33's music timing, ui42's frame rate and terrain timing can fail under load. Rerun them alone before treating a failure as real.

### 5.5 Three languages in step

Every player-facing string lives in `js/lang/en.js`, `fr.js` and `es.js` under the same key. `test/i18n.mjs` checks that every key exists in all three and that placeholders match. New text goes into all three in the same change.

### 5.6 Releasing

1. **Branch.** Make a branch from `main` for the release.
2. **Build.** Build in steps, pushing work-in-progress commits at milestones, so nothing finished is ever lost.
3. **Write it up.**
   - Add a **What's new** entry at the top of the README, in plain words for players.
   - Update the manual sections it touches.
4. **Bump and bundle.**
   - Bump the version in `package.json`, `js/config.js` and `test/r19.mjs`.
   - Bundle with `npm run bundle`, which writes `dist/orbital-fury.html`.
5. **Test.** Run the sim and UI suites.
6. **Open a pull request.** The body lists what changed for players, the technical notes and the tests.
7. **Merge and check.**
   - Merge, and GitHub Pages deploys orbitalfury.com.
   - Check that the Pages run finished and the live version string is right.
8. **Record it.** Add a design note for the release to the project, and update the decisions doc.

**Release rules:**

- **One release, one pull request.** It keeps each change easy to review and to roll back.
- **Never break the live game.** If a change can't be finished safely, ship what is safe and say what is left.

### 5.7 Saves and players' data

- **Storage keys:** saves live in the browser's storage under `ofs.*` keys.
- **Changing the save format:** raise `SAVE_VER` and decide what a reset keeps. Settings, names, keys, callsign and coins have always been kept.
- **Telling players:** the title screen warns that the game is in active development and that saves are per browser.
- **Data sent:** the game sends nothing except the SESF feed, which players can turn off.

### 5.8 Writing for players

The README, the field manual, tips and release notes are written for players:

- plain words and short sentences;
- what they'll notice first;
- version numbers in brackets so they can follow what changed.

The decisions doc and the release design notes are for us, and they hold the code names and numbers.

---

## 6. For the next update

### 6.1 Before you start

- [ ] Read this document's principles (section 2) and the decisions doc. Does the change fit them? If it changes one, record the new decision first.
- [ ] Find the report or the goal, and how you'll know it's fixed: a test, a bot sweep, or a player confirming it.
- [ ] Branch from the latest `main`.

### 6.2 Where things live

| To change... | Look in |
|---|---|
| Any number (damage, timings, costs, levels) | `js/config.js` |
| Stratagems, perks, names, tips, the campaign's chapters | `js/data/` |
| The squad's decisions (objective, full clear, extraction, breaking off) | `js/sim/planner.js`, `squad.js`, `helldiver.js` |
| Enemy behaviour, spawning, bases, reinforcements, the alert | `js/sim/enemies.js`, `director.js`, `spawners.js`, `reinforce.js`, `alert.js` |
| SEAF, pelicans, building, posts | `js/sim/seaf.js`, `posts.js`, `defenders.js` (SEAF already holding a site at the start) |
| Objectives, extraction, work sites, the defence gun | `js/sim/objectives.js`, `ops.js`, `extract.js`, `sites.js`, `gun.js` |
| The tutorial | `js/tutorial.js`, `js/sim/laststand.js` |
| Operations, saves, offers, the campaign run | `js/session.js`, `js/campaign.js` |
| Screens and HUD | `index.html`, `js/ui.js`, `css/style.css` |
| How anything looks | `js/render/` |
| Music and sound | `js/music.js`, `js/audio.js` |
| Text | `js/lang/en.js`, `fr.js`, `es.js` |
| The SESF feed | `js/feed.js` |

### 6.3 Traps we've already hit

- **Wall clock against mission clock.** Anything in the world must use the mission clock, or it keeps moving in a pause.
- **New random draws shift old tests.** Draw from a separate stream, or give a test a little settling time.
- **CSS for phones goes at the end of `style.css`,** or a later rule overrides it.
- **A variable shadowed inside a long function** caused a temporal dead zone crash in 0.53.7. Name things for what they are.
- **Pressure that drops as bases fall.** Anything sized on `m.pressure` gets weaker as the player wins. Use `callPressure(m)` when it should keep up with the alert.
- **Bugs swing more than the others.** Re-run `test/balance.mjs` for all three factions after any change to enemies.
- **Phones.** Test the upright phone at 375×667 and the sideways phone at 844×390. Lists that scroll inside a squeezed card were the 0.53.9 bug.

### 6.4 Open questions

- **The defence gun at level 6.** The bot loses the gun after 3 shots, and at level 3 it wins with the gun at full health. Tune it from SESF feedback.
- **What can be upgraded mid-mission:** everything (as now), the ship only, or the ship gun plus buildings. Parked until playtests settle it.
- **The late-game target.** The sharp bot should struggle to clear 12 missions. In 0.53.8 it carried on for 15 to 16. Compare with real operations in the SESF feed before changing it.
- **Telling a new player from a skilled one in tests.** The novice bot needs to play more like a new player.
- **Defended sites since the 20 to 40 m throw (0.47).** The evacuation saves fewer civilians. The options are more SEAF or turret help there, a longer throw while holding a site, or leaning on the gunner's own strikes.

---

## 7. Related documents

- [README](../README.md): the player's manual, every release's notes, controls, enemy tables and credits.
- **Orbital Fury: difficulty policy decisions** (Claude Doc): the decisions and their reasons, kept up to date.
- **SEASF Orbital Fire Support: Game Design Document** (Claude Doc): the original document, revisions 1 to 12. It is kept as history.
- **Design notes per release** (the *Multi-Minigame* project on claude.ai):
  - 0.19 balance;
  - 0.29 audio;
  - 0.37 campaign;
  - 0.39 pelicans;
  - 0.40 squad AI;
  - 0.41 saves;
  - 0.42 phones;
  - 0.43 SESF feed;
  - 0.44 coin;
  - 0.45 operation names;
  - 0.46 and 0.47 fixes;
  - the 0.48 to 0.53 rollout.

*Orbital Fury is a free, unofficial fan project, not affiliated with or endorsed by Arrowhead Game Studios or Sony Interactive Entertainment.*
