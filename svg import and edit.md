## Context  
This is a prototype of the Beachside canvas (Fabric.js based). We are adding three things:  
1. **SVG import**: when an SVG is added to the canvas, the left layer panel shows its structure with the correct layer types and names.  
2. **Vector editing**: interaction states for editing a vector layer's joints directly on the canvas, including adding joints on a segment.  
3. **Pen tool drawing**: drawing a new vector from scratch, joint by joint.  
Fabric.js already has pen tool / path editing building blocks. **Reuse what exists in the codebase (and Fabric's path utilities) before writing anything from scratch**, and adjust visuals and behavior to match this spec.  
## Before you start  
1. Find and read: the Fabric canvas setup, the bottom toolbar (it already has a pen tool button), the layer panel component, how layers are modeled and synced with canvas objects, any existing pen tool / path editing code, and how undo works (if it exists).  
2. Check the Fabric.js version, since path APIs differ between v5 and v6.  
3. Summarize what you found and your plan briefly before making large changes.  
4. Use existing design tokens / CSS variables for colors and sizes. Do not hardcode new colors unless no token exists.  
## Shared visual language  
These visuals are reused across Parts 2 and 3. Keep them in one place (constants or a small render helper). use the visual assets in the icons/SVGs folder:  

| Element | Look |
| ---------------------------------------------- | -------------------------------------------------------- |
| Joint, default | Small circle, white fill, accent (blue) outline |
| Joint, selected / active | Accent fill, white outline, slightly larger |
| Committed path outline (in edit/draw mode) | Thin neutral gray stroke |
| Highlighted segment | Accent stroke |
| Midpoint dot (add-joint target) | Small accent-filled dot on the segment's midpoint |
| Preview joint (pen cursor tip, not yet placed) | Joint default style |
| Preview segment (rubber band while drawing) | Accent stroke |
| Pen cursor | Pen nib icon (custom CSS cursor, hotspot at the nib tip) |
| Pen-add cursor | Pen nib icon with a small "+" |
  
Suggested sizes, kept constant in **screen** pixels at any zoom:  
* Joint: 8px diameter, 10px when selected/hovered  
* Midpoint dot: 8px; enlarges to joint-selected size on hover  
* Joint hit radius: 8px  
* Segment hover tolerance: 6px  
* Outline / segment stroke: 1px neutral, 1.5px highlighted  
  
## Part 1: SVG import → layer panel  
## Entry points  
* Upload via the existing Upload button (accept .svg)  
* Drag and drop an .svg file onto the canvas  
* Paste SVG markup from the clipboard (image/svg+xml, or text/plain / text/html containing <svg)  
Use fabric.loadSVGFromString / loadSVGFromURL to parse. Strip <script>, event handler attributes, <foreignObject>, and external hrefs before parsing.  
## Layer type mapping  
Only three layer types exist after import: **Vector path**, **Group**, **Image**.  

| SVG contains | Layer type | Name |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| <path> | Vector path | Original name, else Vector N |
| Shapes: <rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon> | Vector path (convert the Fabric object to a Path) | Original name, else Vector N |
| <text> | Vector path, outlined, not editable as text | The text content, e.g. SALE |
| Mask / clip path | Group of vector path layers, no clipping (remove the clipPath, add the mask shape as a normal visible child layer) | Original name, else Group N |
| <g> | Group | Original name, else Group N |
| <image> (embedded only) | Image | Original name, else Image N |
  
"Original name" = the element's id (or <title> if present), cleaned up: underscores and hyphens to spaces. Example: brand_logo → brand logo.  
**Text outlining:** if a font file is available, outline with opentype.js. For the prototype it is acceptable to keep the Fabric text object but present it everywhere as a Vector path layer (vector icon, not text-editable, double-click does nothing text-related). Leave a TODO noting real outlining.  
**Text outlining:** if a font file is available, outline with opentype.js. For the prototype it is acceptable to keep the Fabric text object but present it everywhere as a Vector path layer (vector icon, not text-editable, double-click does nothing text-related). Leave a TODO noting real outlining.  
## Structure rules  
* **Single element SVG** (one path or shape): add it directly as one layer. No wrapper group.  
* **Multiple elements**: wrap in a Group named after the SVG root id, else the file name (without .svg).  
* Preserve nested <g> structure as nested Groups.  
* Remove empty groups. Collapse a <g> that has exactly one child and no meaningful styling into that child.  
* Flatten group transforms into children where possible, so position/rotation values are clean.  
## Numbering  
* For imports, counters are **scoped per import** (a second imported SVG starts again at 1).  
* For vectors drawn with the pen tool directly in a frame (Part 3), the counter is **scoped per frame**.  
* **Separate counters per type** (Vector, Group, Image).  
* Number in **layer panel order, top to bottom, depth-first**.  
* Layers that have an original name don't consume a number.  
* Numbers are assigned once and **never renumber** on delete or reorder.  
* New layers added later in the same scope continue the counter.  
Keep the default base names in one constant so they're easy to change.  
Example (no ids on the vectors):  
```
LOGO
  Vector 1
  Vector 2
  BACKGROUND
    Vector 3
    Vector 4
    GROUP 1
      Vector 5
      Vector 6

```
## Layer panel visuals  
Match the existing layer panel style, and use the vector layer thumbnail.svg in the icons/svgs folder  
* Vector path row: vector (pen/node) icon + name  
* Image row: image thumbnail + name  
* Text row (existing, non-SVG text layers): T icon + name  
* Group row: chevron (expand/collapse) + name in small uppercase label style, no icon; children indented one level per depth  
* Newly added layers appear at the top of the current frame's layer list (front-most)  
* Clicking a row selects the canvas object; selecting on canvas highlights the row; selecting a child expands its parent groups  
  
## Part 2: Vector editing states  
Implement as an explicit state machine so states are easy to inspect and demo.  
```
idle → focused → editing
                   ├─ joint:hover
                   ├─ joint:selected
                   ├─ joint:dragging
                   ├─ segment:hover
                   └─ midpoint:hover → (click) joint inserted → joint:selected

```
## 1. Focused (after add/creation, or single click)  
* same bounding box as other layers  
* A **red radius handle** sits just inside the shape's top vertex. use the radius handler.svg in the icon folder. make it non-interactive for now.  
* **No joints visible.**  
* Dragging moves the whole layer; handles resize as usual.  
* A newly imported or drawn vector layer starts in this state.  
## 2. Editing (double-click a vector layer)  
* Enter by **double-clicking** a vector layer (also Enter while focused).  
* Bounding box and all handles disappear.  
* The path shows a thin **neutral gray** (white 45%opacity) 1px outline outside.  
* **Joints** appear at every path vertex in the default joint style.(joint-default.svg in the icon folder)  
* Exit with Esc (back to Focused) or click on empty canvas (deselect).  
* Double-clicking a Group enters the group and selects the child under the cursor (not edit mode).  
## 3. Joint hover / selected  
* Hover on a joint: joint enlarges slightly. (reference joint-hover.svg in the icon folder)  
* Click a joint: joint switches to the **selected** style (accent fill). Only one selected at a time for this prototype.  
* Clicking elsewhere on the path or canvas (still in edit mode) deselects the joint.  
## 4. Joint dragging  
* Click and drag a joint to move it. The shape updates live; other joints stay fixed.  
* The dragged joint shows the selected style during and after the drag.  
* Cursor stays the default arrow.  
* One drag = one undo step (if undo exists).  
* After the drag, recompute the path's bounds/dimensions **without the shape visually jumping** (Fabric paths need pathOffset / dimensions updated; keep the on-screen position stable).  
## 5. Adding joints on a segment  
**a. Highlight on the border**  
* Hovering near a segment (between two joints) highlights that segment with an accent stroke.  
* A midpoint dot (joint-midpoint.svg) appears at the segment's midpoint.  
* Cursor stays the default arrow.  
**b. Hover on the new joint (the midpoint dot)**  
* The dot enlarges to the selected-joint size (accent fill, white outline).  
* The segment highlight goes back to the neutral outline (as designed).  
* Cursor changes to the **pen-add** cursor → use pen curosr-add.svg  
**c. Click on the new joint**  
* Click inserts a real joint at that position, splitting the segment in two. The new joint is selected.  
* click on the midpoint inserts the joint and starts moving the cursor  
* For curved segments, split the bezier at t = 0.5 (de Casteljau) so the curve shape is unchanged.  
## Keyboard (editing)  
* Enter: focused → editing  
* Esc: editing → focused  
* Delete / Backspace with a joint selected: remove that joint (nice to have, skip if complex). Don't allow fewer than 2 joints.  
  
## Part 3: Drawing a new vector with the pen tool  
## Entering the tool  
* Click the pen tool button in the bottom toolbar (it shows its active state), or press P.  
* Over the canvas, the cursor becomes the **pen** cursor.  
## States  
```
pen:default → pen:pressed → (first joint placed) → drawing:preview → (click) joint confirmed → drawing:preview → … → finish

```
**1. Default**  
* Pen cursor with a **preview joint** (default joint style) at the nib tip, following the mouse.  
**2. Pressed**  
* On mousedown, the preview joint switches to the **selected** style (accent fill).  
* On release, the first joint is placed and stays in the selected style (it is the active joint).  
**3. Drawing a new line (preview)**  
* While moving the mouse, a **preview segment** (accent stroke) runs from the active joint to the cursor, with a preview joint at the nib tip.  
* Support both gestures, both producing **straight** segments:  
    * click, move, click (no button held while moving)  
    * press, drag, release (release places the next joint)  
* Shift constrains the preview segment to 45° increments (nice to have).  
**4. New joint confirmed**  
* Placing the next joint commits the segment:  
    * the committed segment becomes the **neutral gray** outline  
    * the previous joint returns to the **default** joint style  
    * the newly placed joint becomes the **selected** (active) joint  
* Continue placing joints the same way.  
## Finishing  
* Enter or Esc: finish as an **open** path.  
* Clicking the **first joint**: close the path and finish.  
* Switching to another tool also finishes the current path.  
* A path with only one joint is discarded on finish.  
* After finishing:  
    * a new **Vector** layer is created in the current frame, named per the numbering rules (Vector N, scoped per frame)  
    * it appears at the top of the frame's layer list and is selected in the layer panel  
    * the canvas object enters the **Focused** state  
    * the active tool returns to Select  
## Default style for new vectors  
Put these in constants (final values TBD by design):  
* Open path: neutral stroke, 2px, no fill  
* Closed path: default fill, no stroke  
## Undo while drawing  
* Backspace while drawing removes the last placed joint.  
* Undo after finishing removes the whole new vector in one step.  
  
## Test fixtures  
Create sample SVGs in the prototype (e.g. /fixtures/svg/) and a quick way to load each:  
1. single-path.svg: one <path> (logo shape) → one Vector layer, no group  
2. grouped.svg: <g id="logo"> with paths brand_logo, shadow, bg + an <image id="Background">  
3. nested.svg: <g id="LOGO"> containing 2 unnamed paths and <g id="BACKGROUND"> with 2 unnamed paths and an unnamed nested <g> with 2 more → matches the numbering example above  
4. text.svg: a <text>SALE</text> → layer named SALE with vector icon  
5. mask.svg: content clipped by a <clipPath> → group with the mask shape as a visible child, no clipping  
6. no-ids.svg: three unnamed paths → Vector 1, Vector 2, Vector 3  
7. triangle.svg and diamond.svg: single shapes for testing all editing states  
## Acceptance checklist  
**Import**  
* [ ] Uploading, dropping, and pasting an SVG all add it to the canvas  
* [ ] Each fixture produces the expected layer tree, types, icons, and names  
* [ ] Numbering follows the rules above and doesn't change after delete/reorder  
* [ ] Layer panel ↔ canvas selection stays in sync  
**Editing**  
* [ ] New vector appears Focused: bounding box, corner squares, left/right pills, red ring, no joints  
* [ ] Double-click enters editing: handles hidden, gray outline, joints visible  
* [ ] Joint hover, select, and drag work; shape updates live and doesn't jump on release  
* [ ] Segment hover highlights the segment and shows a midpoint dot  
* [ ] Midpoint hover enlarges the dot and shows the pen-add cursor; click inserts a selected joint; click-drag inserts and drags  
* [ ] Joint and dot sizes stay constant when zooming  
* [ ] Esc / click outside exits editing  
**Pen drawing**  
* [ ] Pen tool activates from toolbar and P; pen cursor shows a preview joint  
* [ ] Press shows the pressed state; first joint is placed on release  
* [ ] Preview segment follows the cursor; both click-click and press-drag-release place joints  
* [ ] Confirmed segments turn gray; previous joint returns to default; new joint is active  
* [ ] Enter/Esc finishes open; clicking the first joint closes; single-joint paths are discarded  
* [ ] Finished vector appears in the layer panel as Vector N, is Focused on canvas, and the tool returns to Select  
## Out of scope for this task  
* Shape menu additions (Polygon, Arrow)  
* Bezier curves: creating curves while drawing, editing curve handles, corner/smooth conversion  
* Multi-joint selection, boolean operations  
* Red ring handle behavior (render only)  
* Vertical text trim  
* Exporting back to SVG  
