# Beachside Auto Layout — Feature Spec v1

> Documents what's actually built in the prototype today, organized by feature area. Each entry covers the use case, the key interaction, and a plain-English explanation of how it works — implementation detail is kept light on purpose; we'll layer in more as each area gets locked down.

**Status legend** — every feature is tagged so it's clear what's real vs. what's a stand-in for something not built yet:
- 🟢 **Functional** — genuinely computes/updates real state
- 🟡 **Mocked** — a real, working interaction with a believable result, but the result itself is faked (timers, hardcoded values, no real computation)
- ⚪ **Not yet implemented** — the use case is planned but there's no working version yet

---

## 1. Layout creation

### 1.1 Create a banner from a platform preset size
**Use case:** start a new banner at a standard size a specific EC platform requires, with the right rule set already attached.

**Key interaction:** Click "+" next to "All banners" → a full-screen size picker opens. A left rail lists platforms (Amazon, Rakuten, Yahoo, Qoo10, TikTok Shop); picking one shows its sizes as a grid of cards (label, pixel dimensions, illustration, "N shop rules built in"). Pick a card → "Create new banner" drops you into the canvas with an empty banner at that exact size.

**How it works:** Each platform ships a fixed list of mock presets (e.g. Rakuten "Ichiba top banner" 1200×800). Selecting one creates a single empty banner pre-populated with placeholder headline/price/CTA text and an empty image slot, tagged with that preset's rule set for later validation.

**Status:** 🟢 Functional (banner creation, rule-set tagging) / 🟡 Mocked (platform sizes and rule counts are static mock data, not real platform specs)

### 1.2 Create a banner with a custom size
**Use case:** start from an arbitrary size not covered by any platform preset.

**Key interaction:** In the same size picker, a "Custom size" section takes Width × Height. Confirm with the "+" button or Enter — the picked size shows as "Custom WxH selected," then "Create new banner" proceeds as normal.

**How it works:** Any positive integer pair is accepted — no aspect-ratio snapping or platform-limit validation. The new banner's name is auto-generated from its aspect ratio ("Square layout" / "Horizontal layout" / "Vertical layout"), and it inherits the rule set of whichever existing preset is closest by aspect ratio and scale, so it still gets a sensible rule set rather than none.

**Status:** 🟢 Functional

### 1.3 Add more sizes from the main banner (auto-adaptation)
**Use case:** once a banner looks right, spin off every other size a campaign needs without re-designing each one by hand.

**Key interaction:** Hotspots on a banner's edges (or the group header's "+") open a size-picker flyout — same platform/custom groupings as banner creation, but multi-select via checkboxes, plus an "Other sizes" section of generic ratios (square/landscape/portrait/story/A4). A "Scene focus point" control lets you drag a rectangle over the part of the source image to treat as the subject. Confirm "Add N sizes" → each new size appears tiled next to the source, grouped together as one set.

**How it works:** For each target size, every layer's frame (position, size, font size) is proportionally scaled from the source to the new dimensions — independent x/y scaling, so a square→wide conversion stretches rather than reflows content into a different arrangement. On top of that scaled layout, a set of decorative overlay graphics (coupon/logo/badge/CTA) is placed using fixed percentage coordinates chosen by bucketing the new size into wide/square/tall.

**Status:** 🟢 Functional (scaling, grouping) / 🟡 Mocked (every new size's image slot is filled with one fixed demo photo rather than the user's real image; the overlay decoration is a fixed visual mock, not computed layout) / ⚪ Not yet implemented (the scene focus point is drawn and saved, but doesn't yet feed into how the crop is actually computed — see §3.2)

---

## 2. Layout editing

### 2.1 Auto-push changes to size variations
**Use case:** after tweaking the primary banner in a group, apply that change across every size that was generated from it, instead of re-editing each one.

**Key interaction:** Editing the primary size of a group (any layer add/edit/remove, or a style change) makes a floating "Apply changes to all sizes" pill appear above the banner. Clicking "Push changes to all sizes" applies it; the affected sibling banners show a brief loading shimmer before updating.

**How it works:** This is an on-demand replay, not a live sync — the app just remembers "the primary has unpushed changes" while you edit. Pushing recomputes every sibling from scratch: it re-scales the primary's *current* full set of layers to each sibling's size (same proportional-scale logic as §1.3) and copies over background/border styling. It fully overwrites each sibling rather than diffing/patching, and there's currently no way to mark an individual size as "locked" so it's skipped by the next push — every sibling is always eligible to be overwritten.

**Status:** 🟢 Functional (the push itself really recomputes and rewrites every sibling) / 🟡 Mocked (the loading shimmer on siblings afterward is a fixed-duration animation, not a real computation delay)

### 2.2 Bulk content editing
**Use case:** make one change (swap an image, recolor something) across several selected sizes at once, without opening each one individually.

**Key interaction:** Select more than one size (shift/ctrl-click) to swap the right-side panel into a multi-scene view. It lists: the shared background images across the selection (grouped by identical image, each replaceable in one action), and every distinct fill/border/text color used anywhere in the selection (recolor one swatch, it updates everywhere that exact color appeared). A separate "Match select" mode (on by default) lets a single click on one layer auto-select its counterpart layer in every sibling size, so the normal single-element panels can also drive a cross-scene edit.

**How it works:** Both the image-replace and recolor actions fan a single update out to every matching element/layout in the current selection.

**Status:** 🟢 Functional (image replace, recolor, match-select) / ⚪ Not yet implemented (there's no bulk product-data import — no paste-a-spreadsheet / column-to-slot mapping flow exists yet; a "Text" section in the same panel is currently placeholder-only and not wired to real content)

---

## 3. Layer editing

### 3.1 General layer options
**Use case:** the everyday layer-management actions — reordering, hiding, protecting, cloning.

**Key interaction:** Right-click any layer for a context menu, or use the icons on its row in the layer list. Available: Duplicate (⌘D), Lock/unlock, Bring to front / Send to back, Flip horizontal/vertical, Insert new image, Delete, Copy (⌘C, copies as JSON — currently nothing reads it back with a Paste).

**How it works:** each action updates the underlying layout state directly (duplicate clones with a new id and a small offset; lock prevents further selection/editing; reordering changes the layer's stacking position). Deleting an image layer doesn't remove it outright — since the image slot is a required part of the layout, delete just clears its image back to the empty "choose an image" placeholder.

**Status:** 🟢 Functional, with two exceptions: ⚪ Copy has no matching Paste yet; 🟡 the AI-styled "Split in layers" / "Re-generate" entries in this same menu are visually present but do nothing (see §4.2)

### 3.2 Banner/scene-level editing options
**Use case:** adjust the whole banner's own background/border, mark which size is the source of truth, and set the subject the banner should stay focused on when adapting to other sizes.

**Key interaction:** Click the banner frame itself (not a layer) to open its panel: background fill, border color/style, corner radius, a "Set as Primary" action (for a size group — makes this size the one others adapt from), and an Export button. Separately, from the "Add more sizes" flyout, "Pick"/"Change" lets you drag a rectangle over the banner's image to mark the focus area to preserve.

**How it works:** fill/border/radius/primary all write directly to the banner's stored style. The focus rectangle is saved with the banner and shown back as a preview crop.

**Status:** 🟢 Functional (background/border/radius, Set as Primary, Export entry point, drawing and saving a focus rectangle) / ⚪ Not yet implemented (the saved focus rectangle isn't actually used yet by the sizing/adaptation math in §1.3/§2.1 — it's captured and displayed, but doesn't change how a crop is computed)

### 3.3 Image, shape, text, and brush editing options
**Use case:** the type-specific styling controls for whichever kind of layer is selected.

**Key interaction:** Selecting a layer opens its matching panel:
- **Image** — opacity, border color/style, radius, and an "Expand to frame" button that instantly stretches the image to fill the whole banner.
- **Shape** — opacity, fill color, border color/style, radius.
- **Text** — content, font family/weight/size, letter spacing, stretch, line height, alignment, decoration (underline/strikethrough), fill color, border color/width.
- **Brush / Eraser** — toolbar buttons exist and highlight when selected.

Any of these edits broadcasts to every matching selected layer at once if multiple (including matched layers across sibling sizes).

**Status:** 🟢 Functional (image/shape/text panels, all fields) / ⚪ Not yet implemented (Brush and Eraser are selectable tools with no drawing/erasing behavior behind them yet)

### 3.4 New editing capabilities
**Use case:** two recent additions to the editing experience — a richer layer list, and an early look at position-anchoring controls.

**Key interaction / what it does:**
- **Layer list redesign** — each row now shows a real thumbnail (image crop, scaled shape outline, or text icon) plus lock/eye icons that toggle that layer's locked/hidden state directly from the list.
- **Position mode (Smart / Anchored)** — every element panel now has a "Position mode" control. "Anchored" reveals an edge-pin picker (click top/bottom/left/right/center to choose which edges the element should stay pinned to) with two dropdowns mirroring the choice, and hovering shows a flyout previewing how that anchor would hold up across a square/tall/wide frame.

**Status:** 🟢 Functional (layer list thumbnails + lock/eye toggles) / ⚪ Not yet implemented (Position mode is a fully interactive, self-contained preview of the intended interaction — no anchor/pinning concept exists in the layout engine yet, so none of it currently affects a real element's position or adaptation behavior)

---

## 4. AI editing

### 4.1 Expand image to frame
**Use case:** grow an image beyond its current crop to fill more of the banner (or the whole thing), the way an AI outpainting tool would.

**Key interaction:** Three ways in:
1. Select an image, Cmd+drag a resize handle outward — a cyan grid fills the new area, with an expand button (and an optional text prompt field) appearing once you let go.
2. Move the background image so it no longer covers the banner — the same grid + expand button appear automatically in the exposed gap.
3. In the image panel, click "Expand to frame" for an instant, no-animation fill.

Clicking the expand button (paths 1 or 2) shows a "Expanding image…" shimmer over the growing area for a few seconds, then the crop settles into place.

**How it works:** the image itself never changes — its crop box is simply enlarged and the same photo is rescaled to cover the new area (`cover` fit), which is why it reads as freshly generated. The shimmer is a fixed-length timer, not a generation call.

**Status:** 🟡 Mocked — real, working interaction and a convincing result, but no image generation actually happens; it's a timed animation followed by a crop resize

### 4.2 Split image into editable layers
**Use case:** break a flattened image into separate, individually-editable layers (e.g. product vs. background) — the way an AI segmentation feature would.

**Key interaction:** Right-click an image → "Split in layers."

**Status:** ⚪ Not yet implemented — the menu entry exists and looks live, but currently does nothing when clicked; no segmentation logic exists behind it yet

---

## 5. Reuse banner scenes

### 5.1 Duplicate one or multiple scenes
**Use case:** clone an existing banner scene (or several at once) to reuse as a starting point, without rebuilding it.

**Status:** ⚪ Not yet implemented at the scene level. Today, duplication only works on individual layers within a scene (⌘D, or right-click → Duplicate layer) — including several layers at once if several are selected. There's no action yet to duplicate a whole banner/size, or to batch-duplicate multiple selected scenes.

---

## 6. Export

### 6.1 Export a single banner or a batch of sizes
**Use case:** package up one banner, or a whole set of sizes, for delivery.

**Key interaction:** Export button opens a dialog. One size selected → a single large preview. Multiple selected → a scene picker down the side with a checkbox per size to opt in/out of the batch, plus File type (PNG/JPG/SVG) and Size (1x/2x/3x) options. "Export banner" / "Export N sizes" shows a success toast.

**How it works:** the previews are real, live-rendered scenes (not static images), so they reflect actual current content. Nothing is actually encoded or downloaded yet.

**Status:** 🟢 Functional (scene selection, live previews, format/scale options) / 🟡 Mocked (the file-size number shown is a deterministic estimate from pixel count, not a real file measurement; the export action itself just shows a success toast — no file is produced)

### 6.2 Platform size requirements and auto-compression
**Use case:** know that each exported size actually meets its target platform's requirements, and have oversized exports compressed automatically.

**Status:** ⚪ Not yet implemented — the export dialog shows each size's own configured dimensions, but doesn't check them against any platform's real requirements, and there's no compression step of any kind.

---

## 7. Image playground connection to banner scenes

### 7.1 Send a playground image into the layout space
**Use case:** generate or edit an image in the Image playground, then bring it directly into a banner as a layer.

**Status:** ⚪ Not yet implemented. The app's landing page has an "Image" playground tile alongside "Video" and "Layout," but only "Layout" currently leads anywhere — Image and Video have no screen behind them yet. What the layout editor has today is a self-contained stock-photo library (a left "Assets" panel plus an image picker dialog with "Beachside visuals" and local "Upload" tabs) — a real, working way to get images onto a banner, but not a handoff from a separate Image playground, since that playground doesn't exist yet.

---

## Summary — what's real vs. what's a preview

| Area | Real today | Preview / not yet wired |
|---|---|---|
| Layout creation | Preset & custom banner creation, add-more-sizes scaling | Real per-size-class reflow, focus-point-driven cropping, non-mocked adaptation art |
| Layout editing | Cascade push, bulk image/color edit, match-select | Per-size "freeze from cascade," bulk product-data import |
| Layer editing | Lock/hide/reorder/flip/duplicate, all image/shape/text style fields, new layer-list thumbnails | Copy→Paste, Brush/Eraser, Position mode / anchoring |
| AI editing | — | Expand-to-frame (mocked animation), Split into layers (not implemented) |
| Scene reuse | Layer-level duplicate | Scene-level duplicate |
| Export | Scene/format/scale selection, live previews | Real file generation, platform-size validation, compression |
| Playground connection | Stock image library in the editor | An actual Image playground, and a real handoff from it |
