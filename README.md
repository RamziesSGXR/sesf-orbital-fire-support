# Orbital Fury

A Super Destroyer targeting minigame for the **Super Earth Special Forces** community. You are the gunner in orbit, watching four Helldivers and their SEAF troops fight across the map below through a thermal view. The Helldivers move, fight and call their own stratagems. Your job is to cover them: scan with the UAV, drop orbital strikes, fire the ship gun and send in SEAF.

## ▶ [Play Orbital Fury](https://orbitalfury.com/)

It runs in your browser on a computer, phone or tablet. There is nothing to install. Turn the sound on. Your progress and best scores stay on your own device. The one thing the game sends out is the **SESF feed**: a short post to the SESF Discord when an operation starts and ends (see [Share your score](#share-your-score)). You can turn it off in **Settings**.

**Languages:** English, Français and Español. Pick one on the title screen or in **Settings**. Operation names, callsigns, ship names and the reports you post stay as they are, so posts read the same in the channel whoever wrote them.

> Unofficial fan project. Not affiliated with or endorsed by Arrowhead Game Studios or Sony Interactive Entertainment. It uses no game assets, text or audio: all art is drawn in code and all sound is synthesised.

## Quick start

0. New here? Press **PLAY TUTORIAL** first, in the tutorial window on the title screen. It walks you through every control in one short, doomed mission (see [the tutorial](#tutorial-last-stand-on-mars)).
1. Open the link above. The title screen is the view from your Super Destroyer: the planet below, the tutorial in the big window, and the menu beside it with **CAMPAIGN**, **QUICK PLAY**, settings, credits, feedback and **SUPPORT** (0.37). **QUICK PLAY** opens **NEW OPERATION**: type a callsign if you want one on your score, set your **SQUAD NAMES** if you like, pick the **difficulty** the operation starts at (3 if you're new) and the enemy, read how an operation works, and press **START AT LEVEL**.
2. The **armory** opens. You start with a UAV scan, three orbital strikes and the ship gun. Buy something or just press **DEPLOY**. Most of it is locked at first: every mission you finish raises your rank and opens more (see [ranks](#how-a-session-works)).
3. Read the briefing while the mission loads, then press **CONTINUE**.
4. The Helldivers drop in and head for the objective. The ship gun is ready at once; your UAV scan and orbital strikes are still charging for the first twenty seconds or so. Aim, pick a weapon and call strikes on the enemy, not on your own squad.
5. Not sure what to do? Press **INFO** (or `I`) at any time for the mission's steps and what the enemy does.

## What's new

Recent changes, by version. The guide sections after this cover everything in full.

**Fixes 2 (0.47).**
- **The vision ladder.** An ally sees farthest, shoots less far than he sees, and throws a stratagem beacon less far than he shoots. Your strike zone never reaches past what you can see (it used to reach about 40 m past it), and a strike range upgrade widens your view with it.
- **Helldivers throw 20–40 m.** Strikes, barrages and zones land 20–40 m from the Helldiver who calls them, and at least 20 m from every ally. Support weapons (recoilless, autocannon, flamethrower, railgun, MG-43, Spear, EAT) aren't thrown: their pod lands beside him and each fires at its own range.
- **Lookout and Propaganda towers do different jobs.** The **Lookout Tower** owns vision: turn it as you place it, and it sees at least twice as far as an ally inside a 180° cone the way it faces, with that ground open to strikes. The **Propaganda Tower** gives no vision. While it stands, every ally near it gets your UAV's boost (speed and dodge), crewed or not.
- **The build queue.** A squad that finishes a build goes straight on to the nearest thing still to build within 60 m. Lay out a whole position and one squad works through it. A squad already building nearby isn't pulled off to the newest order.
- **Foxholes are lines.** Every foxhole is a straight line of places. A foxhole put down near the end of another snaps on and carries the line on, like wire. The automatic trench links are gone.
- **Building while paused.** Wire and foxholes planned in the pause snap to each other as you lay them out, and go down exactly where the plan showed.
- **The Defilade Bastions' corner.** A third layout beside RING and LINE: an L of walls, one arm across the front and one down the left flank (turn it with Q / E).
- **Bug fixes from the SESF testers:**
  - Tutorial cards stay on screen at any UI Size (at 130% they landed partly off it).
  - In the tutorial, a stratagem bumped out of a full bar by a new one can be put back: it shows at the front of its armory tab with **EQUIP**.
  - In the pause, a stratagem you pick shows its own rings at once, and squads' order lines start from where the squads are now (after picking troops into a new squad, say).
  - Calling stratagems in the pause and then picking the ship gun before you unpause keeps the ship gun in hand.
  - Formations (Loose, Wedge, Line, Column, Ring) can be picked in the pause.
  - The extraction pad is never put on an objective (it once landed on an evacuation bunker).
  - A pickup point with more troops than one pelican carries gets a pelican per load, all at once, while the fleet has them.

**Fixes 1 (0.46).**
- **Every operation saves itself.** A new operation takes the first free save slot when it first drops, and saves there after every mission: no need for **SAVE GAME** (it's still in the menu to pick a slot yourself). The armory says "Operation saved to slot n" after each mission. If all three slots are in use, the game asks which one to overwrite before the first drop, or you can **DEPLOY WITHOUT SAVING**.
- **An ended operation can't be loaded again.** Ending an operation, by choice or with a failed mission, now clears its save slot too. **RETRY MISSION** after a failed mission still keeps it: the slot comes back with the retry.
- **The SESF feed hears more operations.** If the page is closed or put away on the debrief of a failed mission, the end of the operation is still posted. An operation saved before 0.43 now posts its start at its next drop.
- **The title screen.** **LOAD GAME** is above **CAMPAIGN**, and **PLAY TUTORIAL** looks like the other menu buttons.
- **SEAF drops are a squad of their own.** A drop no longer joins whichever squad is selected (and takes on its orders, such as escorting the Helldivers across the map). It comes down as a new squad and holds where it lands. With all nine squads in use, it joins the one nearest where it lands. The whole load gets off the pelican at once.
- **Move orders pull troops out of a fight.** A move order (or a drawn route) is a forced move: the troops keep going and fire on the way, and only stop to fight once they get there. Auto, attack, protect and the other orders still stop to fight what they meet.
- **Helldivers throw big stratagems further out.** An attack stratagem now keeps its whole footprint clear of the squad (a 380 barrage at least 34 m from any ally, the 500 kg 34 m, a walking barrage 45 m), so a barrage no longer lands almost on the Helldiver who called it. They also don't throw a second area strike on ground another strike is already hitting. Supply, turrets, mines and shields still go close.

**Name your operation (0.45).** QUICK PLAY's **NEW OPERATION** screen has an **OPERATION** field, under your callsign. It starts with a rolled name: keep it, press **ROLL** for another, or type your own (up to 24 letters, digits, spaces and - . ' & !). "Operation" goes in front for you. Leave it blank for a rolled one. The name is used everywhere: the briefing, the HUD, the save slots, the after action report and the SESF feed. The campaign keeps its own name.

**END OPERATION and the SESF coin (0.44).** **END OPERATION** is easier to find: it's now in the armory as well as on the briefing and on the debrief after a mission that counts. It takes two taps. Ending an operation yourself earns an **SESF coin**. In a later operation's armory, press **SPEND A COIN** and pick any unlock or upgrade open at your rank, except the Classified stratagems: it's free. You can hold up to 3 coins, and each operation pays only once (loading the same run from a save slot and ending it again pays nothing). A failed mission's ending pays no coin.

**The SESF feed (0.43).** The game now posts to the SESF Helldivers Discord when an operation first drops (the callsign, the operation and the difficulty) and when it ends (the final score, missions flown and won, the difficulty reached, the time, the campaign chapter, and how it ended). A retry never posts twice. It only posts from the live site at orbitalfury.com, and **Settings > SESF feed** turns it off.

**The enemy never runs out (0.31).** Patrols keep walking in from beyond the edge of the map for the whole mission, even once every base is down: more often as the mission goes on (and when the map is nearly empty, or extraction is open), and in bigger numbers after the first ten minutes or so. They walk past where the squad is and on out the far side; if they spot the squad, they hunt it like any patrol. A dim line in the feed says where one came in.

**The radio tab (0.42.1).** On a phone, the news, radio lines and tips no longer cover the map. They all go into the command radio's log, which every mission on a phone now has. The radio button lights up when there is something new, and turns red for bad news; tap it to read. The tutorial's cards in the hold go away once read, and are kept in the log instead of folding into a banner that repeated HOLD THARSIS. The "HOLD THARSIS" pop-up at the start of the hold is gone too, since the objective line says it. A new tutorial step (step 3 of 15) shows the radio button and what it's for.

**Phones (0.42).**
- **A stratagem armed, a tap aims it.** With a stratagem or weapon armed, a tap on the map slides the map so the reticle sits on that spot, ready for CALL. It no longer orders the selected SEAF there. With nothing armed, a tap still orders them.
- **Cooler phones.** The game now draws at most 30 frames a second on a phone and 60 elsewhere. Before, a 90 or 120 Hz screen drew it as often as the screen refreshed. A phone also draws at 1.5x its screen's CSS pixels at most, the minimap redraws 10 times a second, and the pause menu redraws the still game only a few times a second. **Settings > Frame rate** changes the cap (30, 60 or no limit), and Graphics: High lifts the resolution cap.
- **The HUD fits the screen.** The HUD is as tall as what the browser actually shows, so the command panel at the bottom is no longer half hidden behind the browser's toolbars (the Discord and Chrome in-app browsers among them).
- **The minimap is folded away** on a phone until **MAP** opens it (MAP sits at the end of the top row when the phone is upright). A small − on its corner folds it again, and the choice is remembered. Folded, it leaves a narrow column at the right, so the Helldivers' chips and the objective get the room.
- **No overlaps.** The tutorial's card no longer covers the camera and radio buttons, and a rank in the tutorial is one short line low on the screen for a moment, with nothing to answer (what's new waits in the ARMORY).
- **Credits:** SESF tester Muffin has been added.

**AI tools in the credits (0.41.1).** The CREDITS screen lists Claude (Anthropic) under Technology, as the AI tool used as a coding assistant during development.

**Save slots (0.41).** Three save slots. **SAVE GAME** in the pause menu saves your operation, QUICK PLAY or campaign, and from then on it saves itself to that slot after every mission. **LOAD GAME** on the title screen picks it back up from the armory. Saving during a mission keeps the run as it was at the drop, so that mission starts over when you load it. A failed mission leaves the slot as it was. The run under way is also kept safely now if the tab closes mid-mission: you come back to the same mission. Saves are kept in the browser's storage, on this browser only. See [how a session works](#how-a-session-works).

**The war goes on after the campaign (0.41).** Once the last chapter is flown, the campaign's run carries on as an endless run, with everything in its armory: credits, rank, and all you bought and equipped. It always did this if you went straight on. Now it can also be picked up later: the campaign screen has a **THE WAR GOES ON** card with **CONTINUE** at the top, the title screen says which mission is next, and a save slot shows it.

**A rank every mission (0.40.1).** Ranks come one per mission now, so the whole armory is open after nine missions; it used to take thirty. Each rank still pays its level bonus (400 cr at rank 1, up to 4,000 at rank 9), and the four classified stratagems come at missions 6 to 9. Each rank now adds an eighth of a level to the difficulty instead of a quarter, so a session climbs at about the same pace as before.

**The squad knows when a fight is lost (0.40).**
- **Breaking off.** If three Helldivers go down close together inside two minutes, or a wave far bigger than the squad can hold closes in, the squad breaks off. It makes for a side objective well away from the trouble if one is open (and there's time), or else pulls back about 150 m to the safest spot nearby, on the move even under fire. It regroups there and goes back to the job. A side objective it broke off from is left alone for four minutes. It won't break off while it holds a site, carries the VIP or works a Hellbomb, and not more than once every two minutes.
- **The edge of the map.** A hurt Helldiver pulling back used to be pushed into the edge of the map and pinned there. Now he slides along it and back in, toward the side with fewer enemies.
- **Wipes.** If the whole squad goes down at once, it drops again together, 110 to 170 m from where it fell, on the quietest side (away from the enemy round where they fell, out of bases' detection rings, well inside the map).
- **Full kit.** Every Helldiver who comes back drops with a full kit: four stims, six grenades and the Ultimatum. Support weapons and stratagems are called again as usual.
- **Grenades and Ultimatums shared out.** The Helldivers no longer all throw at the same target. A target another Helldiver has just thrown a grenade at, or has his Ultimatum on, is left to him. The squad's Ultimatums go at least 2.5 seconds apart and at different targets (a super heavy can take more than one), and only one of them empties his whole pouch at a time. SEAF do the same: a group another trooper (or a Helldiver) has just put a grenade on is left alone for 2 seconds, and a heavy another Specialist has just fired an EAT-17 at is left for 1.5 seconds (a super heavy can take them all).
- **The bot commander jams in bursts**: 10 seconds on, then 20 off. Its label counts down to the next burst, and a ring closes in just before it starts. Strike between bursts, or kill it.
- **Spore towers** (bugs, about three maps in five): a new side objective. It's a fungal stalk breathing out a green cloud 150 m across, and every ally inside the cloud sees less than half as far while it stands. Shoot it down like a broadcast tower; the squad goes for it as a side task.
- **Level 10 is winnable.** The war's escalation at the top levels is flattened (war minutes 42 at level 10, was 60), so enemies at level 10 are less tough and hit less hard than before, and a session started at 10 can usually win its first mission. Levels 1 to 3 are unchanged, and the climb past 10 goes on as before.
- **Specials come with the heavies.** The hive guard, the bot commander and the fleshmob are now drawn from the heavy share of every wave (a third of it) instead of from the mediums. They share the heavies' cap on how many can be alive at once, so the difficulty level and the war's ramp scale both together. Each wave still has about as many heavies, plain mediums and specials as before.
- **Concertina wire is free (0.39.2)**, strung on the spot by the squad like a foxhole: no crate, no pelican. Heavies are slowed by it now (under half speed) and can't tear it; only a super heavy can.
- **Defended sites come under real attack.** The nuke launch site, the evacuation, the oil pump and the VIP's landing zone are what the enemy most wants the squad off, so it comes harder there:
  - Every call comes in from two sides at once.
  - Calls come a little faster.
  - Calls stay big even after enemy bases are destroyed.
  - Up to 70 enemies can gather round the site before the next call waits (was 60).

  With the test bot at level 6, about twice as many enemies are round a site at any moment as before. The evacuation and the oil pump, already the hardest to hold, get less of the increase.
- **Bigger pickups.** A pickup point is 40 m across (it was 18 m), and the pelican takes every SEAF trooper standing in it, however many there are, not just one drop's load.
- **Picked-up SEAF come back sooner.** Troopers brought back down from the destroyer cut that pelican's cooldown: a full load of them comes round 60% sooner. Those one drop can't carry stay aboard for the next drop and cut its cooldown too.
- **Every enemy can miss.** No enemy attack is sure to hit any more:
  - The bug charger, the hive guard and the fleshmob now miss about one swing in seven.
  - The harvester's beam sometimes goes wide.
  - The bug titan's stomp sometimes lands beside its target.
- **Illuminate overseers carry rifles.** The squids' mediums now hold a rifle and fire quick gunshots, with a crack instead of a warble. They do the same damage a second as before.
- **Not everyone gets out (tutorial).** At 100 personnel off Mars, Tharsis Control stops the game to tell you plainly that there are too many people and too many of the enemy, and that most of the Special Forces on Mars won't leave it. The line goes on the command radio log too.
- **Trenches join up by themselves.** A new foxhole is trenched to the nearest foxhole within about 30 m (it was 12 m end to end), and to a second one off to another side. A chain of foxholes carries on and a ring closes on its own, without a web of crossing trenches: each foxhole takes at most three. The ghost shows the trenches it will get, and none crosses water.
- **No building on enemy bases.** Nothing can be put down on an enemy base, or reach onto one, while it stands. The same goes for fortress parts, the defence cannon and shield dome, outposts and enemy side structures. Once it's destroyed, its ground is free. The ghost turns red and says so.
- **The nuke flies.** Fired, the nuke now climbs off the launch site on a pillar of smoke, arcs over the map with a long trail (a white dot on the minimap too) and dives onto the mark. Just before it lands, the camera goes there, pulled back to take in the whole blast, holds a moment after, then goes back to where you were.
- **Operation bonus.** The longer an operation runs, the more it pays. Every mission already done adds 0.2 to the credits you earn: the second mission pays ×1.2, the third ×1.4, and so on. This comes on top of the level's pay. The briefing shows it, and so does the debrief's credit line. Score isn't affected.
- **SESF tester Radio Controlled** has been added to the credits.

**The heavy dropship (0.39.1).** Every pelican (SEAF drops, pickups, cargo and the extraction pelican) is now a heavy two-winged jet VTOL: a wide armoured troop bay with a ramp at the back, broad wings with a big jet pod slung under each that swivels down to hover (the nozzles glow white-hot) and back to fly (long jet streaks), and a tall tail.

**Pelicans, pickups and wire (0.39).**
- **The Hangar is open from the start.** It's no longer bought: the Eagles can be bought straight away. What the HANGAR tab sells now is pelicans: the **Pelican Fleet** (one pelican to start, up to six, each dearer than the last) and the **Pelican Bay** (moved from the SEAF tab: more troops per pelican, down or up).
- **PICKUP** (Shift+G, beside SEAF DROP, and on the phone's dock) puts down a pickup point anywhere in the strike zone. If SEAF are already standing in it, a pelican comes for them; if not, it waits like a building: select it and press SEND (or right-click it with troopers picked) and they go to it. The pelican takes up to its load up to the destroyer, and the next SEAF drops bring them back down, wherever you call them. Drops and pickups share the hangar's pelicans, so six pelicans means six in the air at once, not six of each. CALL OFF takes a point away.
- **Every pelican** (troop drops, pickups, cargo and the extraction pelican) is a rocket VTOL now. It comes down from orbit in about five seconds, takes about three to unload or load, and its autocannon fires the whole time; the extraction pelican's fires too.
- **Leaving orbit.** SEAF no longer get pelicans of their own at extraction. When extraction is called you're told to get them to a pickup point. Once the Helldivers are aboard, the destroyer leaves orbit 10 seconds later (the clock counts it down), and SEAF still on the ground are left behind, lost and replaced at a cost like any trooper. The same happens if the time runs out. Only troopers picked up count as SEAF survivors.
- **More time costs fuel.** When the Helldivers ask for more time, each minute costs more the longer the mission has run, and the price is in the request.
- **Turn your builds.** While placing a build, Q and E (or TURN) turn it. Foxholes close together are joined by a trench, so a ring of them round an objective is one trench. **Defilade Bastions** go down as a ring or a line (R, or RING / LINE).
- **Concertina wire**, the first build (no levels; 0.39.2: free, and strung on the spot by the squad like a foxhole, with no crate or pelican): a 12 m run of coils. A light enemy that walks into it stops, then crawls through; mediums wade through slowly; a heavy tears that section down (0.39.2: heavies are slowed too, at under half speed, and only a super heavy can tear it down). A section put down near a free end of wire carries on from it, so you can fence an objective in a few clicks. Nobody shoots at it, and it isn't cover.

**Clear of the Hellbomb (0.38.1).** Once a Hellbomb is armed, every Helldiver and SEAF trooper inside its blast runs straight out of it, even under fire; before, they stood and fought where they were, and most of the squad went up with it. Anyone still caught inside when it goes off may **dive clear**: likelier the nearer the edge (about one in five at the bomb, five in six at the rim; a SEAF trooper half that), and a dive that clears it still costs about a third of his health. A Helldiver in a mech can't dive.

**Light of the hour (0.38).** Every mission already dropped at its own hour and the clock ran on through it (six hours of the day for every hour of play), with the ground tinted and shaded from where the sun or the moon was. Now there's light as well, laid over any map:
- **At night** the ground goes dark, and every Helldiver and SEAF trooper carries a **flashlight**: a beam where they aim (or face) and a little light round them. Buildings have lights by what they are: a foxhole's lantern, a turret nest's work light, the lookout's sweeping searchlight, the propaganda tower's floodlights, a SAM site's red beacons, the artillery cannon's lamp, a light bridge's deck lights, a red flash on one about to be demolished. The objectives, the extraction pad, beacons, supply pods, drop pods coming in, fires, laser strikes and Hellbombs light up too, enemy bases and jammers glow in the enemy's colour, an enemy flare lights the ground red, and Automatons and Illuminate carry lights of their own.
- **The weapons:** every shot has a **muzzle flash** (allies' and the enemy's, the enemy's in their colour) that lights the ground round the gun, bolts, globs and shells glow in flight, tracers have a faint glow, and every explosion lights up its surroundings.
- **By day** the sun warms the ground, more on its side of the map when it's low; the **golden hour** turns it gold, **dusk** violet, and the night moonlight blue.
- **It's only a look:** what anyone can see, hit or be hit by is the same as before, and units, buildings and labels are drawn over the dark, never under it, so nothing is harder to see. Turn it off in **Settings → Lighting**; on the low graphics setting the lights' colour is left out to save time.

**0.37: the title, the tutorial, the Hellbomb, the campaign.**
- **The title screen.** The tutorial is the big window now, with a line on what it teaches and **PLAY TUTORIAL** (it asks for your callsign, with a small SQUAD NAMES button). **QUICK PLAY** (what used to be PLAY) sits under **CAMPAIGN**. Both open **NEW OPERATION**, which asks for the callsign, squad names, the starting level and (for Quick Play) the enemy, and says how an operation works. SQUAD NAMES is no longer on the main menu. **SUPPORT** goes to the developer's GitHub Sponsors page; the credits have it too.
- **Operations.** A session is an operation now, with one name for every mission in it (Operation Iron Harvest, mission 1, 2, 3...), on the briefing, the HUD, the debrief and the reports. Credits, ranks and everything in the armory carry over from mission to mission until one fails: the tutorial, NEW OPERATION and the field manual all say so.
- **The tutorial** starts at difficulty 3 and teaches more: building a foxhole, cover and manning a post, resupply (a Helldiver asks for a pod; you load it), and the Hellbomb (the Great Host drops a cognitive disruptor by the base; the squad clears round it and you put the Hellbomb together). A last card explains how an operation carries over from mission to mission.
- **Hellbomb side objectives.** From an operation's second mission, many maps have a **jammer**: a spore spewer, a stratagem jammer or a cognitive disruptor, by the enemy. No orbital or stratagem lands inside its dashed ring (the ship gun still fires there), and only a Hellbomb brings it down: the squad clears round it and asks you for one. From the second mission on, the enemy broadcast tower takes a Hellbomb too while it's still standing strong.
- **The campaign** is five chapters now, each a kind of mission you haven't flown yet, and the cast teach you something new on the radio as it comes up, with a how-to line for each: **Vacation's Over** (evacuation: the gun, orbitals, SEAF, lives, extraction), **Black Gold** (new: pump the oil; building, posts, cover, resupply, demolition), **The Long Night** (VIP at night: thermal, the UAV, escorts, flares), **Spore Season** (new: the citadel and a spore spewer; bases, side objectives, jammers, the Hellbomb) and **Freedom Vista** (the nuke: holding a site, more time). **Your progress is saved on this browser:** a cleared chapter stays cleared, the next one opens, and it carries on with the kit, credits and rank you had when you cleared the one before. The campaign's run is kept apart from Quick Play's, so starting one never loses the other.

**Fixes (0.36.1).** The tutorial's SEAF lesson works again: only the shelter is held when it starts, so there is room to drop the second squad (put it by the hangar; skip the lesson and that squad is at the hangar when the shelter opens). The tutorial starts at difficulty 3. On a computer the number keys always pick your weapons, even with the BUILD tab open: builds are picked with a click.

**Demolish (0.36).** Select any building you've put up (foxhole, bastions, turret nest, lookout, light bridge, propaganda tower, SAM site or artillery cannon) and press **DEMOLISH** in the selection panel, or `Delete` on a computer. The charges go on with a three-second fuse: a red ring shows how far the blast will reach, and anyone inside the building steps out. Press it again before it blows to pull the charges. When it goes up it hits every enemy inside the ring (credited to you), never your own troops, and the building comes off the map; a light bridge's deck comes off the water too. Let the enemy swarm a nest, then blow it. There's no refund.

**0.32.** The difficulty climbs faster: about three fifths of a level every mission (it was two fifths) and a quarter of a level more for every rank you earn, so the more of the armory you've opened, the harder it gets (see [difficulty](#difficulty)). `Ctrl`+`A` picks every trooper on the map. And a fix: a SEAF trooper who goes down now sees only what's right round him (he used to keep his full view while he lay there), and one who dies stops showing the map at once.

**Cleaner map (0.31).** The buildings you put up (foxholes, bastions, nests, towers and the rest) no longer have a name over them on the map. Select one and its name and crew show over it; the cyan ring still marks the ones your troops can use. See [tips](#tips) for the reinforcement changes.

**The title screen on a phone (0.35)** fits on one screen with no scrolling, held upright or sideways. The name sits on one line, the long notes under the difficulty and the enemy are left out (the level's name stays), and the menu is two buttons to a row. On phones and tablets the view from orbit behind it is drawn at 30 frames a second, which looks the same and saves battery.

**Music (0.30, 0.33).** The game has a score, made the same way as everything else: synthesised live in your browser, with no music files. Each part of the game has its own piece:
- **The menus and the armory:** *Orbit*, a calm theme in D minor. A music-box bell over a soft pad, and every other time round a slow melody.
- **The loading screen (the briefing):** *Briefing*, a clock ticking over a low pulse, with data blips and a slow swell. You're waiting to drop.
- **The start of a match:** *Drop*, ten seconds, once. A riser and a tightening snare roll, the whoosh of a hellpod coming down, then a big hit and a short march into the battle music, which keeps its drums going for a few bars before it settles.
- **In a match (0.33):** each enemy has its own battle theme, and each theme has two sections that take turns, so it doesn't loop the same few seconds:
  - **Terminids:** *Bug Hunt*, tribal drums, toms and a skittering hat (A minor).
  - **Automatons:** *Iron Front*, a square-wave bass line, metal clanks and four on the floor (C minor).
  - **Illuminate:** *Cold Light*, a shimmering arpeggio, rim clicks and a deep pulse (F# minor).

  All three follow the fight. They're calm when it's quiet. A pulse comes in when the enemy closes on the squad, the theme's own colour and drums join in a firefight, and in a heavy one everything plays, with a deep braam on each chord change. It falls back when things go quiet.
- **A ton of enemies on screen:** *Swarm*, faster and darker, with a driving 16th-note line, double-time drums and a braam every bar, now in two sections. It comes in when the screen fills up and goes back to the battle theme once it has thinned out for a few seconds.
- **The end of a match:** *Victory* when you win (a big hit and rising bells, then an anthem that carries through the debrief), and *Fallen* when you lose (a slow horn line and a funeral drum, also for the end of a session and the end of the tutorial).

**Smooth changes (0.33).** The music never cuts from one piece to the next. A change waits for the end of the bar (or the beat, when it can't wait, like the end of a match). The old piece keeps playing for a moment as it fades while the new one fades in, and going into *Swarm* the old bar ends on a rising sweep. In a match, the music getting busier or calmer also lands on the bar, with a snare fill when it builds up, and each layer fades in or out over a second or two.

A super heavy arriving gets a hit of its own. Cinematics and the pause turn the music down.

**The AUDIO settings (0.29).** **Settings** is in sections now: **GAME**, **AUDIO**, **DISPLAY** and **CONTROLS**. **AUDIO** has:
- **Master volume:** everything together.
- **Music volume:** the score on its own.
- **Music:** **Dynamic** (the match music follows the fight, with *Drop* and *Swarm*), **Ambient** (a match stays calm whatever happens; the menus, briefing and endings play as they are) or **Off**.
- **Effects volume:** weapons, explosions, alarms and the ship, on their own.
- **Mute all.**

Each volume shows its per cent beside the slider, and every choice is saved on your device.

**The command radio (0.28).** In the tutorial and the campaign a radio button sits by the minimap (on a phone, in every mission: 0.42.1). It keeps everything said on the radio, to read again: the briefing (even if you skipped the cinematic), what the cast said during the mission, and the debrief. The cast also chat among themselves now and then; that chatter only goes to the radio (the button lights up when there is something new), so the feed stays clear. Nothing in it is an order you missed. In the tutorial it's Base Tharsis: Tharsis Control, the Pelican lead and a SEAF sergeant. (0.42.1) On a phone the whole feed goes there instead of over the map: the news, the radio lines and the tips. The button lights up when something new comes in, and turns red for bad news. The tutorial's cards in the hold are kept there too, and its third card is now about the radio.

**SEAF reinforcements (0.27.3)** wait where they land for your orders instead of running off: they fight anything that comes at them, and if the drop zone has a structure or cover in it (a bastion, a foxhole, a nest, a rock line) they go straight to it.

**On phones and in French or Spanish (0.27.3)** the labels that ran long are fitted to their buttons, the armory's tabs sit three to a row on a narrow screen, and a tutorial card no longer covers the drop countdown.

**On a computer (0.27.1)** the menus use the whole screen: the campaign, settings, controls, the debrief and the end of the tutorial are laid out in columns so they fit without scrolling, the armory lists two items to a row, and the field manual, mission info and credits spread across a wider panel.

## Tutorial: last stand on Mars

**Mars, 20 May 2185.** Within the hour after New Haven falls, the Illuminate **Great Host** enters the Sol System on its way to Super Earth, and Mars is in the way. The Super Earth Special Forces hold **Base Tharsis** and the last Pelicans off the planet, and you are their fire control on the destroyer overhead.

Press **TUTORIAL: LAST STAND ON MARS** on the title screen. A short cinematic opens it: Mars from space, and how the Great Host came (**SKIP** or a tap ends it). Then a card walks you through the controls one at a time. Each card stops the game while you read it and sits next to the thing it's about, which lights up. **GOT IT**, or just starting to do it, lets the game run again, and the card folds to its heading at the top until you've done it (or press **SKIP**): looking around, the tactical screen, pausing, picking troops and giving them orders, building, dropping the Helldivers, the ship gun, the UAV, an orbital strike, a SEAF drop and a Harvester. Each lesson sends a small group at the base to practise on. Then the shelter opens. Personnel run for the hangar, and every Pelican that lifts takes ten of them off Mars, while the Illuminate come in waves, bigger every time.

**The Great Host comes in stages (0.26).** At first only light squids come at the base. With 30 personnel off Mars (or after a while anyway) heavier ones join them, at 60 the first Harvesters, at 90 a Harvester in every wave, and at **120 it becomes overwhelming**: waves every few seconds, each bigger than the last, several Harvesters at a time, tougher and harder-hitting by the minute. The log calls out each stage.

**Ranks in the tutorial (0.26).** The last stand is one long mission, so its ranks come with kills (10, 25, 45, 70, 100, 140, 190, 250 and 320) rather than missions. Each one pays its level bonus at once and a prompt says what's new, with **SHOW ME** to open the armory on it. In the tutorial everything your rank has opened can be bought mid-mission, new stratagems included (they go straight into a free slot).

It can't be won. Once the evacuation opens, the waves never stop: they come faster and hit harder every minute until every Helldiver is dead. Then the Great Host burns the plain to glass, the camera pulls back over it, and a last cinematic shows Mars burning as the Host's ships pass. The end screen tells you how long the base held and how many people got out. **START THE EVACUATION** skips the rest of the lessons at any point. The tutorial doesn't touch your saved session, and **PLAY A SESSION** on its end screen starts a real one.

## Your job

From difficulty 3 up the Helldivers can't win this alone. Left to themselves they run out of lives before the job is done, and the run ends. What you do from orbit decides whether they get out. Every minute you spend covering them is a minute you're not hitting something else, and that choice is the game.

- **Select, then aim.** With no weapon armed, your cursor selects things: posts, sentries, defence sites and SEAF troopers. Press a weapon key (or tap the weapon bar) to arm it and the reticle appears; after one call the cursor goes back to selecting. Hold `Shift` while you click to keep it armed. A right click or `Esc` puts it down. The ship gun stays armed until you put it down.
- **You run the sky.** You aim the UAV scan and the orbital strikes. Strikes can only land inside the **strike zone** around your allies or inside a UAV scan circle. Your strikes hurt friendlies, so watch where the squad is.
- **Stratagems by kind (0.23).** Your weapon bar colours each one like Helldivers 2 does: **orbital strikes** (orange), **Eagle strikes** (yellow) and **minefields** (green). **Eagles** are bought in the armory's **HANGAR** tab. The Hangar itself is open from the start (0.39); the first Eagles open at rank 2, and one Eagle Strafing Run comes with the Hangar (0.31), put straight into a free slot if you have one. They come in quickly, but the Eagle has two runs and then flies back to rearm (about 110 seconds); the button shows `EAGLE 1/2`, then `REARM 98S`. A save that bought Hangar levels before 0.39 keeps them: more runs, a shorter rearm and a shorter wait between SEAF drops. **Minefields** seed the ground where you call them: only the enemy sets a mine off, but the blast hurts anyone near it. Incendiary mines leave fire, and anti-tank mines let the small ones walk over and wait for something heavy. Every kind of strike has its own explosion: fire for napalm, a cloud for gas, a blue crackle for EMS, a huge fireball for the 380 mm and the 500 kg, a beam for the railcannon, dust and sparks for strafing runs and cluster bombs.
- **The ship gun** (slot 8) fires anywhere you can see, needs no strike zone and never hurts allies. Its rounds are heavy-penetrating (0.26): full damage on mediums and most of it on heavies (a round that lands on a big enemy's body counts, not only one at its centre), so a long burst brings down a Harvester, shield and all. Hold to fire. It has its own ammo that refills by itself. It is the one weapon ready the moment a mission starts.
- **Utilities** help the squad instead of hurting the enemy. Buy them in the armory and put them in an orbital slot: a **med pod** that heals every ally where it lands, **smoke** the enemy can't shoot through, a **shield dome**, and a **sentry**. They are safe to drop right on top of your allies.
- **SEAF troops** are yours to command. Each drop comes down as a squad of its own (S1 to S9; only squads with troops show). Click a trooper to pick him, click him again for his whole squad, `Shift`+click to add one, or drag a box round several. Give a pick an order and it becomes a squad. `Alt`+`1`-`9` (or a double tap on a squad button, or the squad row on the TROOPS tab) moves what you picked into that squad. **DISBAND** (`M`) takes troopers out of their squad: they hold where they stand. You can also draw a play on the map: a route to run, a line to hold or a ring to defend. An order stays until you give another one.
- **Pelicans (0.39).** SEAF drops and pickups share the Hangar's pelican fleet: you start with one, and the armory's **HANGAR** tab sells up to six (**Pelican Fleet**) and more troops per pelican (**Pelican Bay**). Each pelican comes down from orbit in about five seconds, takes about three to unload or load, and its autocannon fires the whole time. A pelican is away until it comes back, so a bigger fleet means more in the air at once. **PICKUP** (`Shift`+`G`) marks a spot 40 m across: every SEAF trooper standing in it is flown back up to the destroyer, and the next drops bring them back down on a shorter turnaround (a full load of them, 60% shorter).
- **SEAF roles (0.26).** Every squad comes down with a **Squad Leader** (Liberator, a radio pack with its antenna, a pad on the right shoulder, a mic on the helmet, and a gold chevron over him on the map). If he falls, the senior trooper takes over. **Riflemen** carry the Liberator too and go for cover close by when a fight starts. Some drops bring a **Specialist** (the most armour, an MG-43 he braces behind and barely moves while it fires, and an EAT-17 for heavies, armour and dropships) and a **Medic** (light grey armour with red, a white medical pack, a helmet that comes forward over the cheeks, sometimes an orange uniform, and an SMG-37). A Medic stims anyone hurt within 20 m (a full stim close in) and revives the downed: a trooper who falls with a Medic in reach goes down instead of dying, lies there with a red cross over him, and is back up at 40% health if the Medic gets to him within 14 seconds. Everyone carries **G-12 grenades** for groups. The armory's SEAF upgrades: **G-12 Grenades** (one more each a level), **Specialists** (more drops bring one, and the EAT hits harder), **Field Medics** (more drops bring one, and they work faster) and **Leader Radios** (Squad Leaders call Eagle fire missions on big groups; without it they fight like Riflemen).
- **The command panel.** It's always up, at the bottom centre of the screen, and it changes with what you pick or the key you press (0.20). It's the same height in every context, so nothing jumps when it changes. Three buttons on its left switch it: **TROOPS** (SEAF drop, the orders, the squad bar, DRAW, DISBAND and the formations), **BUILD** (`B`: everything SEAF can build, `1`-`8`, and a button for every crate and group of posts on the map) and **ARMORY** (`Y`: upgrades bought on the spot, with the war still going). The same key, or `Esc`, goes back to the troops. It runs in **real time**: the fight goes on while you use it. What you've selected shows in its own panel to its left, the way Age of Empires does: a tile for each trooper (his role and health; tap one to pick him alone), or a post with its crew inside it and its doors; it flashes when the selection changes. The Helldivers' health and status sit just above it, always in view. Your weapons are a strip just above it. With troops selected, right-click the map (tap it on a phone): on a post they man it, on an enemy they attack, anywhere else they move.
- **Pause to look.** `Space` (or `P`, or the pause button) stops the game. You can look around the map and the tactical screen, but no orders go out until you play on.
- **The start of a mission.** Each mission opens with a **30-second countdown** before the Helldivers drop, with the game running and every panel shut. The first SEAF drop is ready straight away and can come down at the landing zone. Use the time to call SEAF in, give orders and build; **DEPLOY NOW** (`Enter`) drops the Helldivers early. Sometimes a SEAF squad is already holding the site the Helldivers are heading for (a launch site, an evacuation site, an oil pump or a VIP's pickup point), under your orders from the start; the briefing says so.
- **Credits** show big at the top left, with a flash of what just came in or went out.
- **SEAF build.** There is no limit on how many you put up, but each one costs credits and takes time, so each one is worth having:
  - **Concertina Wire** (0.39, the first build, no levels; free since 0.39.2 and strung on the spot by the squad, like a foxhole): a 12 m run of coils. A section placed near a free end carries on from it. A light enemy that walks into it stops, then crawls through; mediums and heavies wade through slowly (heavies at under half speed); only a super heavy tears the section down (0.39.2). Nobody shoots at it, and it isn't cover.
  - **Foxhole** (free): light cover, and troopers in it shoot faster. It is dug, so no crate is needed. It is dug for the troops who dig it (0.28): a place for each trooper of the squads you picked (three to twelve), in a straight line across the front (0.47: always a line; the pit and the crescent are gone). Pick two squads together and both dig it and man it; with every squad picked, the nearest one digs its own size. (0.47) Foxholes chain like wire: one put down near the end of another snaps on and carries the line on, so a trench line is laid out a section at a time (in the pause too). The ghost shows the shape, where it snaps and who digs it before you place it. Nothing can be built on an enemy base while it stands (0.40).
  - **Defilade Bastions**: a ring of walls the troops fight from, (0.39) a line of them, or (0.47) a corner: an L, one arm across the front and one down the left flank. `R` or the RING / LINE / CORNER button while placing; Q / E turn it.
  - **Heavy Turret Nest**: a heavy gun behind a thick concrete wall, with three times the health the old MG nest had. It hits like a heavy weapon. It needs a crew (they stand inside the wall), and two crew fire faster than one.
  - **Lookout Tower**: (0.47) it owns vision. Turn it as you place it: it sees at least twice as far as an ally inside a 180° cone the way it faces (and an ally's sight all round it), and that ground is open to strikes. A crew sees a fifth farther. It also spots a quarter farther down the cone: enemies there show up on the map with a red mark (seen, but not yet in strike range).
  - **Light Bridge** (0.22: from the ship): place its ghost on a river or a lake shore anywhere an ally (or a UAV) can see, and 30 seconds later a hard-light span comes down across to the far bank. Nobody has to build it. Helldivers, SEAF and the enemy all walk it.
  - **Propaganda Tower**: (0.47) no vision (that is the Lookout's job). While it stands, every ally within a UAV scan's reach of it gets the UAV's boosts (speed and dodge, at your UAV upgrades), crewed or not; a crew widens it. SEAF drops can land at it from anywhere on the map.
  - **SAM site** (unlock in the armory): automatic, with the reach of a UAV scan. It shoots down dropships and warp ships.
  - **Artillery cannon** (unlock in the armory): see below.

  Nothing needs a crew any more: the turret nest, lookout, propaganda tower, SAM site and cannon all work on their own and take longer to build. Nobody goes inside one on their own (0.22): a squad sent to one (or that has just built it) holds beside it, and the game asks whether to send them in. Troopers who go **inside**: they leave their squad, you can't see them, the building takes the hits for them, and it works better (a turret nest fires faster, a lookout and a tower see farther, the cannon reloads faster). Select the post to see who is inside and to bring them out. Foxholes and bastions are cover, for whoever stands in them.

  While placing, `Q` / `E` (or **TURN**) turn the build 15 degrees at a time (45 on the button), so you can face it at the threat. Each build shows its **ghost** first: the building, see-through, where it will stand, which squad will build it (the one picked, or the nearest) and the price, in red where it cannot go. You pay when you order it. A cargo pelican drops a crate at the spot and the squad deploys it: you see it go from the crate to the open crate, to parts going up, to built. Every trooper on it adds speed, and the **Combat Engineers** upgrade in the armory's SEAF tab makes them faster still. If the squad is moved off, the crate keeps its progress: select any squad and right-click the crate (tap it on the tactical screen) and they carry on. A trooper under fire stops working; the others don't. The squad stays on what it built: if you move it away and that was its last order, it goes back. Troops at a post repair it when nothing is shooting at them. Helldivers holding nearby use the posts too. Every buildable except the foxhole is upgraded in the armory's **BUILDABLES** tab.
- **Select a post.** Click or tap anything SEAF built, a sentry or a defence site's walls. Its name, level and health show in a small panel just above it. Like a tower in Age of Empires, a post has a **door**: it sends the selected troops in. As many as fit go inside, out of sight, leave their squad and stay for good, so you can move the squad on. Garrisoned troopers still count toward your SEAF total. Once someone is inside, a **door out** brings them back. On a defence site the door sends the squad to man its walls.
- **Select troops.** Click (or tap) a SEAF trooper to pick him, again for his whole squad; use the squad buttons or `Shift`+`1`-`9` for a squad; drag a box round troopers to pick them.
- **Troops stay in cover.** Helldivers and SEAF holding walls or a post don't step out to shoot at something they can hit from there. Pushed off, they go back.
- **The artillery cannon** (weapon 9) fires a **mini-nuke** anywhere in its range that you can see, on a slow recharge. It hurts allies too, and it only fires while someone mans it. Unlock it in the armory and have SEAF build one, or let the squad take over an **abandoned artillery cannon** some maps have.
- **The Helldivers** play on their own. They go for the main objective and pick up side missions that are on the way. They call their own stratagems (0.23: always with at least two orbital strikes among them, on their own recharges, so keep SEAF clear when they call one in; 0.26: every Helldiver runs on his own clock, so two or three of them can call at the same moment, and the draw leans toward heavy weapons, so nearly every Helldiver has a recoilless, autocannon, railgun, Spear or EAT and some have two. Their calls show as a red beacon with the stratagem's name, not a strike circle: circles are only for your own strikes) and drop back in when one dies, as long as the squad has lives left. They get **20 lives every mission**, and the lives reset at every drop. The Helldivers can't be upgraded in the armory. Each one carries an **Ultimatum** and **six grenades** for groups and heavies (about four bring a heavy down; 0.26: when a crowd piles onto one spot, a heavy gets close or they are falling back under pressure, they throw every grenade they have about a quarter second apart). They mark a target on the map before they use them, so you see it too, and a supply pod reloads both. The Ultimatum is one round, a blast about 9 m across that kills every enemy in it through any armour or shield (a super heavy only loses a big piece, 0.26), saved for heavies or for when they are overrun.
- **SEAF lives cost credits.** Every trooper lost is replaced at the end of the mission, each one a little dearer than the last, so the bill grows fast in a bloody mission.
- **Bases see the squad coming.** Every enemy base has an invisible **detection range**. It stays asleep until someone walks into it or the structure is hit; then its garrison turns out, it keeps sending groups, and its neighbours follow. The Helldivers stop just outside, **mark the base** (a red ring with a countdown) and wait about 18 seconds before they go in: your time to soften it up, bring SEAF in and build. The citadel is one big base: wake any part of it and all of it turns out. SEAF know nothing about the detection range, so walk them near a base and it wakes.
- **Defences start with a set-up.** When the squad reaches the launch site or the evacuation site, it gets 25 quiet seconds to take the walls facing the threat before the enemy comes. You never steer them, but they talk to you: they say what they are about to do, ping where they are going, and ask you for help. At an evacuation the Helldivers split between the walls round the shelter and round the hangar (0.26), facing the threat, instead of standing in the open between them.
- **The UAV helps the squad too.** Allies under an active UAV dodge more often, and move faster when they're not in a fight (0.26: while they're fighting they keep their pace, so the lift doesn't drag them into the enemy faster; enemies never get anything from it). Two armory upgrades, **Target Relay** and **Threat Warning**, make it help more. The scan circle is drawn faint so it doesn't hide the fight.
- **Radar.** Your UAV sweeps the whole map every few seconds and marks every enemy as a blip, even far out of sight. The blips stay where the enemy was until the next sweep, like real radar. A better UAV sweeps faster. The sweep is silent (0.22), so it does not ping over and over.
- **Shooters give themselves away.** An enemy that fires on your allies is marked on the map. Once it has been marked for three seconds it is **locked**, and your strikes and the ship gun can hit it even outside the strike zone.
- **You hold the camera.** It starts at the landing zone and only moves when you move it. Nothing pulls it away: not a supply drop or a super heavy. `F` (or **RE-CENTER** on a phone) locks it on the squad. Arrows at the edge of the screen point to every Helldiver and every SEAF squad you can't see, and they stand out on the minimap. **Double-tap** (or double-click) a Helldiver in the Helldiver list, or a SEAF squad on the squad bar, to move the camera to them.
- **New enemies.** Each enemy brings a medium of its own alongside the others, and kills on them pay three times as much:
  - **Bugs:** the **Hive Guard** leads the swarm in behind an armoured front.
  - **Bots:** the **Commander** hangs back behind the line. Inside its wide red ring nothing can be called down: no stratagem, orbital, UAV scan or Ship Gun round. Kill it with rifles, grenades or a strike just outside the ring.
  - **Squids:** the **Fleshmob** is a slow melee mass that soaks part of every hit.

  Heavies got tougher too. A bug **Charger** shrugs off rifle and rocket fire from the front, but strikes from above still hit it in full. Bot tanks have more health, but their weak points crit more often. Squid heavies carry a **shield** that takes hits first and comes back if they're left alone.
- **Super heavies.** Now and then the enemy sends a giant into the mission: a **Brood Titan** (bugs), a **Siege Walker** (bots) or a **Warp Colossus** (squids). The radio calls it in, a red callout tracks it, and the pelican won't land until it is dead. It is rare early in a session and more likely later.
- **Supply drops.** When the Helldivers run low on stims or grenades, one of them asks you for supplies. You have thirty seconds to notice and answer. Press **LOAD POD** (or `U`) and time slows down while you load the pod: tap each compartment (stims, grenades, ammo) until it's full. What you load is what they get, and a pod filled within five seconds gives the squad a short boost. Press **LOOK** if you want to watch it land. Ignore the request and they make do; they can ask again after a minute.

## Controls

| | Computer | Phone and tablet |
|---|---|---|
| Select | Click a trooper to pick just him, double-click for his squad, `Shift`+click to add or take out one more, or drag a box round some. `Ctrl`+`A` picks every trooper on the map (0.31): their squads together, each taking your next order as itself. Click a post, sentry or defence site to select it. What is selected shows at the bottom left | Tap a trooper (double-tap for his squad; hold a finger on another to add him), or tap a post, sentry or site |
| Arm a weapon | `1` UAV scan, `2`-`6` orbitals, `7` the nuke (once armed), `8` ship gun, `9` artillery cannon, whatever tab of the command panel is open (0.36.1). `Q` / `E` cycle. The reticle shows | Weapon bar. The crosshair shows |
| Fire or call | Click (hold for the ship gun). The cursor then selects again; hold `Shift` to keep it armed | **CALL** button (hold for the ship gun) |
| Put a weapon down | Right click or `Esc` | It goes down after the call |
| Order the selected squad | Right click: a crate (build it), a post (hold beside it), an enemy (attack), anywhere else (move). Each order shows in its own colour: move blue, attack red, protect green, build yellow | Tap the map |
| Mission info | `I` or the **INFO** button | **INFO** button |
| Command radio (tutorial and campaign) | `O`, or the radio button on the minimap's corner: the log opens above the minimap. The pause menu, the debrief and the end of the tutorial have **RADIO LOG** too | The radio button by the camera button: sideways the log takes the minimap's place; upright it opens under the top rows |
| Command panel (always up, real time) | Bottom centre: the troops (orders, squads, formations), `B` build (then click a build; since 0.36.1 the number keys stay on your weapons), `Y` armory. `Esc` goes back to the troops | Tap its **TROOPS**, **BUILD** or **ARMORY** button |
| Garrison a post | Nobody goes into a building on their own: sent to one (or after building it), a squad holds beside it. With the squad selected, right-click the building and a small **GO INSIDE** button shows over it for a few seconds (0.27.3; no more question in the middle of the screen). Or select the post, then its door (the door out brings them back). Foxholes and bastions are cover, not buildings: a squad sent there just takes its places | Tap the building, then **GO INSIDE** over it |
| Demolish a building (0.36) | Select it, then **DEMOLISH** in the selection panel or `Delete`: a three-second fuse (press again to cancel), then it blows, hitting the enemy round it | Tap it, then **DEMOLISH** |
| Big map | `Tab`, `M` or `L`, or click the minimap (bottom right); the same key shuts it. Click a spot on it to look there | Tap the minimap (bottom right), then tap a spot to look there |
| Supply request | `U` (or **LOAD POD**), then `1`-`3` or click the compartments; `Space` loads the next one | **LOAD POD**, then tap the compartments |
| Look at a callout | `J` or **LOOK**: the latest supply drop or super heavy | **LOOK** |
| What does this do? | Hover or pick a weapon, build, formation, stratagem or squad: a one-line tip shows just above it (damage, rounds left, cost, ready or not). **ⓘ** opens the full details. It goes by itself, or at a click elsewhere | Tap it: the same tip over the button; **ⓘ** for the rest, a tap elsewhere closes it |
| Look at a super heavy | **LOOK** on its callout | **LOOK** |
| Pickup point (0.39) | `Shift`+`G` at the cursor: every SEAF trooper standing in it (40 m across) is flown up; if none are, select the point and send troopers to it | **PICKUP** in the dock, then tap the map |
| Turn a build while placing it (0.39) | `Q` / `E`, or **TURN** | **TURN** |
| SEAF drop | `G` at the cursor, or click **SEAF DROP**: its ghost follows the cursor (where the pelican lands, how many troopers, red where it cannot go), then click the map | **SEAF DROP**: its ghost shows at the crosshair; tap the map to move it, then **PLACE** |
| SEAF squads | `` ` `` all squads, `Shift+1`-`9` pick one, `Shift`+click a squad's button to pick it as well (orders go to each, lit with a **+**), `Alt+1`-`9` move what is picked into that squad, `Delete` disband. **MERGE**: click the squads to merge (they are listed over the button), then **MERGE INTO**; click anywhere else to let it go | Squad buttons (double tap to move the pick in; hold a finger on one to pick it as well); **MERGE** the same way |
| Pause, and the drop | `Space` or `P` pauses, to look and plan; `Enter` drops the Helldivers before the countdown ends | Pause button; **DEPLOY NOW** |
| SEAF orders | `X` auto, `V` move, `Z` protect, `N` attack, `C` escort | Order buttons |
| Move the camera to a team | Double-click its Helldiver row or SEAF squad | Double-tap it |
| More time for a full clear | `K` or **APPROVE** | **APPROVE** |
| Draw a play | `R`, then drag: a loop is a ring, a straight stroke is a line, anything else is a route | **DRAW**, then drag one finger |
| Send SEAF at a target | Click a bug hole or point of interest | Tap it with an order selected |
| Armory (upgrades, live) | `Y`, or **ARMORY** in the command panel: the game runs on; upgrades are buttons that fit the panel, in pages when there are many | **ARMORY** in the command panel |
| Camera | `WASD`, drag with the right button, wheel or `+` / `-` to zoom, `F` to follow the squad, drag on the minimap | Drag one finger, pinch |
| Artillery cannon | `9`, once one is built or captured and someone mans it. It reaches the whole map, wherever an ally (or a UAV) can see | Weapon bar |
| Pause and plan | `P`: the game stops, but you can still move the camera, zoom, open the map and pick. Orders, builds, SEAF drops and weapon calls given now are planned (0.22): each shows on the map with its number, the pause strip counts them (**UNDO** takes the last back), and they all go out, in order, as soon as you play on. Build a row of foxholes with a click each. `P` again to play on | Pause button (**II**). It turns into **▶**; tap it or **RESUME** to play on |
| Half speed | `,` or the **1×** button next to pause (it shows **½×**). Every control still works | **1×** button next to pause |
| Menu | **MENU** or `Esc` opens the pause menu: **RESUME**, mission info, the armory, **SETTINGS** (with squad names and HIDE UI), **HELP** (the controls and the field manual), **SAVE GAME** (0.41), **MAIN MENU** and **RETIRE** | **MENU** |
| Hide the HUD | `F2` (again, or **SHOW UI**, brings it back) | **HIDE UI** in the menu; **SHOW UI** brings it back |
| Other | `T` white-hot / black-hot, `H` relief map (height, water and slow ground) | Relief map in Settings |

**Screen layout (0.20):** laid out like an RTS, with nothing on top of anything else (the tutorial's card is the one exception) and nothing that scrolls. Top left, the resource bar: your credits, the Helldivers' lives (when they run out, the mission is lost) and SEAF on the ground. Top centre, the Helldivers' drop countdown (with **DEPLOY NOW**) and big alerts in red, kept off the middle of the map. Top right, the clock and mission, the objective, and requests for supplies or time under them. On the left, the Helldivers (health, what each is doing, stratagem cooldowns), always on show, just above what you have selected. Bottom centre, the command panel, which shows one thing at a time: the troops (orders, squads, formations), building, or the armory. Your weapons sit in a row just above it. Bottom right, the minimap with the INFO, MENU, speed, pause and camera buttons beside it, and a short log of what is happening above it. Buildings your troops can use (posts with places in them, defence sites to man) wear a dashed cyan ring.

**Three layouts (0.21):** the in-mission screen comes in a **desktop**, a **tablet** and a **phone** layout. **Settings > Interface layout** picks one, or leaves it on **Auto**, which chooses by your screen: a short side under about 540 pixels is a phone, a touch screen bigger than that is a tablet, anything else a desktop. The tablet layout is the desktop one with controls sized for fingers (buttons of 40 px or more, larger text). The phone layout puts the game first: **MENU**, **PAUSE** and half speed sit with the resource bar in one thin row at the top; the clock and the objective (tap either for the mission's info) are a thin line too; the Helldivers are four chips (a letter, the health and how many stratagems are ready; tap one for its full row, double-tap to go to them); what you have picked is one line over the command panel, and only shows when something is picked; the weapons sit by **CALL** (in two rows held upright); and the command panel is two rows of big buttons: the squads with **DRAW**, **DISBAND** and **FORM** (it steps through the formations), and the orders. **BUILD** and **ARMORY** pull it up as a drawer while you use them (picking a build folds it away so you can place it), and pressed again go back to the troops. The minimap is small in a corner: tap it for the big map. Buildings your troops can use (posts with places in them, defence sites to man) wear a dashed cyan ring.

Every panel closes with its ✕ button or `Esc`. In **Settings** you can make the in-mission controls bigger or smaller (**UI size**), turn the info tips off, and set the music and sound (**AUDIO**: master, music and effects volumes, the music's style, mute all). **CONTROLS**, the **FIELD MANUAL** (everything you can do, with tips), **SQUAD NAMES** and **SETTINGS** are in the menu, which the armory and the briefing open with their **MENU** buttons too. The armory's **BACK** goes to the title screen, where you can change the starting difficulty before you begin. The briefing's **CANCEL** goes back to the armory; the same mission waits for you when you deploy again.

## Missions

Each mission has a random operation name, enemy (Bugs, Bots or Squids), terrain and time of day. Each has one objective, and later missions have two:

- **Nuclear Launch.** Hold the launch site until it is armed, then fire the nuke anywhere. It flattens everything within 230 m after a ten-second countdown, so give your allies time to clear. Firing it is your job: it never launches itself, and if the launch window closes the squad has to hold the site while it re-arms.
- **VIP Rescue.** Find the VIP and get them to the pickup point.
- **Destroy the Citadel.** A keep with a ring of bases round it, walled together and guarded by a super heavy that turns out when the squad arrives. Knock out the bases round it, then clear the keep: only a **Hellbomb** brings it down. When the squad calls one, a panel opens in slow motion and you put the bomb together: tap the part that lights up (`1`-`4`), in order, before the timer runs out. A wrong part costs time; too slow and it's a dud, and another can be called a little later. A Helldiver arms it, everyone runs (0.38.1: anyone in the blast runs for it even under fire, and one still caught when it goes off may dive clear), and ten seconds later the keep is gone.
- **Evacuate Civilians.** Hold a site while forty-four civilians walk from the shelter to the hangar and fly out. Your strikes can kill them too.

Each enemy also has an operation of its own:

- **Pump the Oil** (Bugs). Hold an oil pump while it fills a tank. Bugs on the pump slow it right down. A pelican lands for each full tank; three loads and it's done.
- **Destroy the Defence Cannon** (Bots). An orbital defence cannon is shooting at your ship. While it stands the ship keeps dodging: your strikes land wide and the ship gun spreads more. Knock it down like a base.
- **Bring Down the Shield Dome** (Squids). A big shield dome covers two warp-ship bases. Nothing from outside gets through it: no strikes, no ship gun, no fire from outside. The squad and any SEAF you send walk in and knock out the nodes beside the tower in the middle; then the dome falls and the bases are fair game.

**Pick your enemy.** The title screen has an **ENEMY** choice: **RANDOM** (the default), or Terminids, Automatons or Illuminate for every mission. You can change it in **Settings** during a session; it counts from the next mission.

The places the squad has to hold (the launch site, the shelter and the hangar, the VIP pickup and the extraction pad) have **low walls** round them. Helldivers and SEAF spread out behind them instead of bunching up in the middle, and take less damage there. You can select these walls to send SEAF to man them.

**Side missions** sit around the map, more on bigger maps. The Helldivers take the ones close to their way:

- **Radio tower.** A Helldiver stands by it while it powers up. From then on the ground for 200 m around it stays in view, and you can call strikes there, for the rest of the mission. A freed SEAF squad or a destroyed enemy broadcaster does the same.
- **Enemy broadcaster** (a spore broadcaster, broadcast mast or psychic beacon). While it stands it sends the patrols around it after the squad. Destroy it.
- **Hidden SEAF.** A SEAF squad lies low somewhere near the way the squad will walk. You can't see them, or anything round them, until a Helldiver or one of your SEAF walks close by. Then they join your SEAF. Nobody goes looking for them.
- **Abandoned artillery cannon** (from the second mission, on some maps). A Helldiver gets it working again, and then it's yours to fire as weapon 9 while someone mans it.

**Finds** lie about the map: a crashed pelican (ammo for the ship gun and the Helldivers' support weapons), a lost hellpod (a support weapon), a Super Earth strongbox (credits) and a SEAF supply cache (everyone near patched up). Whoever walks into one, Helldiver or SEAF, takes what's in it. The squad doesn't go out of its way for them, but most lie near the way. There are only a few targets to blow up now.

Once the objective is done, the Helldivers decide what's next. With **more than three lives left** and the time for it, they go for a **full clear**: every base and side mission on the map, for a big bonus. If they have the lives but not the time, they **ask you for more minutes**: a callout says how many and what it costs in credits. Press **APPROVE** (or `K`) and they go for it; say nothing and they head out. If lives run down to three, they break it off. With fewer lives they head straight for the **extraction point**. A Helldiver calls the pelican and the squad holds the pad while the enemy throws reinforcements at it. When the pelican lands, everyone runs for the ramp. SEAF no longer get pelicans of their own (0.39): get them to a **pickup point** first. Ten seconds after the Helldivers lift off, the destroyer leaves orbit, and any SEAF still on the ground are left behind, lost and paid for like any trooper. The same happens if the clock runs out. Extracting wins the mission with full pay. If the squad is lost or the clock runs out **after** the primary objective is done, the mission still counts (**OBJECTIVE COMPLETE**) and the session goes on, just without the extraction pay. If the squad runs out of lives with no Helldiver left standing **before** the objective is done, the mission fails, SEAF or not.

**Maps grow with every mission.** Maps are round, like the minimap. The first is 760 m across, small enough for a full clear with your help. Each mission adds about 110 m, up to 1.5 km. Missions take ten to fifteen minutes. The extraction pad is on the map from the drop, locked until the objective is done, so SEAF can dig in round it early. A Helldiver there throws a blue beacon; when it lands the pelican is two minutes out, the enemy always comes for it (drop ships, or bugs breaching), and once it lands everyone has twenty seconds to get aboard. After about an hour of a session each mission has two objectives. Each mission has a 30-minute limit, and each gets harder the longer it runs: more enemies on the field and harder hits.

## Enemies

Every enemy comes in three sizes, plus a special medium and a super heavy of its own. Health is at the start of a session; the higher the difficulty and the longer the war, the tougher they get. Reach is how far they hit you from.

**Bugs (Terminids)** swarm in big loose packs from every side. They're the fastest, hit hardest up close, and have the shortest sight.

| Enemy | Health | Reach | Notes |
|---|---|---|---|
| Swarmer (light) | 30 | 5 m | Comes in numbers |
| Bruiser (medium) | 200 | 18 m | Spits from a distance |
| Hive Guard (special medium) | about 340 | melee | Leads the swarm behind an armoured front |
| Charger (heavy) | 1,000 | melee | Runs at you; its front takes only about 60% of a hit, so hit it from behind or from above |
| Brood Titan (super heavy) | 4,500 | 50 m | Spits and stomps |

**Bots (Automatons)** are slow, but they stand off and form a firing line. They see the farthest.

| Enemy | Health | Reach | Notes |
|---|---|---|---|
| Trooper (light) | 30 | 38 m | Fires from range |
| Raider (medium) | 200 | 42 m | The best range of the mediums |
| Commander (special medium) | about 280 | 44 m | Hangs back; nothing can be called down inside its wide red ring |
| Tank (heavy) | 1,500 | 58 m | Splash cannon; its weak points crit more often |
| Siege Walker (super heavy) | 5,500 | 62 m | Keeps dropping bots while it stands |

**Squids (Illuminate)** spread out and surround whoever they hunt.

| Enemy | Health | Reach | Notes |
|---|---|---|---|
| Drone (light) | 30 | 30 m | Spreads out |
| Warrior (medium) | 200 | 36 m | An overseer with a rifle: quick shots |
| Fleshmob (special medium) | about 600 | melee | Slow; soaks about 60% of every hit |
| Harvester (heavy) | 1,000 plus a shield | 62 m | A charged beam; its shield is a bubble that comes back if you leave it alone |
| Warp Colossus (super heavy) | 3,800 plus a shield | 78 m | The longest reach in the game |

Most of what comes at you is light; mediums, heavies and super heavies are rarer, and only so many can be on the field at once. Every enemy attack can miss, the melee ones and the beams included. Specials pay three times as much for a kill. A super heavy has to die before the pelican will land.

## Tips

- **Hit them from behind.** Every unit shows which way it faces: Helldivers have a visor at the front and a blinking backpack edged in their squad colour at the back; enemies have eyes or sensors at the front, and the bigger ones have a glowing weak spot on the back. Hits from behind do 1.5× damage, and 2.2× on heavies.
- **Critical hits** do double damage. Your orbital strikes crit most often (14%), then the ship gun (10%).
- **Everything can be destroyed.** Bases, the citadel, points of interest, enemy broadcasters, bug holes and dropships all go down to enough fire. Bases go down faster than they used to.
- **Bases close together work together.** Bases come in clusters, and the clusters get bigger and tighter later in a session and on higher difficulties. When one wakes, its neighbours turn out a few seconds later, and each one sends troops faster for every neighbour still standing. Take them out one at a time, and keep SEAF away from the ones you aren't hitting yet.
- **Watch for flares.** A patrol that spots the squad or gets shot may fire a flare. Kill the one holding it within about four seconds and no reinforcements come. If you're too late, **bugs** dig up out of a hole, and **bots** and **squids** arrive by ship. Troops the ship has just let down are shielded by it (a dashed ring) until it pulls away. Since 0.31:
  - **Bug holes** spill bugs a pack at a time for longer, so more come out in all. A fresh hole can't be blown shut for its first ten seconds (its health stops at a quarter, marked on its bar); after that, blowing it up stops the rest.
  - **Dropships** can be shot down while they hover low, for credits, but at least half of the troops still aboard climb out of the wreck, hurt.
  - **Warp ships** have a shield like a Harvester's: it soaks the first hits, and comes back after a few quiet seconds. Shot down, a warp ship takes everyone aboard with it.
  - **More than one at a time.** Later in a mission a flare can bring two holes or ships from different sides, and an objective's wave sometimes does too. Extraction always brings at least two when it's called (three late in a long mission), and its waves come from more sides the longer you wait for the pelican.
- **Range matters.** Everyone sees farther than they can shoot well. Shots at long range miss more and hit softer, and that goes for the enemy too.
- **Kill the super heavy.** Hit it with your heaviest strikes, from behind if you can. The Colossus's shield comes back if you leave it alone, and the Walker keeps dropping bots while it stands.
- **Dig in.** A foxhole costs nothing and makes troopers shoot faster. A manned Heavy Turret Nest, Lookout Tower or Propaganda Tower is worth more than a squad standing in the open.
- **A harvester's shield is a bubble.** It reaches out over the squids round it, like the Commander's jammer ring: anything you fire at them from outside hits the bubble first. Break it, or get inside. **Shields don't care about armour (0.26):** a Harvester's bubble, a squid heavy's own shield and the Colossus's take every hit at full strength, rifle rounds included, so light fire strips them as well as anything. The armour behind them is another matter.
- **Kill the Commander first.** While a bot Commander stands, nothing lands inside its ring. Rifles, grenades and the Ultimatum still work.
- **Load supplies fast.** A full pod refills every stim and grenade, and a fast one makes the Helldivers hit harder and move quicker for a while. A half-loaded pod only gives half.
- **Pause to plan.** Press `P` (or the pause button on a phone) to stop the game without opening the menu. Look around the map, check where your teams are, then play on and make your call.
- **Use the map.** The tactical map has compass points and a lettered grid, so when the radio says "dropship inbound west" you know where to look.
- **Know your enemy.** Bugs swarm in from every side. Bots form a firing line and stand there shooting. Squids spread out and surround you.
- **Mind the ground.** Deep water can't be crossed on foot: go round, wade the shallows, or have SEAF throw a **light bridge** across. Mud, snow and sand slow everyone down. High ground helps whoever holds it: units on a rise see farther and hit harder. Press `H` to see it.
- **Patrols come from the bases.** Each base sends patrols out on a route of its own: bugs roam round their nest, bots march out and back, squids sweep a wide circle. They come over when they hear fighting. Destroy a base and it stops replacing its patrols.
- **Backup never stops at a mission site.** While the squad works an objective, a side mission or the extraction, the enemy keeps calling in more. Clearing the map doesn't stop it, but it only comes so fast. Keep the site clear from orbit.

## Difficulty

Pick the level your session **starts** at, from 1 to 10, on the title screen before you press **PLAY** (3 if you're new). From there **the level climbs every mission**, about three fifths of a level each time (0.32; it was two fifths), and **every rank you earn adds an eighth of a level more** (0.40.1; it was a quarter, when ranks came less often): the more of the armory is open, the harder the enemy fights, and the rank splash shows the next mission's level. There's no ceiling. A session started at 3 flies missions 1 to 10 at 3 4 4 5 6 7 7 8 9 10 and its nineteenth at level 15. It keeps going past 10 (**Super Helldive +1**, **+2** and so on). The briefing and the HUD show the level of the mission you're on, and **RESUME** shows the level of the next one. To start at another level, start a new session.

Each level sets two things. **How many come**: patrols, backup, group sizes, how many can be on the field, and how often mediums, heavies and super heavies turn up. And **how far the war has gone** (the **War** column, in "war minutes"): the enemy's toughness, how hard it hits, how fast the pressure builds and how many heavies come out of the bases. The session's own minutes add a little more to that. Higher levels pay more credits and more score, and your score block shows the level you started at and the highest you reached.

From level 3 up, the Helldivers can't win a mission on their own: left alone, they run out of lives. Your fire support is what gets them through.

| Level | Name | Enemies | Mediums | Heavies | Super heavies | War | Credits and score |
|---|---|---|---|---|---|---|---|
| 1 | Trivial | 55% | 60% | 40% | 30% | 0 | ×0.75 |
| 2 | Easy | 60% | 64% | 47% | 38% | 15 | ×0.80 |
| 3 | Medium | 65% | 69% | 53% | 46% | 38 | ×0.85 |
| 4 | Challenging | 70% | 73% | 60% | 53% | 41 | ×0.90 |
| 5 | Hard | 75% | 78% | 67% | 61% | 44 | ×0.95 |
| 6 | Extreme | 80% | 82% | 73% | 69% | 47 | ×1.00 |
| 7 | Suicide Mission | 85% | 87% | 80% | 77% | 50 | ×1.05 |
| 8 | Impossible | 90% | 91% | 87% | 84% | 53 | ×1.10 |
| 9 | Helldive | 95% | 96% | 93% | 92% | 56 | ×1.15 |
| 10 | Super Helldive | 100% | 100% | 100% | 100% | 60 | ×1.20 |
| 12 | Super Helldive +2 | 110% | 109% | 113% | 116% | 80 | ×1.30 |
| 15 | Super Helldive +5 | 125% | 122% | 133% | 139% | 110 | ×1.45 |

The percentages compare each level with level 10 (past 10 they keep climbing: two rows show where). "Enemies" covers everything that brings them in: patrols, backup calls, group sizes and how many can be on the field at once. "Mediums" and "heavies" are how often they turn up among those enemies.

**Testing the balance.** `node test/difficulty.mjs` runs whole missions headless at each level for three kinds of gunner: nobody at the controls, a new player (the bot with slow reactions) and a sharp one (the bot at full skill), one mission per objective type. It checks that with nobody at the controls every mission from level 3 up is lost, and that the sharp gunner wins most missions at levels 1 to 3. `node test/difficulty.mjs session 3 16` plays one whole session from level 3 with the bot shopping between missions (add `0` to play it without upgrades), so you can see how far a gunner gets and what upgrades are worth.

## How a session works

**A session is an operation (0.37).** Quick Play and the campaign are each an operation, with one name for all its missions. In Quick Play you can name it yourself (0.45), or keep the one rolled for you. **Everything carries over from one mission to the next:** your credits, your rank, and everything you buy and equip in the armory. Quick Play's operation and the campaign's are saved apart, so starting one never loses the other.

Missions follow one another until one fails. A mission fails when **all 20 Helldiver lives are lost before the primary objective is done**, or the clock runs out before it is done. Retiring from the pause menu always fails the mission, even with the objective done, so you can't skip ahead by leaving early. Otherwise, once the primary objective is done, the mission counts whatever happens next.

**Leave for the main menu.** **MAIN MENU** in the pause menu (tap it twice in a mission) goes back to the title screen. The mission you were on doesn't count: your session goes back to how it was at the drop, and **RESUME** brings you back to the same mission. (0.41) The same goes if the tab is closed or the browser quits mid-mission: the run is kept as it was at the drop, with that mission waiting.

**Save slots (0.41).** **SAVE GAME** in the pause menu (in the armory, the briefing or a mission) saves your operation, QUICK PLAY or campaign, to one of three slots on this browser. Between missions it saves the run as it stands; during a mission, as it was at the drop, so loading it starts that mission over (nothing half-earned is kept). Once an operation is in a slot, it saves itself there again after every mission. (0.46) Every operation takes a free slot by itself at its first drop (if all three are in use, it asks which to overwrite, or deploys without saving), and an operation that ends, by choice or with a failed mission you don't retry, leaves its slot empty. **LOAD GAME** on the title screen lists the slots, with the chapter or operation, the missions done, the level, the rank, the credits and when it was saved. **LOAD** carries the run on from the armory. Loading over a run you have under way asks for a second tap, and **DELETE** asks for one too. Saves live in the browser's own storage (not a cookie). Clearing the site's data removes them, and they don't move between browsers or devices.

**End it yourself, and earn an SESF coin (0.44).** Once a mission has counted, **END OPERATION** is in the armory, on the briefing and on the debrief (tap it twice). It ends the operation there and takes you to the final score. Under the button it says what ending pays: **+1 SESF COIN**. The coin is kept on this browser. In any later operation's armory, **SPEND A COIN** turns every unlock or upgrade open at your rank into a free pick, except the **CLASSIFIED** ones. You can hold up to 3 coins (the button says COINS FULL then). Each operation pays once, even if it comes back from a save slot or a campaign checkpoint, and an operation that ends with a failed mission pays none.

**Retry a mission.** Every debrief has a **RETRY MISSION** button (tap it twice). It flies the same mission again: same map, same enemy, same bases and targets, same time of day. Your credits, upgrades, score and session time go back to what they were when you dropped. Use it after a failed mission to keep the session alive, or after a good one to go for a better score. A retry replaces the result you just got. If you don't retry a failed mission, the session ends.

Between missions the **armory** opens. Credits from kills, bases, targets, super heavies, the objective and extraction buy new orbital strikes and utilities, more loadout slots and upgrades for your orbitals, the ship gun, the UAV scan, SEAF, the buildables and the strike zone. The armory is split into tabs (**ORBITALS**, **HANGAR**, **SHIP**, **SEAF**, **BUILDABLES**, **CLASSIFIED**); a green dot on a tab means there is something in it you can afford. Every upgrade shows what it does **now**, what the **next** level adds, and its whole **path** level by level. The **SEAF Barracks** has no top level: each level puts more troops on the ground and costs a little more. A very long session earns enough to max out everything. (Sessions saved before version 0.13 that bought extra Helldiver lives get those credits back.)

**Ranks (0.25; 0.24 called them milestones).** Every mission you finish in a session raises your rank by one (0.40.1), from **Fresh Recruit** to rank 9, **Super Earth's Favorite Gunner**, at 9 missions, where it tops out. Each rank has a name (Certified Patriot, Liber-Tea Sommelier, Orbital Hobbyist, Senior Button Presser, Democracy Officer, Freedom Dispenser, Sky Marshal of Liberty, Grand Admiral of Managed Democracy). Each one pays a **level bonus** (400 cr at rank 1, up to 4,000 at rank 9) and opens more of the armory. You can see everything from the start, but what your rank hasn't reached is locked: its button says which rank it needs. A bar at the top of the armory shows your rank, one segment per rank, how far you are into the next one, and how many missions to go. Reaching a rank splashes a band across the debrief with its name, the bonus and what it opened; **SHOW ME** opens the armory on the right tab, where the new things pulse and say **NEW** until bought, and **LATER** leaves the debrief as it is. What comes when: from the start the smoke and EMS strikes, a 4th slot, the first gun, UAV and SEAF upgrades, bastions and turret nests; rank 1 the gas strike, the med drop, the walking barrage and more upgrades; rank 2 the **Pelican Fleet** and the first Eagles (the Hangar itself is open from the start), AP mines, napalm and the shield dome; rank 3 the 5th slot, the 380 mm, incendiary mines, the cluster and napalm Eagles, the sentry and the SAM site; rank 4 the railcannon, Eagle rockets and anti-tank mines; rank 5 the laser, the 500 kg and the artillery cannon.

**Classified (0.25).** Ranks 6 to 9 each declassify one over-the-top stratagem. Until then they sit in the **CLASSIFIED** tab with their names blacked out and the rank they need. Each has one level and is the gunner's alone (the Helldivers never get them): **Orbital Liberty Storm** (rank 6, 15 missions: thirty-six heavy shells over a huge area for sixteen seconds), **Eagle Squadron** (rank 7, 20 missions: every Eagle in the hangar in one long bombing run, for one of the Eagle's runs), **Democracy Lance** (rank 8, 25 missions: a beam far bigger than the laser, steered for twenty-two seconds) and **Super Earth's Final Word** (rank 9, 30 missions: one shot from the main gun that wipes out everything within 70 m, allies included, on a five-minute recharge). Ranks count for the session (a retry takes back a bonus with the result it replaces); the campaign will keep them for good.

**Campaign (in development, 0.27).** **CAMPAIGN** on the title screen opens *Operation Freedom Vista*, set on **Fronteria** in the Umlaut Sector, the real Helldivers 2 world: a desert oasis that was a nuclear test range in the First Galactic War, where Super Earth was building Class A resorts when the Predator Strain came out of the dunes in May 2186. It's told by Super Earth Special Forces command: General Ramzies gives the orders, KTL of the P.H.A.N.T.O.M. Helldivers is his second in command, Rudolph the Red's Tibit Tigers are on the ground, Neonboot of F.E.A.R. brings the Ministry of Science's read on the enemy, and Mota, the SESF Knight of Midnight, speaks for the Ministry of Defense. (0.37) Five chapters, all on the desert, each a kind of mission you haven't flown yet and each teaching something new on the radio as it comes up: **Vacation's Over** (get the construction crews out of the shelter), **Black Gold** (hold the test range's old oil pump while it fills), **The Long Night** (a downed survey shuttle's team lead, after dark), **Spore Season** (the citadel across the road to the launch site, with a spore spewer that blinds the destroyer; the keep and the spewer only fall to a Hellbomb) and **Freedom Vista** (the test range's old launch site, and a nuke for the hive under the landing field). Each one opens with a briefing and closes with a debrief, played like the tutorial's cinematics over Fronteria with the squad's four destroyers in orbit (0.27.2: a black drive block and long hull with bright blue light lines, drawn from the project lead's sketch), one per Helldiver, its colour on the mast beacon (won or lost, the debrief is different), and the cast comes on the radio through the mission: the drop, the first heavy, a flare, a super heavy, a big hit from orbit, lives running out, the objective, the pelican. A chapter starts an operation (after NEW OPERATION); the chapters after it are its next missions, and after the last one it goes on as usual. **Progress is saved on this browser (0.37):** a cleared chapter stays cleared and the next one opens; playing it carries on from where the chapter before was cleared, with the kit, credits and rank you had then, and **CONTINUE** picks a campaign run back up where you left it.

The war gets worse every mission: the level climbs, so there are more enemies, tougher and harder-hitting, with more heavies, on top of each mission's own climb, and the maps grow. Upgrades are how you keep up. Every run ends eventually.

## Share your score

**The SESF feed (0.43).** Every operation is announced in the SESF Discord on its own, with no copying needed. It gets one line when it first drops, for example:

> 🛰️ Super Destroyer in orbit · Gunner **RAMZIES** starts **OPERATION STEEL HAMMER** · Difficulty 3 Medium

and the score when it ends:

> 💀 **OPERATION STEEL HAMMER** is over · Gunner **RAMZIES** · final score **23,456**
> 3 missions, 2 won · Difficulty 3 → 4 Challenging · 40:00 · fell on mission 3 (SQUIDS, DEFEAT)

It sends only what the post shows. **Settings > SESF feed** turns it off.

Every ending screen has an **after action report**, ready to paste into Discord: the debrief after each mission, the final screen when a session ends, and the end of the tutorial. Press **COPY FOR DISCORD**; copying never ends anything. It uses Discord's bold, so it reads cleanly in a channel:

```
**ORBITAL FURY · AFTER ACTION REPORT**
**IRON HARVEST** · Mission 2 · DIFFICULTY 4 CHALLENGING
Gunner KESTREL · BUGS · Tall-grass highlands · 18:42 on the ground
**Result:** OBJECTIVE COMPLETE
**Objective:** LAUNCH THE NUKE ✅ · Side 2/3 · Bases 3/4
**Kills:** 301 (gunner 188 · allies 113) · BROOD TITAN KILLED
**Helldivers:** 6 lost · 14/20 lives left
**SEAF:** 22 lost
**Damage:** gunner 61% · Helldivers 27% · stratagems 12%
**Score:** 7,800 · operation 13,010 after 2 missions
Orbital Fury v0.39.1
```

A campaign chapter's report also names the operation, the chapter and Fronteria, and ends with the General's last word. The operation's report has the totals and every mission on a numbered line:

```
**ORBITAL FURY · OPERATION AFTER ACTION REPORT**
**IRON HARVEST** · Gunner KESTREL · **FINAL SCORE 14,210**
3 missions, 2 won · 35:00 · DIFFICULTY 3 MEDIUM
**Missions**
1. Mission 1 · BOTS · VICTORY · 5,210 · 214 kills
2. Mission 2 · BUGS · OBJECTIVE COMPLETE · 7,800 · 301 kills · BROOD TITAN KILLED
3. Mission 3 · SQUIDS · DEFEAT · 1,200 · 88 kills · WARP COLOSSUS ESCAPED
**Totals:** 603 kills · 11 Helldivers lost · 41 SEAF lost · 1 super heavy killed
Orbital Fury v0.39.1
```

The reports are always in English, whatever language you play in. Your callsign is left out if you didn't set one.

## Give feedback

This is a work in progress, and feedback from players is how it gets better. Press **FEEDBACK (DISCORD)** on the title screen, the pause menu or the final screen, or join the **[SESF Helldivers Discord](https://discord.com/invite/qruRY4nkEz)**. Every post there gets read. Tell us what you played on, how far you got, what was fun, what was confusing or broken, and what you'd change. The version you played is on the title screen and under every mission's result.

## Credits

The same text is on the **CREDITS** screen in the game (title screen and pause menu), in English, French and Spanish.

**Created by** Robert Troumbley (RamziesSGXR), Head Admin of the Super Earth Special Forces: creator, design and development.

**Testing**

| Tester | Group | Role |
|---|---|---|
| KTL | P.h.a.n.t.o.m. Helldivers | playtesting, French review |
| rudolphtheredscare | Tibit Tigers Helldivers | playtesting |
| squally_wally740 | Super Earth Special Forces Helldivers | playtesting |
| Radio Controlled | Super Earth Special Forces Helldivers | playtesting |
| Muffin | Super Earth Special Forces Helldivers | playtesting |
| d3c4p1t4p3r | | playtesting, design feedback |

And every SESF member who has played, tested and sent feedback.

**From idea to launch**
- **2024: the idea.** Helldivers 2 launches, and across the community one wish keeps coming up: a gunship stratagem, an AC-130 circling overhead and raining fire for the squad below.
- **2024: the community.** The Super Earth Special Forces is founded around the same time and grows fast.
- **2024–2025: early experiments.** SESF tries other minigames, mostly Discord integrations, among them a community base-building game. It grew beyond what could be built and was set aside.
- **2026: a new direction.** Six months of changes in the SESF staff made one thing clear: the experience at hand was in web applications, sites built for friends and family. A game that runs in the browser played to that strength, and the picture of the game was already clear.
- **October 2026: first builds.** Orbital Fire Support reaches SESF testers within days of its first build, with a new revision almost every day.
- **30 October 2026: Orbital Fury.** The game takes its name, and its home at orbitalfury.com.
- **Today: in the field.** It runs well on phones, tablets and computers with nothing to install, so everyone could play and test it, the same way, from the start.

**Music and sound.**
- The original score is composed in code and played live in your browser with the Web Audio API. Its pieces are Orbit, Briefing, Drop, Bug Hunt, Iron Front, Cold Light, Swarm, Victory and Fallen.
- Every sound effect is synthesised in real time from tones and noise.
- There are no recordings, and no music or audio files.

**Art.** It is drawn in code: the terrain, troops, enemies, explosions, HUD and cinematics. There are no image files in the game, and none of it is an AI-generated image.

**Technology.**
- **Built with** JavaScript, HTML5 Canvas and the Web Audio API.
- **Nothing else in the game:** no game engine, frameworks or third-party libraries, and nothing loads from other sites while you play.
- **Build and test tools** (not part of the game): esbuild (MIT) and Playwright (Apache 2.0).
- **AI tools:** Claude (Anthropic), used as a coding assistant during development.
- **Hosting:** GitHub Pages, at orbitalfury.com.

**Inspired by** Helldivers 2 by Arrowhead Game Studios, published by Sony Interactive Entertainment.

**Legal notice.**
- Orbital Fury is a free, unofficial fan project. It is not affiliated with, endorsed by or sponsored by Arrowhead Game Studios or Sony Interactive Entertainment.
- Helldivers, Super Earth, Super Destroyer, SEAF and all related names, factions and settings are the property of their respective owners, and are used here only to refer to them. If a rights holder asks for anything to be changed or removed, it will be.
- The game is free, has no ads, sells nothing and collects no data: progress and scores stay on your device. The one exception is the SESF feed: when an operation starts and ends, it posts the callsign, the difficulty, how far you got and the score to the SESF Discord. Settings > SESF feed turns it off. It is provided as is, without warranty.

If you add an outside asset (a font, an image, a sound, a library), add it here and to the CREDITS screen with its author and licence.
