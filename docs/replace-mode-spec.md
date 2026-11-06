# Replace mode — product spec

**Scope:** everything inside Replace mode, plus entering and leaving it. Presence (avatars, other people's cursors, following) and the app cursor are covered separately.
**Status:** describes the prototype as built on branch `phase-2`. The mode switch is icon-only; "Improve banner" (AI re-layout after a content change) is deliberately out of scope for now.

---

## 1. What Replace mode is

Replace is the second mode of a playground, next to **Create**. Create is where banners are designed; Replace is where their **content is swapped across many banners at once** — texts, images and colors — without touching the layout.

The screen splits in two:

- **Left — the table side.** One table per banner set: a row per banner (the primary and each of its sizes), a column per piece of content. Every cell is editable in place.
- **Right — the preview.** The same canvas as Create, in a rounded window, read-only: banners can be selected, zoomed and arranged, never edited directly. It follows what you do in the table.

### Terms used in this spec

| Term | Meaning |
|---|---|
| **Banner set** | A primary banner and every size adapted from it. One table per set. |
| **Primary** | The banner a set was created from. Always the set's first row. |
| **Size** | Any other banner of the set (e.g. 300×250 adapted from a 600×500 primary). |
| **Channel** | The platform a size belongs to (Amazon, Rakuten…), or *Custom* for sizes typed by hand. |
| **Content column** | One piece of content of the primary — "Text 1", "Image 2", "Shape 1"… The same piece of content in every size of the set lines up under it. |
| **Preview** | The read-only canvas on the right. |

---

## 2. Feature inventory

| § | Category | Covers |
|---|---|---|
| 3 | Entering and leaving Replace | Mode switch, transitions, split layout, empty state |
| 4 | Filter bar | Table view toggle, channel filter, size filter, content search |
| 5 | Banner set heading | Collapse, name and rename, banner count, set menu, color palette |
| 6 | Table structure | Columns, sizing, scrolling, loading and missing states |
| 7 | Editing content | Text, text color, text fill, image, shape color |
| 8 | Multi-cell editing | Cell selection, fill handle |
| 9 | Rows | Checkboxes, row menu, reordering, adding sizes |
| 10 | Grouped view | One row per distinct content |
| 11 | Preview | Read-only canvas, selection, table ↔ preview link, orderings |
| 12 | Download | Exporting selected banners |
| 13 | Keyboard, undo and language | Shortcuts, undo, English/Japanese |

---

## 3. Entering and leaving Replace

| # | Feature | Summary | Priority |
|---|---|---|---|
| 3.1 | Mode switch | Icon-only Create / Replace tab hanging from the top of the screen | |
| 3.2 | Transition into Replace | Table side slides open, canvas becomes a framed preview | |
| 3.3 | Transition back to Create | Table side slides closed, canvas grows back to full screen | |
| 3.4 | Resizable split | Divider between table and preview can be dragged | |
| 3.5 | Empty state | Guidance when there is nothing to replace yet | |
| 3.6 | Mode-specific chrome | What disappears / appears in Replace | |

### 3.1 Mode switch

- A tab hanging from the top edge of the screen, **centered on the screen** (not on the canvas area), with curved top corners flowing into the screen edge.
- Two icon buttons: **Create** (shapes icon) and **Replace** (table icon). No text labels.
- The current mode sits on a dark inset with its icon in the primary blue; the other is a white icon that lightens on hover.
- Hovering a button shows a tooltip below it: "Create mode" / "Replace mode".
- Clicking the other mode switches immediately; clicking the current mode does nothing.
- Visible only inside a playground (not on the playgrounds list).

### 3.2 Transition into Replace

All parts animate together over **~300 ms, ease-out**:

- The **table side slides open** from the left. The first time, it takes **40% of the screen width**; afterwards it reopens at whatever width it was last dragged to (see 3.4).
- The **canvas becomes the preview window**: it gains a rounded frame with a subtle border and inset padding, below the top bar, on the view's dark background.
- The canvas **holds its framing** while its area moves (banners don't jump with the moving edge), then glides to a new framing that fits the preview.
- The table content **fades in**.
- Create's floating panels (left Banners/Assets panel, right editing panels) step aside — they're not shown in Replace.

### 3.3 Transition back to Create

- The table side **slides closed** over ~300 ms. It keeps its width while closing (so it's covered rather than squeezed) and fades out.
- The preview's frame eases away and the canvas grows back to full screen, again holding its framing during the move.
- Create's left panel stays hidden during the transition, then **fades back in place** (it doesn't ride along with the moving edge).
- The table's own state (filters, search, collapsed sets, scroll position) is not guaranteed to survive a round trip — see Open questions.

### 3.4 Resizable split

- A vertical divider between the table side and the preview. Same color as the background; lightens on hover to show it can be dragged.
- Each side keeps at least **25%** of the width.
- The width is remembered for the session: leaving and re-entering Replace reopens at the last width.
- Dragging is immediate (no easing while dragging).

### 3.5 Empty state

Shown in place of a table when there is nothing to replace:

- **No banner in the playground** → one empty state in place of all tables.
- **A banner set whose primary has no content yet** (no layer) → the set heading is shown, with the empty state below it instead of the table; no "Add more sizes" either.

Content: a short message — "Create your first banner in the **[Create mode]** before replacing the content here." — where *Create mode* is an inline tag (shapes icon + label, in the mode's blue), and a primary button **"Go to create mode"** that switches to Create.

The filter bar is hidden until at least one banner has content.

### 3.6 Mode-specific chrome

In Replace:

- The bottom toolbar keeps only **Select** and **Hand** (no Text, Pen, Shape), and their shortcuts are off.
- Create's canvas shortcuts (delete, nudge, vector editing…) don't apply. Undo still works (see 13.2).
- The **"Order banners"** select appears at the top-left of the preview (see 11.6).
- A **Download** panel appears at the top-right of the preview when banners are selected (see 12).

---

## 4. Filter bar

| # | Feature | Summary | Priority |
|---|---|---|---|
| 4.1 | Filter bar layout | Pinned bar above the tables | |
| 4.2 | Table view toggle | One row per banner ↔ grouped by content | |
| 4.3 | Channel filter | Show only one channel's banners | |
| 4.4 | Size filter | Show only chosen sizes | |
| 4.5 | Content search | Show banners whose name, size or text matches | |
| 4.6 | No-match state | Message when nothing matches | |
| 4.7 | Preview fade | Banners left out by filters fade in the preview | |

### 4.1 Filter bar layout

- Sits under the top bar, **fixed**: the tables scroll underneath it, and its edges line up with the tables'.
- Left: table view toggle, channel filter, size filter. Right: search field.
- Every control shares one look: 32 px tall, borderless, dark field, rounded corners (same as Create's selects).
- Tables scrolling up **fade out** just under the bar instead of being cut by a hard edge.
- All filters combine (AND). They apply to the table rows and to the preview (4.7).

### 4.2 Table view toggle

- A segmented control with two icon options, each with a tooltip:
  - **One row per banner** (default)
  - **Group banners with the same content** — see 10.
- The selected option sits on a darker inset with a white icon; the other icon is grey.

### 4.3 Channel filter

- A select showing the current choice ("All channels" by default) and a chevron.
- Menu: **All channels**, then each channel the playground's banners actually use (with its icon), then **Custom** (sizes with no channel) last. A check marks the current choice.
- Picking a channel keeps only that channel's banners in every table.

### 4.4 Size filter

- A select labelled **"All sizes"** by default; with one size chosen it shows that size ("600 × 500"); with several, "N sizes".
- Opens a popover:
  - a search field (focused on open), matching size names and "WxH" (also "600x500", "600 × 500", "600*500");
  - the sizes the banners use, grouped by channel (channel icon + name as a group header, Custom last); each size once, with checkbox, shape icon, "W × H" and its preset name;
  - clicking a group header ticks or unticks all its sizes;
  - "No sizes match" when the search finds nothing;
  - a **"Show all sizes"** button, when some sizes are ticked, clears the filter.
- Ticking applies immediately (no confirm). Nothing ticked = all sizes.
- Closing the popover clears its search text, not the ticked sizes.

### 4.5 Content search

- A search field ("Search content") with a search icon.
- Matches, case-insensitively, a banner's **name**, its **size** ("600x500" or "600 × 500"), and **any text content** in it.
- Filters as you type. **Escape** clears it.
- While typing, the field shows a blue focus outline.
- Results follow edits: changing a text in the table can make its row leave or enter the results.

### 4.6 No-match state

When banners exist but none match the filters: the tables are replaced by the line "No banners match these filters."

### 4.7 Preview fade

While any filter or search is active, banners left out **fade strongly** in the preview (to ~20% opacity), so the matching ones stand out. Clearing the filters restores them. Fading is animated.

---

## 5. Banner set heading

| # | Feature | Summary | Priority |
|---|---|---|---|
| 5.1 | Collapse / expand | Fold a set's table away | |
| 5.2 | Set name and rename | The primary's name; double-click to rename | |
| 5.3 | Banner count tag | How many banners the set holds | |
| 5.4 | Set menu | Move up / down, duplicate, delete the set | |
| 5.5 | Color palette | Every color the set uses, each replaceable everywhere | |

Each table is preceded by a heading row: **chevron · name · count tag · ⋮** on the left, **color palette** on the right. Sets are listed in the playground's banner order, spaced apart.

### 5.1 Collapse / expand

- A chevron button left of the name. Pointing down when open; rotates to point right when collapsed (animated).
- Collapsing hides the set's table and its "Add more sizes" row; the heading (name, count, menu, palette) stays.
- Each set collapses independently. All sets start expanded.

### 5.2 Set name and rename

- The set's name is its **primary banner's name**, the same one as in Create's Banners list — renaming in either place renames both.
- **Double-click** the name to rename in place:
  - the name becomes a field with all its text selected;
  - no box around it: just a **blue underline exactly as wide as the text**, growing and shrinking as you type;
  - **Enter** or clicking away keeps the new name; **Escape** cancels;
  - an empty name is ignored (the old one stays).

### 5.3 Banner count tag

- A small pill right of the name: "3 banners" ("1 banner"). Same tag style as the size tag above banners in Create.
- Counts **every banner in the set**, regardless of filters.

### 5.4 Set menu

- A **⋮** button after the count tag, **shown while hovering the heading** (and while its menu is open or it has keyboard focus).
- Menu items:
  1. **Move up** (up arrow) — swaps the set with the one above. Disabled for the first set.
  2. **Move down** (down arrow) — swaps with the one below. Disabled for the last set.
  3. *separator*
  4. **Duplicate set** — copies the primary and all its sizes as a new set right after; the preview frames the copy.
  5. *separator*
  6. **Delete set** (trash icon) — deletes the primary and all its sizes.
- Moving a set also moves it in the Banners list and on the canvas (the order is shared).

### 5.5 Color palette

- On the right of the heading: a dot for **every distinct color used across the set's banners** — text colors, text fills, shape and vector fills, banner backgrounds — in order of first appearance. Hidden if there are none.
- Hovering a dot outlines it and shows its hex value.
- Clicking a dot opens the color picker. Changing the color **replaces that color everywhere it's used in the set**, live while dragging in the picker.
- The palette updates as content changes (e.g. two colors made identical merge into one dot).

---

## 6. Table structure

| # | Feature | Summary | Priority |
|---|---|---|---|
| 6.1 | Columns | Checkbox, Size, content columns, actions | |
| 6.2 | Column headers | Type icon + name ("Text 1", "Image 2"…) | |
| 6.3 | Column sizing and scrolling | Pinned edges, sideways scroll, fade | |
| 6.4 | Size column | Channel/shape icon and size; S or L width | |
| 6.5 | Row states | Hover, missing content, generating | |

### 6.1 Columns

Left to right:

1. **Checkbox** (pinned left) — selects the banner (see 9.1). The header holds the select-all checkbox.
2. **Size** — which banner the row is (see 6.4).
3. **Content columns** — one per piece of content of the primary, in layer order. Only real content counts: untouched placeholders ("Add headline", the empty image slot) are not listed.
   - **Text** → up to three cells under one header: **text color**, **text fill** (only if that text has a background box), then the **text** itself.
   - **Image** → a thumbnail cell.
   - **Shape / vector** → a color cell.
4. **Actions** (pinned right) — the row's ⋮ menu (see 9.2).

### 6.2 Column headers

- Each header: the content type's icon and its name with an index per type — "Text 1", "Text 2", "Image 1", "Shape 1".
- A text's header spans its color, fill and text cells.
- Narrow columns (image, shape) show only the icon and number, with the full name on hover.

### 6.3 Column sizing and scrolling

- The table fills the table side's width. Text columns share the remaining space equally; image, color and shape columns are just wide enough for their thumbnail or dot.
- Text columns never get narrower than a minimum readable width; below that, the middle of the table **scrolls sideways**, while the checkbox column (left) and actions column (right) **stay pinned**.
- While more columns are hidden to the right, a soft **fade** on the right edge of the scrolling part hints at it; it disappears once scrolled to the end or when everything fits.
- Long content is truncated, never widening its column.

### 6.4 Size column

- **One row per banner:** the channel's icon (or, for a custom size, a shape icon showing its proportions) and the size, "600 × 500". Narrow width (**S**).
- **Grouped view:** wider (**L**) to hold a row's several sizes: its channels' icons on one line, then every size it stands for, comma-separated, wrapping onto more lines (the row grows) rather than cutting any off.
- The size column switches between S and L with the table view toggle.

### 6.5 Row states

- **Hover:** the whole row lifts to a slightly lighter background.
- **Missing content:** a size that doesn't have a piece of content the primary has shows "—" in that cell (not editable).
- **Generating:** a size just added is still being generated (same duration as on the canvas). Its content cells show a pulsing placeholder bar; they become editable once it's done.
- Rows holding an image are taller (64 px) to fit the thumbnail; others are 48 px.

---

## 7. Editing content

| # | Feature | Summary | Priority |
|---|---|---|---|
| 7.1 | Cell focus look | How the active cell shows | |
| 7.2 | Text | Edit text in place | |
| 7.3 | Text color | "T" in the text's color, opens color picker | |
| 7.4 | Text fill | Dot for the text's background box | |
| 7.5 | Image | Thumbnail, opens the visuals picker | |
| 7.6 | Shape / vector color | Dot, opens color picker | |
| 7.7 | Live preview | Edits appear in the preview | |

### 7.1 Cell focus look

- An editable cell **is** the field: clicking anywhere in it edits it.
- The active cell gets a light blue tint and a **1 px blue inset border** (drawn inside the cell, never overlapping the grid lines), plus the **fill handle** on its bottom edge (see 8.2).

### 7.2 Text

- Click to place the caret and type.
- The change is **committed on Enter or when leaving the cell** — not on every keystroke — so the banner updates once per edit.
- The banner's layout is not changed by the new text in this version (no automatic re-layout).

### 7.3 Text color

- A **16 px "T"** drawn in the text's current color, with a faint outline so dark colors stay visible on the dark table. Tooltip: "Text color".
- Click → color picker. Changes apply live.

### 7.4 Text fill

- Only for texts drawn on a background box. A color dot (24 px) showing the box color. Tooltip: "Text fill".
- Click → color picker. Changes apply live.

### 7.5 Image

- A 48 px rounded thumbnail of the current image; an image icon on an empty placeholder when there's none. Hover outlines it.
- Click (or Enter when the cell is focused) → the **visuals picker** (tabs: Playground visuals, Library, Upload). Choosing an image applies it and closes the picker.
- The targets are fixed when the picker opens: if the selection changes meanwhile, the image still goes where it was meant to.

### 7.6 Shape / vector color

- A color dot (24 px). Click → color picker. Changes apply live.

### 7.7 Live preview

- Every edit shows in the preview as it's applied (texts on commit, colors live, images on choice).
- See 11.3 for how the preview follows the table.

---

## 8. Multi-cell editing

| # | Feature | Summary | Priority |
|---|---|---|---|
| 8.1 | Cell selection | Select several cells of one column, edit them all at once | |
| 8.2 | Fill handle | Drag a cell's value down/up its column | |

### 8.1 Cell selection

Figma/spreadsheet-like, **always within a single column**:

- **Click** a cell: selects just it (and focuses it).
- **Drag** from a cell up or down the same column: selects the run from where you pressed to where you are.
- **Shift-click**: selects the run from the first-selected cell (the anchor) to the clicked one.
- **⌘ / Ctrl-click**: adds or removes one cell.
- Selected cells are **tinted blue** (no border); only the active cell — the anchor, where typing goes — has the blue border. The caret goes at the end of its text, nothing highlighted.
- **Editing any selected cell applies the same change to every selected cell**: typing a text, picking a color, choosing an image.
- Clicking outside the table's cells or pressing **Escape** clears the selection. Using a picker opened from a cell (color, visuals) doesn't clear it.
- The preview frames all the selected banners (11.3).

### 8.2 Fill handle

Spreadsheet-like fill:

- The active cell shows a small **handle** on its bottom edge (blue-bordered pill).
- Drag it **up or down the column**: the cursor becomes a vertical resize cursor everywhere, and the cells it covers are tinted as you go.
- On release, the active cell's value is **copied into every covered cell** — text, text color, text fill, image, or shape color.
- Feedback: a soft blue **glimmer** sweeps once across every cell that took the value (~350 ms).
- Afterwards the filled run stays selected, the source cell active, so you can keep typing into all of them.
- Text typed but not yet committed in the source cell is part of what's copied.

---

## 9. Rows

| # | Feature | Summary | Priority |
|---|---|---|---|
| 9.1 | Row checkboxes | Select banners (shared with the preview) | |
| 9.2 | Row menu | See on Create, Duplicate, Delete | |
| 9.3 | Reorder sizes | Drag a row's handle | |
| 9.4 | Add more sizes | Add sizes to the set from the table | |

### 9.1 Row checkboxes

- Each row's checkbox selects its banner; the header checkbox selects or clears **all rows currently shown** (filtered-out rows are left as they are).
- The selection is **the same as the preview's**: checking a row selects that banner in the preview and vice versa.
- After a checkbox change, the preview frames every checked banner (or the single one).
- Selected banners drive the **Download** panel (12).
- In the grouped view, a row's checkbox covers all the banners it stands for.

### 9.2 Row menu

The ⋮ at the end of each row (one banner per row only — none on a grouped row standing for several):

1. **See on Create** — switches to Create mode, opens that banner selected, and centers the canvas on it once the canvas has grown back.
2. **Duplicate** — copies the banner within its set (the copy lines up with the same columns); the preview frames the copy.
3. *separator*
4. **Delete** (trash icon) — deletes that banner.

### 9.3 Reorder sizes

- Hovering a row's checkbox column reveals a **drag handle** in the left margin (it doesn't shift anything when it appears).
- Drag a row up or down: the dragged row fades, and a **blue line** shows where it will land. No line when dropping in place.
- On release, the set's order changes — in the table, in Create's Banners list and on the canvas.
- **The primary always stays first**: it has no handle and nothing can be dropped above it.
- Reordering is unavailable (no handle) while any filter or search is active, or in the grouped view.

### 9.4 Add more sizes

- The table's last row: **"Add more sizes"** (same icon and label as Create's own button).
- Opens a size picker:
  - a search field (focused), matching size names and "WxH";
  - typing a size like "1080x1350" (also "1080 × 1350", "1080*1350") offers it as a **Custom size**; Enter or clicking adds it to the list, already ticked; typed sizes stay listed until the picker closes;
  - every available size grouped by channel (icon + name; "All sizes" for the generic ones), each with checkbox, shape icon, "W × H" and name; a group header ticks/unticks its whole group;
  - "No sizes match" when nothing matches;
  - footer: **Cancel** and **"Add N sizes"** (disabled with nothing ticked).
- Confirming adds the ticked sizes to the set, **adapted from the primary** (same content, same as adding sizes in Create). They appear as the table's last rows in their **generating** state (6.5), and the preview frames the first new one.
- Cancel or closing the picker discards the ticks and the search.

---

## 10. Grouped view

| # | Feature | Summary | Priority |
|---|---|---|---|
| 10.1 | Grouping by content | Banners with identical content share one row | |
| 10.2 | Editing a grouped row | One edit, all banners of the row | |

### 10.1 Grouping by content

- Turned on with the table view toggle (4.2).
- Within each set, banners whose content is **identical in every column** (same texts, text colors and fills, images, shape colors) share **one row**. A banner that differs anywhere gets its own row.
- The row's Size cell lists all its sizes and channels (6.4, wide **L** column).
- Rows regroup live: editing one banner so it now matches others merges it into their row (and the reverse splits it out).
- No reordering and no row ⋮ menu on a row standing for several banners.

### 10.2 Editing a grouped row

- Any edit to a grouped row's cell — typing, colors, image, fill handle, multi-cell selection — **applies to every banner the row stands for**.
- Focusing a grouped row frames all its banners in the preview.

---

## 11. Preview

| # | Feature | Summary | Priority |
|---|---|---|---|
| 11.1 | Read-only canvas | Banners visible, not editable | |
| 11.2 | Selecting banners | Click, shift-click, marquee, click-away | |
| 11.3 | Table → preview link | Preview frames and outlines what you edit | |
| 11.4 | Navigation | Zoom, pan, fit | |
| 11.5 | Primary and set labels | "Primary size" / "All sizes" headers in set order | |
| 11.6 | Order banners | By set, format, channel or size | |
| 11.7 | Ordering columns | Column titles and counts | |

### 11.1 Read-only canvas

- The same banners as Create, in a rounded window on the right, on its own dotted background.
- Nothing inside a banner reacts to the pointer: no layer selection, no text editing, no title-bar dragging or renaming, no "add size" hotspots, no context menu.
- The whole banner is the click target (pointer cursor over it).

### 11.2 Selecting banners

- **Click** a banner: selects it. **Shift-click**: adds/removes it (no text gets highlighted by the shift-click).
- **Drag on the background**: a marquee (blue outline, light blue fill) selects every banner it touches.
- **Click on the background**: clears the selection.
- Unselected banners **dim** (to ~60%) while something is selected. In set order, the rest of a selected banner's set stays undimmed; in the other orderings, only the selected banners do.
- Selection is shared with the table's checkboxes (9.1) and drives the Download panel (12).

### 11.3 Table → preview link

The preview follows where you are in the table:

- **Focusing a row** (any of its cells) **frames that banner** — the camera glides to it — and **outlines it** like a selected banner while you're in that row. Moving between cells of the same row doesn't re-frame. Leaving the row removes the outline (unless you're in a picker opened from it).
- **The active content cell outlines its layer** inside the banner(s) — e.g. editing "Text 2" draws an outline around that text in the preview. With a multi-cell selection, the layer is outlined in every selected banner.
- **A multi-cell selection** spanning several rows frames all those banners together.
- **Checkbox changes** frame the checked banners (9.1).
- **Adding or duplicating** frames the new banner(s).
- Framing is a smooth camera glide, never a jump.

### 11.4 Navigation

- **Scroll** pans; **pinch / ⌘+scroll** zooms around the pointer.
- **Hand** tool (bottom toolbar): drag to pan.
- Zoom bar (bottom-right): zoom level menu and **Fit to screen**.
- Changing the ordering (11.6) re-fits the view.

### 11.5 Primary and set labels

In the default **By set** ordering, the preview shows each set as in Create: its primary under a **"PRIMARY SIZE"** header and its other sizes under **"ALL SIZES"**, with the primary marked as such above it.

### 11.6 Order banners

- A select at the **top-left of the preview** ("By set" by default), same look as the filter bar's selects. Hidden when there are no banners.
- Options:
  - **By set** — as in Create: each primary with its sizes.
  - **By format** — columns **Square**, **Landscape**, **Portrait** (by aspect ratio; e.g. 600×500 counts as square).
  - **By channel** — one column per channel, in the channel catalog's order, **Custom** last.
  - **By size** — one column per distinct size, widest first, then tallest.
- In the non-set orderings, **every banner of the playground** appears (not just the current set), the "Primary" notion is dropped (no primary header or badge), and selecting a banner only keeps that banner undimmed.
- Zoom, pan, selection, the table link and filtering (4.7) all keep working in every ordering.
- Switching ordering re-fits the view to the new arrangement.

### 11.7 Ordering columns

- In non-set orderings, banners are laid out in **columns, left to right**, each column's banners stacked top to bottom.
- Each column has a title above it with a **count**: "SQUARE · 4", a channel's icon and name, "Custom", or the size "600 × 500".

---

## 12. Download

| # | Feature | Summary | Priority |
|---|---|---|---|
| 12.1 | Download panel | Export the selected banners | |

### 12.1 Download panel

- Appears at the **top-right of the preview** as soon as at least one banner is selected (in the preview or via checkboxes); disappears when none is.
- Header: "Download" and "N sizes selected".
- Same export controls as Create's multi-banner panel: **format** (PNG / JPG), **scale** (1x / 2x), and **Export**.
- Export downloads one file per selected banner; a spinner shows in the top bar while it runs.
- No editing in this panel — content is edited through the table.

---

## 13. Keyboard, undo and language

| # | Feature | Summary | Priority |
|---|---|---|---|
| 13.1 | Keyboard | Enter, Escape, Tab | |
| 13.2 | Undo | ⌘Z undoes table edits | |
| 13.3 | Language | English and Japanese | |

### 13.1 Keyboard

| Key | Where | Effect |
|---|---|---|
| Enter | Text cell | Commits the text |
| Enter | Image cell (focused) | Opens the visuals picker |
| Enter | Set name field | Keeps the new name |
| Escape | Table | Clears the cell selection |
| Escape | Set name field | Cancels the rename |
| Escape | Content search | Clears the search |
| Tab / Shift-Tab | Table | Moves between fields |

Create's canvas shortcuts are off in Replace.

### 13.2 Undo

- **⌘Z / Ctrl-Z** undoes the last content change (text, color, image, added/deleted/duplicated banners, reorders…) when you're not typing in a field. While typing, it's the field's own undo.

### 13.3 Language

- Every label, tooltip, menu and message exists in **English and Japanese**, following the app's language setting, including counts ("3 banners" / "3件のバナー", "Add 2 sizes" / "2件のサイズを追加").

---

## 14. Out of scope (for now)

- **Improve banner** — re-adjusting a banner's size and spacing after its content changed (AI). Not needed yet.
- **Mode switch labels** — the switch is icon-only; text labels next to the icons were tried and set aside.
- **Editing layout in Replace** — position, size, font, effects stay in Create.

## 15. Open questions

- Should filters, search, the table view and collapsed sets be **remembered** when leaving and coming back to Replace (and across reloads)?
- Should **"See on Create"** also exist from the preview (e.g. double-click a banner)?
- Should the **grouped view** offer per-banner actions (e.g. split a banner out of its row)?
- How should **very large sets** behave (dozens of sizes): virtualized rows, sticky table headers?
- Should a text change **flag the banner** for review when the new text no longer fits its box?
