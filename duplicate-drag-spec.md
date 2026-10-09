# Add duplicate-on-drag (hold Option and drag a layer)

Add a Figma/Sketch-style duplicate gesture to the layout editor: hold Option/Alt, drag any layer, and a copy of it follows the cursor instead of the original — the original stays exactly where it was.

> **Status:** implemented on `main` (`src/features/editor/artboard/useElementDrag.ts`, `ArtboardFrame.tsx`, `DraggableImageElement.tsx`, `EditableTextElement.tsx`, `SelectableShapeElement.tsx`). Built directly off the existing move-drag code for each layer kind, and reuses the measurement overlay (`measurement-overlay-spec.md`) to show live distance feedback while dragging — see "Revision history" at the bottom for how this came together.

## Activation

- **Hover hint:** Option/Alt held while hovering the **currently selected** layer (in the `select` tool) swaps the cursor to a duplicate icon, signalling that starting a drag now will clone it rather than move it. Hovering some other, unselected layer with Option held shows the plain move cursor instead — the hint is scoped to "the layer you'd actually be dragging," not any layer under the cursor.
- **Trigger:** mousedown with Option held, on any layer (text, shape, or image), followed by an actual drag — this part is not scoped to the selected layer the way the cursor hint is; dragging an unselected layer with Option held still duplicates it. A plain Option+click with no movement just creates the clone in place — see "Edge cases," zero-offset suppression.
- No layer under the cursor → nothing happens; this is a per-layer gesture, not a canvas-wide mode.
- Releasing Option mid-drag does **not** cancel the clone or revert to a normal move — once the duplicate exists, the drag continues targeting it regardless of the key's state afterward (matches Figma's own convention).

## What happens

1. **On mousedown** (Option held, over a layer): the layer is cloned via the existing `duplicateElement` store action, immediately after the original in `layout.elements` (so it renders on top — array order is back-to-front z-order). The clone's auto-offset (`duplicateElement`'s own default `+16/+16` nudge, meant for the duplicate menu command) is cancelled by resetting its frame to exactly the original's — the clone starts stacked exactly under the cursor, ready to drag from there.
2. **Selection switches to the clone** (`setSelectedElements`, not `selectElement` — a flat replace, no group-expansion or cross-scene match-select side effects, same as the ⌘D shortcut uses).
3. **The original's bounding box is suppressed** for the duration of the drag — it keeps rendering normally (not hidden, not locked, not removed from the selection state), it just draws no selection outline/handles, so the two layers aren't both showing boxes at once.
4. **The drag itself** is an ordinary position-only drag (no resize, no rotate) on the clone's id, with the same magnetic snap-to-other-layers behavior (`applyElementSnap`) as any other move.
5. **On mouseup**, the suppression is lifted (the original goes back to normal, selectable, box-showing behavior) and the clone is left selected at the drop position. Both layers now exist independently.

## Measurement integration

While the drag is in progress, the measurement overlay is forced on and its target is forced to the **original** — the one comparison that's actually useful while dragging a fresh clone around is "how far have I moved this from where it started."

This matters because normal cursor-based target resolution wouldn't work here: during any drag the cursor sits on the dragged element itself (you're holding a point on it), so hit-testing would just resolve to "source" the whole time. Forcing the target to the original sidesteps that entirely.

- Source = the clone (already the current selection).
- Target = the original's own rotation-aware bounding box, looked up fresh by id (not cached), every render.
- Everything downstream — which of the four measurement cases applies, line/pill rendering, zoom-invariance, collision avoidance — is the existing measurement overlay logic, completely unchanged. See `measurement-overlay-spec.md` for the full rules.
- The overlay stays active for the whole drag even if Option has been released (see "Activation"), since the drag mechanics themselves don't check the key's state once started.

## Rendering

- **Cursor:** `url('/icons/duplicate%2024.svg') 12 12, copy` (percent-encoded — the asset's filename has a literal space) — same `cursor: url(...) hotspotX hotspotY, fallback` convention as the existing rotate-handle cursor (`SelectionBoundingBox.tsx`). Shown whenever Option is held, the `select` tool is active, and the cursor is over a layer that would otherwise show a plain `move` cursor.
- **Lines, pills, target highlight:** identical to the measurement overlay's own rendering — same red (`#FD4E62`), same pill style, same collision handling.
- **Rotated layers:** both the clone (source) and the original (target) get a red axis-aligned bounding-box outline when rotated — the same box the distance math itself uses, touching the rotated shape's extremes rather than tilting to match its edges. The source's own version of this only shows for a single rotated selection (a multi-select union is already axis-aligned by construction, and an unrotated source's box already coincides with its normal blue selection outline, so a second box there would be redundant).

## Edge cases to handle

1. **Zero offset** — right at mousedown, before any real movement, source and target are identical boxes (the clone started exactly on the original). The entire overlay (lines, pills, highlight) is suppressed for as long as that holds, rather than showing a confusing "0 in every direction." The instant the clone moves, the overlay appears.
2. **Rotation** — handled per "Rendering" above; the distance math itself already used rotation-aware bounding boxes before this feature existed (inherited from the measurement overlay).
3. **Snapping** — the clone snaps to every other visible layer in the scene, including the original it was just cloned from (the original is a completely ordinary layer again the instant the clone exists).
4. **Multi-select** — not specifically supported: Option+drag on one of several selected layers clones and drags only that one layer, same as a plain click-drag would only move the one you grabbed unless it's part of an active multi-selection drag. No group-duplicate-and-drag.
5. **Option released mid-drag** — does not cancel or revert anything; see "Activation."
6. **Image layers** — use a hand-rolled move implementation (they don't share the text/shape drag hook), so the duplicate-drag logic is duplicated there rather than shared — same pattern the codebase already uses for every other image-specific drag behavior.
7. **Hidden/locked layers** — never a duplicate-drag source, same as they're never a plain drag source; this gesture reuses each layer kind's own existing mousedown gate (`activeTool === 'select'` and the layer being interactive at all).

## Keyboard conflicts

Shares Option/Alt with the measurement overlay by design — both gestures are inert on their own (holding the key does nothing without either hovering-then-dragging a layer, or already having a selection to measure from), so there's no real conflict between them; they compose, which is the whole point of the measurement integration above. No other conflicts: Option/Alt alone triggers nothing else anywhere in this app (see `measurement-overlay-spec.md`'s own keyboard-conflict check).

## Non-goals

- No duplicate-on-click without a drag (a plain Option+click-and-release just leaves the clone sitting exactly on top of the original, functionally a no-op from the user's perspective).
- No multi-layer duplicate-and-drag.
- No resize or rotate while duplicate-dragging — position only.
- No keyboard-only duplicate-and-nudge variant (that's the existing ⌘D shortcut, unrelated to this gesture).

## Acceptance checks

With the `select` tool active:

- Holding Option over a layer swaps the cursor to the duplicate hint.
- Option+mousedown-and-drag on a layer leaves the original untouched at its position and drags a new copy from under the cursor.
- The layers list shows one new entry immediately once the drag starts.
- The original shows no selection box during the drag; the clone shows a normal one.
- Right at the start of the drag (no movement yet), no measurement lines/pills are shown.
- Moving the clone shows live distances back to the original, using the same visual language as hovering-to-measure elsewhere in the app.
- A rotated clone (or a rotated original) gets a red axis-aligned box matching its own true extents.
- Releasing the mouse leaves both layers in place, independently selectable, with the clone selected.

## Revision history

1. Initial build: cursor hint, clone-and-redirect-the-drag mechanics for all three layer kinds, bounding-box suppression on the original.
2. Measurement overlay wired in: target forced to the original for the duration of the drag, since cursor-based resolution can't work here (the cursor always sits on the thing being dragged).
3. Zero-offset suppression added — the initial "0 in every direction" state (right at mousedown) read as noise, not information.
4. Rotated-target highlight: first built to trace the target's actual rotated edges, then corrected to the axis-aligned bounding box instead (matching a Figma reference screenshot) — the box the distance math uses, not the shape's own tilted outline.
5. Same rotated-bounding-box highlight extended to the source side, gated to single-rotated-element selections only (see "Rendering").
6. Cursor hint scoped to the selected layer only — originally showed on any hovered layer regardless of selection, which read as promising duplication for a layer the drag wouldn't actually target as cleanly as the already-selected one.
