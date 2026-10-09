# Add measurement overlay (hold Option to measure)

Add a read-only measurement overlay to the layout editor, the same interaction pattern designers know from Figma and Sketch. It changes nothing in the document — it only draws distances.

> **Status:** implemented on `main` (`src/lib/measure.ts` + `src/features/editor/artboard/ArtboardFrame.tsx`). This revision reflects the logic as built, after several rounds of visual feedback — see "Revision history" at the bottom for what changed from the original spec.

## Activation

- **Enter:** a layer is selected **and** Option/Alt is held down.
- **Exit:** key released, selection cleared, or focus leaves the canvas (browser window loses focus).
- No selection + Option held → nothing happens.
- The overlay is purely visual. It never moves, resizes, or modifies anything, and it must not block clicks, drags, or any existing interaction underneath it.
- Entering and leaving is instant — no animation, no delay.

While active, the cursor stays as-is (no crosshair — the user may still be dragging).

**Key choice:** the original spec called for ⌘/Ctrl, with Option/Alt as a fallback if it conflicted. No conflicts were found for either (checked: global shortcuts, the shape toolbar, zoom-wheel handling, image-resize's expand modifier), but the binding was switched to **Option/Alt** by explicit request. ⌘/Ctrl does nothing here now.

## What gets measured

Two inputs: the **source** (the current selection) and the **target** (whatever is under the cursor).

**Source**
- Single selection → that layer's bounding box.
- Multiple selection → the union bounding box of all selected layers.
- Uses the rotation-aware visual bounding box, not the untransformed frame.

**Target resolution**, by hit-test priority under the cursor (topmost layer first, skipping hidden/locked layers and any still-untouched starter placeholder — see edge case 4):
1. A layer other than the source → measure to that layer.
2. The frame background (no layer under cursor) → measure to the frame bounds.
3. Canvas outside the frame → measure to the frame bounds (same as 2).
4. The source layer itself → nothing is drawn at all.

Hovering a different target re-computes immediately, throttled to animation frames.

**Target highlight:** whenever the target is a real box (cases 1–3 above), it gets a 1px outline in the measurement color, so it's unambiguous which element the numbers refer to.

## Measurement rules

Let **S** = source box, **T** = target box (frame bounds count as a target box). `sourceMid` below means the midpoint of S on the relevant axis.

### Case 1 — T fully contains S (the frame case)

Show four distances, edge to edge, each drawn from the midpoint of S's own edge:
- left: `S.left - T.left`
- right: `T.right - S.right`
- top: `S.top - T.top`
- bottom: `T.bottom - S.bottom`

### Case 2 — Boxes overlap on exactly one axis

The axis **with** overlap has no true gap; the other axis gets the real measurement, plus a second **reference** line on the overlapping axis showing how far target's edge pokes out past source's corresponding edge — so the full spatial relationship is visible even on the axis with no gap.

- Overlapping horizontally → real gap is vertical, drawn through **S's own horizontal center** (not the overlap range's center), from S's near edge to T's near edge.
- Overlapping vertically → real gap is horizontal, drawn through **S's own vertical center**, from S's near edge to T's near edge.
- **Reference line** (on the overlapping axis): pick whichever edge pair actually diverges —
  - If S's center sits to the right of T's center → compare their **left** edges (`S.left - T.left`).
  - If S's center sits to the left of T's center → compare their **right** edges (`T.right - S.right`).
  - (Vertical overlap case, mirrored: S below T's center → compare **top** edges; S above → compare **bottom** edges.)
  - The reference line runs through S's own center on the gap axis, from T's edge to S's edge.
  - **Suppressed entirely** whenever this value is zero or negative — target flush with or tucked inside source's edge has nothing worth calling out. No magnitude threshold; any positive value shows.
- **Dashed connector:** one dashed line, running in the same direction as the real gap line, from target's near edge (on the gap axis) straight through the point where it crosses the reference line, continuing to **source's far edge** (the edge away from target). There is no second dashed segment along target's own edge — target's own solid border already reads as that reference, so drawing a dashed duplicate over it would be redundant.
- **Gap-line projection:** the real gap line sits at source's own center, which can land outside target's own extent on the overlapping axis when the two only overlap by a sliver of source's own span — in which case the gap line reads as floating free of target. When that happens, add a second dashed line from target's **nearest edge** on the overlapping axis over to the gap line's own position, at the same point the gap line touches target — so it's visibly anchored to target's body rather than appearing disconnected. Not needed (and not drawn) when the gap line's anchor already falls within target's own extent.

### Case 3 — No overlap on either axis (diagonal)

Show **both** a horizontal and a vertical gap, anchored through the **one corner of S nearest T** so the two solid lines meet there at a right angle (not through S's independent per-axis centers). Target's own near edges are projected (dashed) across to that shared corner, since the two boxes don't face each other directly.

### Case 4 — Boxes overlap on both axes

No gaps exist. Show the four edge offsets instead (left-to-left, right-to-right, top-to-top, bottom-to-bottom), signed so overlap reads as a negative distance, each drawn through the overlap range's center. Dashed, to read as "offset" rather than Case 1's solid "gap."

### Not shown

There is no always-on "dimension pill" for the source's own width × height — the original spec called for one, but it was removed by request. The overlay only ever shows distances/offsets between source and whatever's under the cursor.

## Numbers

- Measure in **canvas units** (design pixels), not screen pixels. A measurement reads the same at every zoom level.
- Round to the nearest integer for display. Keep full precision internally.
- If a value rounds to 0 but isn't exactly 0, show `0` — don't show decimals.
- Case 4's offsets can compute negative (when the two boxes overlap on that edge) but always **display unsigned** — the dashed line styling is what signals "offset," not a minus sign.

## Rendering

- **Lines:** 1px, `#FD4E62`. Solid for direct measurements/references, dashed for projections and connectors.
- **Target highlight:** 1px outline in the same color, traced around whatever box is currently the target.
- **Pills:** red (`#FD4E62`) background, white text, `21px` tall / `rounded-full` / `px-2` (8px) horizontal padding / `13px` semibold / `leading-none` / `-0.01em` tracking, matching the Figma reference exactly. Number only — no `px` unit suffix. Always horizontal, never rotated. One pill per line that has a real value (`null`-valued dashed projection/connector lines get no pill).
- **Screen-space sizing:** line weight, pill size, and text size stay constant regardless of zoom. Only positions scale.
- **Z-order:** above everything else on the canvas (`z-60`, the highest in this app).
- **Collision:** implemented as a best-effort, not an exhaustive solver — overlapping pills are nudged apart vertically in a few passes. Works well for this overlay's actual shapes (a handful of pills, mostly stacked by nearby text layers) but isn't guaranteed to resolve every configuration.
- **Viewport pulling:** not implemented — a pill that falls outside the viewport (e.g. the always-shown dimension pill used to, near a bottom toolbar) is not pulled back in. Known gap, not yet addressed.
- **Short distances:** pills center on their line's midpoint regardless of line length, so a very short gap still reads as "spanning" it — this falls out of the collision-nudge/midpoint math for free, no special-casing needed.

## Edge cases to handle

1. **Target is the source** → nothing is drawn.
2. **Nested layers** — measure to the hovered layer's own bounds, not its parent's.
3. **Layer extends beyond the frame** — measurements still compute and draw outside the frame bounds (the overlay is rendered as a sibling of the frame's own clipped box, not inside it).
4. **Hidden or locked layers** are skipped during hit-testing, never a hover target. So is any `emptySlotElements` starter placeholder (the auto-seeded hero image slot before it's been given an `imageUrl`, or an "Add headline"/"Add sub message"/"Add price"/"Add CTA" text stub before it's been typed into) — these have a real, hit-testable frame but nothing a user actually put there, and without this exclusion they'd surface as a measurable "layer" with no visible trace on canvas.
5. **Zero distance** (edges flush) — show a `0` pill rather than nothing.
6. **Multi-select** — union box; if the union equals a single layer's box, behaves as single automatically (no special-casing needed).
7. **Cursor leaves the canvas** while Option is held → target clears (tracked via `document`'s `mouseout` with a null `relatedTarget`).
8. **Option held during a drag** → measurements recompute live every frame, since source/target boxes are derived fresh on each render rather than cached.
9. **Selection changes while Option is held** → recomputes against the new source immediately, no key release needed.
10. **Derived sizes** — measurements are per scene, computed in that scene's own coordinate space; a selection in one scene never measures against a sibling scene.

## Keyboard conflicts

Resolved: Option/Alt alone triggers nothing else anywhere in this app. No fallback needed.

## Optional, deferred

Measuring to the **safe-zone guide** when platform rules are visible was considered and **not implemented** — there's no existing rendering code that turns a `ruleSetId` into drawn safe-zone boundaries in this codebase, so it isn't the "cheap" addition the original spec allowed for. Building it would mean building a separate rule-overlay feature first.

## Non-goals

- No persistent or pinned measurements.
- No measurement between two layers neither of which is selected.
- No editing by typing into a pill.
- No angle or diagonal measurements.
- No snapping or alignment changes — this feature only reports.

## Acceptance checks

With a layer selected and Option held:

- Hovering empty frame area shows four distances to the frame edges.
- Hovering another layer that overlaps on one axis shows the real gap on the other axis, plus (when it's a positive, non-trivial amount) a reference line and dashed connector on the overlapping axis.
- Hovering a diagonally positioned layer shows two gaps meeting at a shared corner, with dashed projections.
- Hovering the source itself shows nothing.
- Zooming in and out does not change any number, and pills/lines stay the same size on screen.
- Releasing Option clears everything instantly.
- Nothing in the document changes at any point.

## Revision history

Changes made after the initial build, via direct visual feedback against the running overlay:

1. Switched activation from ⌘/Ctrl to Option/Alt.
2. Removed the always-shown source dimension pill.
3. Added the 1px target-highlight outline.
4. Case 3: switched from anchoring each gap line through source's independent per-axis center to anchoring both through source's one shared near corner, so they meet at a right angle (matches the standard Figma diagonal-measurement look).
5. Case 2: complete redesign —
   - real gap line moved from the overlap-range's center to source's own center;
   - added the cross-axis reference line (with left-left/right-right or top-top/bottom-bottom chosen by which side actually diverges);
   - reference line suppressed whenever its value is ≤ 0 (first tried a fixed 24px magnitude threshold, then simplified to this sign-only rule per feedback);
   - the dashed connector went through two iterations: first a short stub from target's center to its own edge (rejected), then a two-segment bent path mirroring Case 3 (close, but had a redundant segment), now a single dashed line from target's near edge through source's far edge, since target's own border already reads as the reference on its own side.
6. Case 2: added the gap-line projection (see "Measurement rules" above) for when source and target only overlap by a sliver, leaving the real gap line's anchor outside target's own extent and visually disconnected from it.
7. Hit-testing now also excludes `emptySlotElements`' starter placeholders, not just hidden/locked layers — found via a real bug report: a brand-new banner's auto-seeded hero image slot and text stubs are deliberately excluded from the Layers panel and from normal on-canvas interaction, but the measurement overlay was hit-testing `layout.elements` directly and so could still measure against their real-but-invisible bounding boxes. Fixed by sharing one `isRealLayer()` check (`src/lib/create-layout.ts`) between the Layers panel's filter and this overlay's hit-test loop — which also fixed a latent bug where that filter only recognized English placeholder text, not Japanese.
8. Pill restyled to a second, more compact Figma reference: dropped the `px` unit suffix (numbers only), shrunk from 24px to 21px tall, padding from 10px to 8px horizontal, line-height tightened to `leading-none`.
9. Case 4's offset pills now display unsigned — the minus sign the original spec called for was dropped by request; the dashed line styling alone is enough to read as "offset" rather than "gap."
