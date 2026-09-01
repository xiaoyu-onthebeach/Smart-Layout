# Claude Code Brief v3 — Auto Layout Tool Prototype (Beachside)

> Supersedes v2. Adds saved-template start path and the on-artboard creation toolset (image modal, text, shape).

## Context

We're prototyping the **auto layout tool** for Beachside, our AI-native infinite canvas product for creative and e-commerce teams. It helps EC teams design one banner and scale it into every size an APAC platform requires (Rakuten, Amazon, Yahoo, Qoo10, TikTok Shop), with platform rules visible while designing.

This is a **frontend-only prototype**. No backend, no real AI, no persistence. All data mocked. Goal is to validate the flow and interaction model — not production code.

The tool lives inside Beachside, so reuse familiar patterns (artboard, layer panel, property panel). **Interface screenshots for visual reference will come in a later message.** Build with clean shadcn defaults and keep component boundaries swappable so restyling is mostly a token/CSS change.

## Tech stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- **shadcn/ui** (https://ui.shadcn.com/) — dialogs, tabs, tables, selects, checkboxes, inputs, sliders, tooltips, popovers, badges, toasts, resizable panels
- Zustand for state
- No router required; a step/mode state machine in the store is fine

## The flow

```
Start a new banner
  → Select one size ──┬─ from EC preset size
  │                   ├─ custom size
  │                   └─ from saved template (pre-populated)
  → Empty artboard (or pre-filled artboard if template)
  → Create & edit layout ──┬─ Add more sizes ──┐
  │        ▲               └─ Bulk add product ┤
  │        │                                   ▼
  │        │                          Generate all layouts
  │        │                                   ▼
  │        └────── back to editing ─── View all layouts
  │                                            ▼
  └────────────────────────────────────────  Export
```

Key property: **the first banner is the source of truth.** There is no separate "set as master" step — the banner you design first *is* the master, and every generated size derives from it. Returning to "Create & edit layout" from "View all layouts" edits the source and re-syncs all sizes.

---

## Screen 1 — Start a new banner

Entry point in the Beachside canvas: a `+` / "New banner" affordance. Opens size selection.

## Screen 2 — Select one size

A dialog with three paths, as tabs or a left rail:
The dialog is opening on top of the screen 3, where you can already see the page is being changed to the layout creation page, but with the size selection dialog open on the top.

**a. EC preset size.** Platform tabs (Amazon, Rakuten, Yahoo, Qoo10, TikTok Shop). Selecting a platform shows its sizes as a proportional-thumbnail grid, split into **Required** and **Commonly used** groups. Each card shows label, dimensions, and a mini shape preview at true aspect ratio. Single select here — one size starts the banner.

**b. Custom size.** Width × height inputs + optional name. On entry, if the dimensions are near a known preset, offer "Snap to Rakuten 1200×800" as a suggestion chip (dismissible).

**Rule inheritance for custom sizes** — implement as an explicit choice in the custom form, defaulting to *inherit nearest preset*:
- Inherit rules from nearest matching preset (default)
- No rules
Show which ruleset ends up attached so it's never invisible.

**c. Saved template.** A gallery of pre-built layouts that already have components placed — image slot, headline, sub message, price, CTA, shape/accent elements — arranged in a real composition rather than empty boxes. Each template card shows a rendered thumbnail with dummy content, its name, its native size, and the platform it was built for.

- Templates carry their own native size; picking one sets the banner size. Allow changing the size afterwards via a size dropdown on the card, which re-runs `adapt` to that size before opening the editor.
- Filters: platform, size class (wide / square / tall), and category (product hero, sale/promo, multi-product, text-led).
- Ship 8–12 mock templates across size classes so the gallery feels real and the adaptation engine gets exercised from the start.
- A template is just a `Layout` with `isTemplate: true` and placeholder content — same data structure, no special path through the engine.

Since this is the fastest path to a filled artboard, make it the **default tab** in the dialog, with EC preset second and custom third.

## Screen 3 — Artboard (empty or template-filled)

Single artboard at the chosen size, centered, with:
- Left: layer panel (shadcn scroll area, real layer rows reflecting placed elements)
- Right: property panel
- **Bottom: floating tool bar** (see Screen 4)
- If started from preset or custom: empty slot placeholders — image, headline, sub message, price, CTA
- If started from a template: components already placed with dummy content, ready to be replaced. Placeholder text should be visibly placeholder ("Add headline"), and the image slot shows a "Replace image" affordance on hover.

The attached **ruleset is data**, per platform+size. Each rule:

```ts
type Rule =
  | { type: 'safeMargin'; px: number }
  | { type: 'maxChars'; slot: SlotKind; max: number }
  | { type: 'minFontSize'; slot: SlotKind; px: number }
  | { type: 'maxTextCoverage'; pct: number }
  | { type: 'requiredSlot'; slot: SlotKind }
  | { type: 'reservedZone'; edge: 'top'|'bottom'|'left'|'right'; px: number; label: string };
```

## Screen 4 — Create & edit layout (rules visible)

The core screen. Elements are selectable, draggable, resizable (light interaction — no full canvas engine needed).

### Bottom tool bar

A floating, horizontally centered bar pinned to the bottom of the artboard area (Beachside canvas convention — reuse the existing pattern). Tools:

| Tool | Behaviour |
|---|---|
| Select | Default cursor mode |
| Text | Click or drag on the artboard to place a text element; enters edit mode immediately. A dropdown on the tool sets the intended slot — Headline / Sub message / Price / Custom text — which determines which rules apply to it |
| Shape | Rectangle, ellipse, line. Drag to draw. Used for CTA buttons, promo badges, colour blocks |
| Zoom | Percentage control, fit-to-screen |

Slot binding matters more than tool type: every placed element carries a `slot`, and that's what the rules engine and adaptation engine key off. An unbound shape is decorative and adapts by relative position only.

### Image picker modal

Opened from the Image tool or from an empty image slot. shadcn `Dialog`, with tabs:

- **Upload** — drag-and-drop zone + file picker. Mock only; on drop, pick a random local sample and show it. Show accepted formats and a max-size note.
- **Library** — grid of the mock product images in `/public/samples`, selectable, with search field and simple category chips.

On confirm: the image lands in the selected slot (or a new image element if none selected), auto-fitted with cover crop, and the focal-point pin becomes available in the property panel.

### Rule visibility

Three layers, all driven by the same rules engine:

1. **Contextual on-artboard** (default on) — when an element is selected, show a small floating readout near it: char count vs. limit, font size vs. minimum, safe-zone pass/fail. Nothing shown when nothing is selected, so the artboard stays clean.
2. **Enforced in the property panel** — inputs carry their own constraints: char counters that turn amber past the limit, font-size sliders with the sub-minimum range visually blocked, a truncation warning naming which target size will clip the text.
3. **Persistent overlays** (toggle, off by default) — dashed safe-zone inset, shaded reserved zones, coverage percentage readout.

Plus an **issue counter** in the toolbar ("2 issues") that expands to a list; clicking an issue selects and reveals the offending element. Violations are **warnings, never blockers** — users can always proceed.

Rules engine must be a pure module: `evaluate(layout, ruleset) => Violation[]`. No React imports.

## Screen 5a — Add more sizes

A right-side drawer over the editor. Platform-grouped size cards with checkboxes, each showing **a live mini preview of the current banner already adapted into that size** — this is the persuasive moment, so render real adapted content in the thumbnails, not grey boxes. Running count and a primary action naming the total ("Generate 4 sizes").

Sizes already in the set appear as checked and disabled with a "in set" badge.

## Screen 5b — Bulk add product

Two sub-steps in one dialog:

**Step 1 — paste & map.** A textarea accepting pasted TSV (clipboard from Excel/Sheets), parsed into a preview table. Each column header is a dropdown mapping to a slot: Headline, Sub message, Price, CTA, Image URL, or Skip. Also allow manual row-by-row entry as a fallback.

**Step 2 — validate.** The mapped table (shadcn data table), editable cells, with:
- Column headers showing the **strictest limit across all selected sizes** (e.g. "Headline ≤15")
- Cells over the limit flagged amber inline
- A row-level status column (ok / n issues / missing image)
- Click a row to preview it rendered in the source size

**Fallback model:** unmapped slots inherit the source banner's content. The source banner is the default record; bulk rows only override what they specify. State this in the UI ("CTA not mapped — using source: 'Shop now'").

Multiplication must be visible before commit: "3 products × 6 sizes = 18 banners".

## Screen 6 — Generate all layouts

A brief generating state (staggered skeleton cards, ~800ms mock), then transition to View all layouts. Nothing to design beyond the transition, but make the adaptation feel computed rather than instant.
- Only apply the transition to the image only, cuz the image is being rescaled to fit the new sizes, but the text and shape layer on top can be re-sized, reasligned automatically based on the new size, so show these immeditely.

**Adaptation logic** — `adapt(sourceLayout, targetSize, product) => LayoutElement[]`, pure module, no React. Approach:

1. Classify the target by aspect ratio into a **size class**: `wide` (≥2:1), `landscape`, `square` (~1:1), `portrait`, `tall` (≤1:2).
2. Each size class has a **template**: relative slot positions and stacking direction (e.g. `wide` = text left / image right; `tall` = image top / text stacked below; `square` = text over lower third).
3. Carry over from the source: content, colour/style tokens, which slots are visible, slot order.
4. Apply target's ruleset: clamp font sizes to minimums, inset to safe margins, truncate text past `maxChars` with an ellipsis and record a violation.
5. Drop-order for space-constrained sizes: sub message → price → badge. Never drop image, headline, or CTA; shrink instead. Record anything dropped as an adaptation note surfaced on the card.

Don't build a constraint solver. Deterministic template-based re-layout is the target.

**Image framing:** each image element carries a normalized focal point `{ x: 0.5, y: 0.5 }` set on the source. Adaptation cover-crops each target around that focal point. In the editor, expose the focal point as a draggable pin on the image with a live "how this crops" strip showing the current target ratios. Per-size crop override lives in Screen 8.

## Screen 7 — View all layouts

Gallery of every generated banner. Two view modes, toggleable:

- **Source-anchored** (default) — source banner pinned in a left panel, still editable; every other size in a live-updating grid to the right. Editing the source visibly re-syncs the grid. This is the demo money shot.
- **Platform rows** — grouped by platform, each row scrollable horizontally, with per-platform Preview / Export actions. Better for checking completeness before export.

Each card shows: dimensions label, sync state badge, rule status (pass / n issues), adaptation notes if content was dropped, and hover actions (edit, reset, remove). Zoom / density control for the grid. "+ Add size" tile inline. When multiple products exist, group by product with the product name as a section header.

## Screen 8 — Per-size touch-up & sync model

Clicking any non-source card opens it in the same editor as Screen 4, marked as a derived size.

**Sync rules** — implement per-property, not per-layout:

| Source change | Untouched size | Touched (detached) size |
|---|---|---|
| Content (text, price, image) | updates | **updates** — content always flows |
| Slot position / size | updates | frozen |
| Style tokens (colour, font) | updates | updates |
| Slot visibility | updates | frozen |
| Focal point | updates | frozen if locally overridden |

So content propagates unconditionally, structure freezes once locally edited. Card shows an "Edited" badge and a "Reset to source" action that clears local overrides for that size. A source edit that would have moved a frozen slot shows a subtle "source changed" hint on the card rather than silently diverging.

## Screen 9 — Export

Mocked, but designed:
- Pre-export validation summary: sizes passing, sizes with warnings (listed and clickable to jump back), sizes with dropped content
- Format selection (PNG / JPG), quality, scale
- Filename pattern with tokens, e.g. `{product}_{platform}_{width}x{height}` with a live example
- Grouping option: flat / by platform / by product
- "Export 18 banners" action → mock progress → success toast. No real files needed; a downloaded manifest JSON is fine if easy.

## Re-entry

The whole set must be re-openable: "back to editing" from View all layouts, and a mock "recent banner sets" list on the start screen that loads a seeded set. Real persistence isn't needed — a couple of pre-built sets in mock data is enough to demonstrate the loop.

---

## Data model

```ts
type SlotKind = 'image' | 'headline' | 'subMessage' | 'price' | 'cta' | 'badge';
type SizeClass = 'wide' | 'landscape' | 'square' | 'portrait' | 'tall';

type SizePreset = { id: string; platformId: string; label: string; width: number; height: number; required: boolean; ruleSetId: string };
type RuleSet = { id: string; name: string; rules: Rule[] };
type Platform = { id: string; name: string; presetIds: string[] };

type Product = { id: string; name: string; imageUrl: string; focalPoint: { x: number; y: number }; headline: string; subMessage?: string; price?: string; ctaLabel: string; badge?: string };

type ElementKind = 'image' | 'text' | 'shape';
type ShapeKind = 'rect' | 'ellipse' | 'line';

type LayoutElement = {
  id: string;
  kind: ElementKind;
  slot: SlotKind | null;            // null = decorative, adapts by relative position only
  shape?: ShapeKind;                // when kind === 'shape'
  content?: string;                 // text content
  imageUrl?: string;                // when kind === 'image'
  focalPoint?: { x: number; y: number };
  frame: { x: number; y: number; w: number; h: number };  // absolute px in layout space
  style: { fontSize?: number; color?: string; fill?: string; radius?: number; fontWeight?: number; align?: string };
  visible: boolean;
  locked?: boolean;
  overridden?: Partial<Record<'frame' | 'style' | 'visible' | 'focalPoint', true>>;
};

type Layout = {
  id: string; setId: string; productId: string;
  size: { width: number; height: number; presetId?: string; label: string };
  sizeClass: SizeClass; ruleSetId: string;
  elements: LayoutElement[];
  isSource: boolean;
  detached: boolean;
  adaptationNotes: string[];
};

// A saved template is a Layout with placeholder content and no set
type SavedTemplate = {
  id: string; name: string;
  category: 'productHero' | 'salePromo' | 'multiProduct' | 'textLed';
  platformId?: string;
  layout: Omit<Layout, 'setId' | 'productId' | 'isSource' | 'detached'>;
  thumbnailFrom: 'render';          // rendered live, not a static image
};

type BannerSet = { id: string; name: string; sourceLayoutId: string; layoutIds: string[]; productIds: string[] };
```

## Project structure

```
src/
  app/                    # shell, mode switching, top bar
  components/ui/          # shadcn
  features/
    size-select/          # screen 2 — preset / custom / template tabs
    template-gallery/     # screen 2c — template cards, filters, live-rendered thumbnails
    editor/               # screens 3, 4, 8
      artboard/           # elements, selection, drag/resize
      toolbar/            # bottom tool bar: select, image, text, shape, CTA, zoom, rules
      image-picker/       # modal: upload / library / from canvas / generate
      panels/             # layer panel, property panel, rule display
    add-sizes/            # screen 5a drawer
    bulk-products/        # screen 5b paste → map → validate
    all-layouts/          # screens 6, 7 (both view modes)
    export/               # screen 9
  lib/
    rules-engine.ts       # evaluate(layout, ruleSet) => Violation[]
    adapt-engine.ts       # adapt(source, targetSize, product) => LayoutElement[]
    size-class.ts         # classify(w, h) => SizeClass
    size-templates.ts     # slot arrangements per size class (adaptation logic)
    mock/                 # platforms, presets, rulesets, products, saved templates, seeded sets
  store/                  # Zustand slices: set, layouts, products, ui
public/samples/           # local placeholder product images (beauty/cosmetics style)
```

`rules-engine`, `adapt-engine`, `size-class`, `size-templates` stay pure and React-free — these are the parts most likely to become real product logic.

**Naming note:** "size template" = internal slot arrangement per size class, used by the adaptation engine. "Saved template" = user-facing pre-built layout in Screen 2c. Keep the two clearly separated in code and copy.

## Build order — check in after each stage

1. **Scaffold** — Vite + TS + Tailwind + shadcn init, Zustand skeleton, app shell, mock data (5 platforms, ~20 presets with rulesets, 6 sample products with local images, 8–12 saved templates).
 
2. **Screens 2–3** — size selection across all three paths (preset / custom / saved template) + artboard rendering both empty-slot and template-filled states, with the attached ruleset displayed.
3. **Screen 4** — bottom tool bar (select, text, shape, CTA), image picker modal, then the three rule-display layers, issue counter, focal-point pin. Requires `rules-engine`.
4. **`adapt-engine` + size-templates** — pure logic first, with a dev-only route rendering one source across all size classes so the adaptation can be judged before UI is built around it. Include decorative (unbound) shapes in the test case, since they're the tricky part.
5. **Screen 5a** — add-sizes drawer with live adapted thumbnails → Screen 6 generation → Screen 7 source-anchored view.
6. **Screen 5b** — bulk paste → map → validate → multi-product generation, product grouping in Screen 7.
7. **Screen 8** — per-size touch-up, detach/reset, sync-rule table behaviour.
8. **Screen 9 + re-entry** — export dialog, validation summary, seeded set loading.

## Out of scope

- Backend, auth, real persistence, real AI generation
- Real image export/rendering to file
- Pixel-perfect Beachside visual parity (screenshots come later)
- Full canvas engine — basic drag/resize/zoom is enough
- Constraint solver — deterministic templates only

## Interaction & copy notes

- Sentence case; buttons name the action and the count ("Generate 4 sizes", "Reset to source", "Export 18 banners")
- Rule violations are warnings, never hard blocks — the user is always allowed to proceed
- Every automatic decision must be visible and reversible: which ruleset was attached, what got truncated, what got dropped, what's detached from source
- Placeholder images from `/public/samples`, not external URLs
- Keyboard: Esc to deselect, ⌫ to hide a slot, ⌘/Ctrl+Z undo within the editor if cheap
