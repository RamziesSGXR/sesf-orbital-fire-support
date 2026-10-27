# Orbital Fire Support

A Super Destroyer targeting minigame for the Super Earth Special Forces community. You run the sky from orbit, watching a squad of Helldivers and SEAF troops through a thermal AC-130 style view. The Helldivers push across the map on their own, do the mission objective and call their own stratagems. You give them cover with UAV scans and orbital strikes, send SEAF to clear targets, and spend the credits you earn on better gear.

Plain JavaScript modules and Canvas 2D. No framework, no server, no build step. Works on desktop (mouse and keyboard) and on phones and tablets (touch).

> Unofficial fan project. Not affiliated with or endorsed by Arrowhead Game Studios or Sony Interactive Entertainment. It uses no game assets, no game text and no game audio. All art is drawn in code and all sound is synthesised.

## Host it on GitHub Pages

The repository is the site: `index.html` sits at the root and every path is relative, so it works from `https://<your-name>.github.io/<repo-name>/` with no changes.

1. Create a new repository on GitHub (public, or private if your plan allows Pages on private repos). Leave it empty: no README, no license, no `.gitignore`.
2. In this folder run:
   ```
   git init -b main
   git add .
   git commit -m "Orbital Fire Support"
   git remote add origin https://github.com/<your-name>/<repo-name>.git
   git push -u origin main
   ```
   Or skip git and use **Add file, Upload files** on the repository page to drag the folder's contents in.
3. Open **Settings, Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute or two the game is live at `https://<your-name>.github.io/<repo-name>/`. Share that link.

What you push is what is served. The `.nojekyll` file tells Pages to leave the files untouched. To update the game later, commit and push again.

To try it locally first, run `npm start` (or `python3 -m http.server 8080`) and open `http://localhost:8080`. The game is made of ES modules, which browsers will not load from a double-clicked `index.html`; use the local server, or build the single-file version below.

**Single file for offline play.** `npm install` then `npm run bundle` writes `dist/orbital-fire-support.html`, one self-contained file that runs by double-clicking it. `dist/` is not committed.

## How scores get posted

When a player ends a session they get a **score block** and a **session ID** (the UTC date and time the session ended, like `20261027-030146Z`). They copy the block and paste it in your community channel:

```
ORBITAL FIRE SUPPORT | SUPER EARTH SPECIAL FORCES
SESSION 20261027-030146Z
CALLSIGN ANON
FINAL SCORE 38,959
MISSIONS 3 (3 won) | TIME 33:43
CREDITS EARNED 13,630 | SPENT 9,200
KILLS 1,068 | HELLDIVERS LOST 4 | SEAF LOST 61
---
1. Operation Vigilant Dawn | BOTS Desert | VICTORY | 11,266
2. Operation Glorious Liberty | BOTS Frosty ice glaciers | VICTORY | 13,885
3. Operation Radiant Resolve | BUGS Jungle | VICTORY | 13,808
```

To add a one-tap "copy and open the channel" button, set `share.channelUrl` in `js/config.js` to your Discord channel link, forum thread or form. There is no server, so scores are honor-system.

## Feedback from players

The title screen, the pause menu, the final screen and the About page all have a **GIVE FEEDBACK** button, with a line under it saying what it is for. It opens a short form on this repository's Issues page (`.github/ISSUE_TEMPLATE/feedback.yml`): device, how long they played, how far they got, what worked, what did not, and what they would change. Players need a free GitHub account to send it. New reports arrive under **Issues** with the `feedback` label.

If you host your own copy, point `share.feedbackUrl` and `share.projectUrl` in `js/config.js` at your repository.

## Controls

| | Desktop | Touch |
|---|---|---|
| Aim | Mouse | Drag the map under the fixed center crosshair |
| Call | Click | CALL button |
| Weapon | `1` UAV scan, `2`-`6` orbitals, `7` the nuke once a launch site is armed, `8` the ship gun (hold to fire), `Q` / `E` cycle | Weapon bar, hold FIRE for the ship gun |
| SEAF drop | `G` at the cursor, or click SEAF DROP then the map. The troop pelican joins the selected squad | SEAF DROP at the crosshair |
| SEAF squads | `Tab` next squad, `` ` `` all squads, `Shift+1`-`4` pick a squad, `F` split, `M` merge, `Y` assign nearby troops | S1-S4 buttons and the squad bar |
| SEAF orders | `X` auto, `V` move, `Z` protect, `N` attack, `C` escort | Order buttons |
| Draw a play | `R`, then drag on the map: a loop is a ring, a straight stroke is a line, anything else is a route | DRAW, then drag one finger (two fingers still pan and zoom) |
| Send SEAF at a target | Click a bug hole or point of interest | Tap it with an order |
| Armory (upgrades) | `B` | MENU, then ARMORY. The menu also opens the stratagem list, squad status and the camera |
| Camera | `WASD`, right-drag, wheel or `+` / `-` zoom, `Space` locks on the squad | Drag, pinch, tap the minimap |
| Mission info | `I` or the INFO button: what the mission is, the steps to finish it, and what the enemy does | INFO button |
| Info cards | Hover a weapon or stratagem, or select a weapon or squad, to see what it does, its level and its numbers | Tap a stratagem; selecting a weapon or squad shows its card |
| Other | `T` white-hot / black-hot, `H` relief map, `Esc` or `P` pause and rename squads. Every panel closes with its ✕ or `Esc` | Pause button, relief map in Settings |

## How a session works

- **Armory.** You start with credits and a small kit: a UAV scan, three orbital stratagems and SEAF support. Buy more orbitals, more slots (up to five), and upgrades for each orbital, the UAV scan, SEAF (barracks, pod bay, armor, grenadiers, rocket troopers), the strike zone and the squad's reinforcement lives. The armory opens at the start of the session and after every won mission. Mid-mission it allows upgrades only.
- **Briefing and groups.** Each mission rolls 16 stratagems and sorts them into 4 groups of 4. Each group has a random SES Super Destroyer name (you can type your own) and one Helldiver who alone calls that group's stratagems. FRV, Jump Pack and Resupply are group items that any living Helldiver can call. Helldivers wear a code like B4 (group letter and deployment number), or the name you typed. SEAF troops get a rank and surname.
- **You run the sky.** Orbital strikes and the UAV scan are what you aim. Calls land only inside the **strike zone** around your allies or a UAV circle. Your strikes hurt friendlies, so mind the squad. You never steer Helldivers or call their stratagems. Eagle strikes, yours and theirs, show their footprint and approach direction on the ground before they land.
- **Ship gun.** There is one gun, and it is slot 8: hold to fire anywhere you have vision, with no strike zone and no friendly fire. It runs on its own ammo pool that refills by itself, and the armory can upgrade its damage, ammo, refill rate and spread. (The free orbital slot that used to be a second Gatling is now an Airburst.)
- **Helldivers.** They drop in on their own, reinforce automatically from a pool of lives, and announce what they are about to do. They attack bases, the citadel and other structures with their rifles, support weapons and stratagems, so anything you can destroy they can too. Each has one map ping for where they are heading or what they are fighting. You get a notice when one dies or is called in. A Helldiver in a mech climbs out when an FRV arrives, and the FRV has a manned heavy turret.
- **The Helldiver kit.** Every Helldiver carries a **Liberator** rifle, an **Ultimatum** (a slow-loading, short-range hand cannon that hits very hard and punches armor), **3 grenades** (heavy penetration, about six to kill a medium) and **4 stims**. A stim heals over a few seconds and gives a burst of speed. A Helldiver stims when hurt with enemies close, throws grenades at clumps and at mediums and heavies, and **dodges** an incoming hit now and then (it recharges, and friendly fire cannot be dodged). When badly hurt he **falls back**, keeps calling stratagems as he runs, and comes back once healed or once it is quiet. Resupply refills stims, grenades and the Ultimatum.
- **Trigger discipline and blasts.** Nobody fires through a friendly if there is a clear shot, though now and then a round gets through. Every ally, SEAF included, runs out of an incoming strike's footprint (your orbitals, the nuke, a laser) and does not walk into one. Helldivers call stratagems from farther out than they used to.
- **Stratagem rules.** Every group of four has at least one stratagem that can take down a heavy. The **Spear** has a lock-on period and one-shots mediums and sometimes heavies. The **Expendable Anti-Tank** is a single one-shot. The **Autocannon** is the classic rapid-fire heavy-penetration weapon: a few shots on a medium, great against chaff. **Resupply** is always in the sixteen and can be called down forever on its cooldown.
- **Recall timer.** If fewer than four Helldivers are left and no recalls remain, one arrives after two minutes, so a worn-down squad has a chance to come back. A mission is only lost once no Helldiver, SEAF trooper or pelican is left to hold the line.
- **Seeing and spawning.** Helldivers see farther than SEAF. Every group (the ambient spawns, base garrisons, point-of-interest guards, the VIP's guards) appears outside everyone's sight and walks in. Enemy reinforcements are the only exception.
- **Enemy reinforcements.** A patrol that finds the squad, or gets shot at, may fire a flare. Kill the one holding it before it burns out (about four seconds) and nobody comes. Otherwise reinforcements arrive the faction's own way, close to where the fight is and in plain sight: **bugs** dig up out of one hole (shoot it closed), **bots** come in a dropship and **squids** in a warp ship (both can be shot down while they hover low, and their troops go down with them, for credits). The same reinforcements come at the objective site while the squad holds it, and at the extraction pad once the pelican is called.
- **Facing, back hits and criticals.** Every unit, ally or enemy, shows which way it faces: a visor and a backpack strobe on Helldivers, a head, eyes or a sensor on the enemy, and a glowing weak spot on the back of mediums and heavies. Hits from behind do 1.5 times the damage (2.2 times on heavies). Every attack can be a critical for double damage: the destroyer's orbitals most often (14%), the ship gun next (10%), then allies (6%), then the enemy (4%).
- **Helldiver stratagems.** Each Helldiver only calls into his own strike zone. A call takes a couple of seconds, so the marked area shows longer before it lands, and Helldivers lead their strikes onto where a moving pack will be. A Helldiver facing a big pack can ask for a **free-fire zone**: every ally keeps out of it for thirty seconds, and your orbitals into it recharge twice as fast. Saturate it.
- **Extraction.** Once the objective is done the extraction point goes live. A Helldiver on the pad calls the pelican; the wait grows from about half a minute early in a session to over a minute later. Hold the pad while the enemy reinforces it. You do not have to clear the map: when the pelican lands, the Helldivers run for the ramp, and SEAF squads get pelicans of their own wherever they are.
- **Time of day.** Every drop is at a random hour, and the clock runs through the mission: the light comes from the sun (or the moon), dawn and dusk are warm, night is dark blue. By day the shadows of the squad's four Super Destroyers drift slowly across the map.
- **How each faction fights.** Most of what comes at you is light infantry. **Bugs** swarm: they run in from every side at once. **Bots** form a firing line across the approach and stand there shooting. **Squids** spread out and surround their target. Mediums and heavies are rarer, and only a few can be on the field at once, a number that grows slowly through the session.
- **SEAF.** A troop pelican flies each drop in, lands for a second and uses its belly autocannon on enemies while it is down. Troops come as riflemen, grenadiers, a rocket trooper, a **medic** who heals every ally including Helldivers, and a **spotter** who calls Eagle fire missions. They clear the nearest objective on their own (bug holes, then points of interest, then bases). Split them into up to four squads (S1-S4), merge them back, assign nearby troops to a squad, and give a squad an order to move, protect an area, attack or escort. Or draw a play: a route to run, a line to hold or a ring to defend. Think of it as calling a football play.
- **Your job.** Scan with the UAV, direct the SEAF squads and break the large enemy assaults. The game warns before each assault (direction, size and time), and breaking one pays credits. The Helldivers clear the rest of the map.
- **Targets of interest.** Six to nine points of interest per mission pay credits when SEAF destroy them. Allies can ping them.
- **Objectives.** Every mission has one, and later missions two: **Nuclear Launch** (hold the site, then you aim the nuke anywhere; it now flattens 230 m after a ten-second countdown), **VIP Rescue** (find the VIP and bring them to the pickup point), **Destroy the Citadel** (take down the fortress) or **Evacuate Civilians** (hold a site with a shelter and a hangar while forty civilians walk from one to the other and fly out on shuttles; your blasts kill them too). The INFO button explains each one step by step. After the objective, the squad clears bases for extra credits for a while, then extracts for a bonus.
- **Credits.** Kills, bases, points of interest, bug holes, shot-down dropships, civilians saved, assaults you break, the objective and extraction all pay. The armory colour-codes upgrades by type. Prices (the ship gun included) are set so that a session lasting about three hours earns enough to buy everything to its top level. Credits you spend carry across the whole session, and the final screen shows what you earned and spent.
- **Failure only.** Each mission has a 30 minute clock. The first few missions are quick (six to eight minutes); later ones are bigger, with two objectives, and run about fifteen to twenty. The session continues until a mission fails: the clock runs out with the objective undone, or the squad is dead with no lives left. The war escalates every minute of the session, with tougher enemies, harder hits and more heavies, so every run ends: about two hours on average, rarely past three. You can also retire from the pause menu.
- **The ground.** Every mission has its own land: a height map, a water depth map and a surface map. **Deep water** (rivers, lakes, crevasses) cannot be crossed on foot by anyone; **shallows** (the fords), **mud** (river banks, swamps) and **soft ground** (snow, sand, dust) slow everyone down, enemies too. Allies and enemies route round the water by themselves, and the map is always connected: every island worth reaching has a ford to it. **High ground** helps whoever holds it: units on a rise see farther and hit harder than units below them, with a little extra at the very top. Press `H` (or turn it on in Settings) for the **relief map**, which colours height and water depth, draws contour lines and hatches the slow ground.
- **Look and sound.** Every mission has a random operation name, enemy faction (Bugs, Bots, Squids) and biome (ice, grass, desert, jungle, moon); the terrain colours follow the biome. Bases, the citadel, points of interest and objective sites are drawn as buildings. Every weapon, yours and the enemies', has its own synthesised sound, every enemy type has its own voice, and sounds are panned and faded by where you are looking.

All tuning values live in `js/config.js`, and prices live in `js/data/kit.js` (every price goes through `econ.priceMul` in the config).

## For developers

```
npm install                 # esbuild and playwright, only needed for bundling and tests
npm run sim                 # headless balance run with the bot
npm run session             # headless full session: shop, missions, until failure
npm run play                # browser playthrough with screenshots (test/shots)
npm run touch               # touch checks on a phone viewport
npm run r6                  # scenario checks: Helldiver kit, dodge, retreat, blast avoidance, recall, faction tactics
npm run r7                  # scenario checks: facing and back hits, crits, reinforcements, extraction, evacuation, Helldiver calls, free-fire zone, nuke
npm run terrain             # terrain checks: generated ground per biome, routes round water, slow ground, high ground, whole missions
```

The simulation in `js/sim/` has no DOM code, runs at a fixed 30 Hz and is seeded, so a mission is repeatable. The same code runs in the browser and in Node.
