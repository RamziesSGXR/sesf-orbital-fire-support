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

## Controls

| | Desktop | Touch |
|---|---|---|
| Aim | Mouse | Drag the map under the fixed center crosshair |
| Call | Click | CALL button |
| Weapon | `1` UAV scan, `2`-`6` orbitals, `Q` / `E` cycle, `7` the nuke once a launch site is armed | Weapon bar |
| SEAF drop | `G` at the cursor, or click SEAF DROP then the map | SEAF DROP at the crosshair |
| SEAF orders | `X` auto, `V` move, `Z` protect, `N` attack, `C` escort | Order buttons |
| Send SEAF at a target | Click a breach or point of interest | Tap it with an order |
| Armory (upgrades) | `B` | ARMORY button |
| Camera | `WASD`, right-drag, wheel or `+` / `-` zoom, `Space` locks on the squad | Drag, pinch, tap the minimap |
| Other | `T` white-hot / black-hot, `Esc` or `P` pause and rename squads | Pause button |

## How a session works

- **Armory.** You start with credits and a small kit: a UAV scan, three orbital stratagems and SEAF support. Buy more orbitals, more slots (up to five), and upgrades for each orbital, the UAV scan, SEAF (barracks, pod bay, armor, grenadiers, rocket troopers), the strike zone and the squad's reinforcement lives. The armory opens at the start of the session and after every won mission. Mid-mission it allows upgrades only.
- **Briefing and groups.** Each mission rolls 12 stratagems and sorts them into 4 groups of 3. Each group has a random SES Super Destroyer name (you can type your own) and one Helldiver who alone calls that group's stratagems. FRV, Jump Pack and Resupply are group items that any living Helldiver can call. Helldivers wear a code like B4 (group letter and deployment number), or the name you typed. SEAF troops get a rank and surname.
- **You run the sky.** Orbital strikes and the UAV scan are the only things you aim. Calls land only inside the **strike zone** around your allies or a UAV circle. Your strikes hurt friendlies, so mind the squad. You never steer Helldivers or call their stratagems.
- **Helldivers.** They drop in on their own, reinforce automatically from a pool of lives, and announce what they are about to do. Each has one map ping for where they are heading or what they are fighting. You get a notice when one dies or is called in. A Helldiver in a mech climbs out when an FRV arrives, and the FRV has a manned heavy turret.
- **SEAF.** They clear the nearest objective on their own (breaches, then points of interest, then bases). Give them orders to move, protect an area, attack or escort. Pods carry riflemen, grenadiers and a rocket trooper for heavy targets.
- **Targets of interest.** Six to nine points of interest per mission pay credits when SEAF destroy them. When the enemy calls for support, a temporary breach opens that spawns groups until it is destroyed. Allies can ping it.
- **Objectives.** Every mission has one: **Nuclear Launch** (hold the site, then you aim the nuke anywhere), **VIP Rescue** (find the VIP and bring them to the pickup point) or **Destroy the Citadel** (take down the fortress). After the objective, the squad clears bases for extra credits, then extracts for a bonus.
- **Credits.** Kills, bases, points of interest, breaches, the objective and extraction all pay. Credits you spend carry across the whole session, and the final screen shows what you earned and spent.
- **Failure only.** Each mission has a 30 minute clock, and a good one takes about 15. The session continues until a mission fails: the clock runs out with the objective undone, or the squad is dead with no lives left. The war escalates every minute of the session, with tougher enemies, harder hits and more heavies, so every run ends. You can also retire from the pause menu.
- **Look and sound.** Every mission has a random operation name, enemy faction (Bugs, Bots, Squids) and biome (ice, grass, desert, jungle, moon); the terrain colours follow the biome. Every weapon, yours and the enemies', has its own synthesised sound.

All tuning values live in `js/config.js`, and prices live in `js/data/kit.js`.

## For developers

```
npm install                 # esbuild and playwright, only needed for bundling and tests
npm run sim                 # headless balance run with the bot
npm run session             # headless full session: shop, missions, until failure
npm run play                # browser playthrough with screenshots (test/shots)
npm run touch               # touch checks on a phone viewport
```

The simulation in `js/sim/` has no DOM code, runs at a fixed 30 Hz and is seeded, so a mission is repeatable. The same code runs in the browser and in Node.
