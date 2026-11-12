# Sci-fi interface style: how to rebuild it

The look Orbital Fury uses from 0.60: a ship's tactical console. Dark plates, thin lines, cut corners, two hologram
colours. This note is written so the same style can be rebuilt in another project (web, canvas or a game engine).
The working reference is the `body.ui-scifi` block at the end of `css/style.css`.

## 1. The idea in one paragraph

Everything on screen is either a **plate** (a dark, nearly opaque rectangle with one or two corners cut off and a
1 px line round it) or a **strip** (a see-through dark band with a line on one edge). Colour carries meaning, not
decoration: **amber** is what the player spends or commands, **cyan** is information and friendly forces, **red** is the
enemy and danger. Text is off-white. Nothing is rounded, nothing glows, nothing has a gradient wash. The scene behind
the interface stays visible: no scanlines, grain or heavy vignette over it.

## 2. Colours

| Role | Value | Used for |
|---|---|---|
| Ground | `#0b0d0c` | Page background behind everything |
| Plate | `rgba(12, 16, 14, 0.90)` | Buttons, cards |
| Strip / panel | `rgba(10, 13, 12, 0.72–0.76)` | Bars and panels over the scene |
| Plate, hover | `rgba(22, 34, 32, 0.95)` | Hover and pressed |
| Plate, selected | `rgba(40, 36, 10, 0.95)` | The selected button (amber-tinted) |
| Text | `#e6eadc` | Body text |
| Text, dim | `rgba(230, 234, 220, 0.62)` | Labels, units, secondary lines |
| Amber | `#f5d547` | Credits, strikes, objectives, the main action button, selection |
| Amber line | `rgba(245, 213, 71, 0.45)` | Borders of amber things |
| Cyan | `#7fe9e0` | Lives, troops, orders, map and information |
| Cyan line | `rgba(127, 233, 224, 0.40)` | Default border of everything else |
| Red | `#ff6a4d` | Enemies, threat, destructive actions |
| Empty bar | `#263029` | The unfilled part of any bar |
| Ink on amber | `#141204` | Text on a solid amber button |

Rules:
- One solid-filled colour block per screen at most: the main action (CALL, DEPLOY). Everything else is line and text.
- Amber and cyan never mix inside one control. Pick by meaning.
- Red is never used for decoration.
- Team or player colours (yellow, cyan, pink, lime here) stay as they are; they are data.

## 3. Type

- **Headings, button labels, big numbers:** Chakra Petch, weight 600 (700 for the largest numbers). Upper case,
  letter-spacing 0.5–2 px depending on size.
- **Readouts and body:** Share Tech Mono. Small technical lines are 9.5–11 px in the dim text colour.
- Both are on Google Fonts. Always give a system monospace fallback; the layout must hold without the web fonts.
- Numbers get the heading font and the role colour; their unit ("CR", "LIVES") sits next to them, small and dim.

## 4. Shapes

**Cut corner.** Top-left and bottom-right corners are cut at 45°, 7 px (10 px on the large action button):

```css
--cut: polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px);
clip-path: var(--cut); border-radius: 0;
```

A clipped border has no line along the cut, so draw it with two background gradients (the line sits at cut ÷ √2,
about 5 px for a 7 px cut):

```css
--cutline: linear-gradient(135deg, transparent 4.4px, LINE 4.4px 5.6px, transparent 5.6px),
           linear-gradient(315deg, transparent 4.4px, LINE 4.4px 5.6px, transparent 5.6px);
background-color: PLATE; background-image: var(--cutline); border: 1px solid LINE;
```

Set `background-color` and `background-image` separately, so later rules that change the colour keep the cut lines.

**Do not clip** anything whose children hang outside it (badges, "+35" deltas, notification dots, tooltips): clip-path
cuts them off. Give those a square corner and an edge line instead.

**Readout.** A number with a 2 px line in its role colour down the left and a 1 px line under it. No box.

**Strip.** Full-width band over the scene: translucent dark fill, 1 px line on the top (cyan) or top and bottom (amber
for the mission/objective line).

**Bars.** 3 px tall, square ends, role colour on `#263029`. For a count out of a few (health pips, threat), use
segments: 7 × 8 px blocks with 2 px gaps.

**Corner brackets.** Four small L shapes (18 px legs, 1.4 px line, cyan) at the corners of the view frame the scene
without a border.

## 5. Layout habits

- Spacing in steps of 2: 4, 6, 8, 10, 12 px. 6 px between sibling buttons.
- Touch targets at least 44 px high.
- Group by meaning, then colour the group's line: everything about troops is one cyan group, everything about
  strikes one amber group.
- Over a live scene, keep plates small and strips translucent so the action shows through. The scene fills the
  whole screen; the interface floats on it.
- On the map itself, put information in small dark label boxes with a 1 px line in the role colour (a target's
  name, armour and health next to a red reticle), not in big panels.

## 6. What to avoid

- Rounded corners, drop shadows, glows, gradient washes, blur behind panels.
- Scanlines, film grain, a heavy vignette: they hide small details in the scene.
- Emoji as icons. Use thin-stroke line icons (1.6 px, square caps) in the role colour.
- More than two accent colours plus red.
- Animating the interface chrome. Only data moves (bars, numbers).

## 7. Doing it as a skin (how Orbital Fury did it)

1. Put every interface colour behind a CSS variable first. Hard-coded `rgba(r, g, b, a)` values become
   `rgba(var(--name-rgb), a)` with the variable holding `r, g, b`, so one skin can swap them at any opacity.
2. Scope the skin to a class on `<body>` (`ui-scifi`). The skin block only changes colours, fonts, radii, borders
   and clip-paths. It changes no sizes or positions, so every layout rule and layout test still holds.
3. Where an older rule wins by specificity or `!important`, add a short, more specific rule at the end of the skin
   for that element only.
4. Things drawn on a canvas (frame corners, the minimap's rim) read the skin from the body class.
5. Keep a way back (`?ui=classic`) while the new look settles.

## 8. Checklist for a new screen

- [ ] Ground is `#0b0d0c` or the live scene; no texture over it.
- [ ] Every control is a plate with cut corners or a strip; nothing is rounded.
- [ ] Each control is amber (spend/command), cyan (information/friendly) or red (enemy/danger).
- [ ] One solid amber action at most.
- [ ] Headings in Chakra Petch, readouts in Share Tech Mono, with a monospace fallback.
- [ ] Text contrast 4.5:1 or better, including the small dim labels.
- [ ] Nothing important is clipped by a cut corner.
- [ ] Works at phone width (about 390 px) and on a wide desktop.
