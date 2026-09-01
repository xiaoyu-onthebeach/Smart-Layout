# Task: Position overlay elements on multi-size banner backgrounds using percentage-based, archetype-shared coordinates

## Context

I have one primary/master banner design containing several elements (a coupon badge, a logo, a headline text block, a CTA button, a product image, and a bottom info bar) placed over a background image. I've already generated background-only versions of this banner at multiple target sizes (different aspect ratios). Right now those generated sizes show only the background — the elements aren't positioned on them yet.

I want to overlay the same elements onto every generated size, positioned using **percentage-based coordinates** (not fixed pixels), so the layout scales correctly across very different aspect ratios. This is a prototype/mock of an auto-layout feature — it does not need real layout computation, just consistent percentage placement.

## Sizes to place elements on

- 1280×720
- 1200×628
- 970×600
- 300×600
- 1500×300
- 728×90
- 320×50
- (add any others from your generated set)

## Archetype grouping (to minimize manual work)

Group the sizes above into 3 shape buckets by aspect ratio (width ÷ height):

- **Wide** — ratio ≥ ~1.5:1
- **Square** — ratio between ~0.8:1 and ~1.5:1
- **Tall** — ratio ≤ ~0.8:1

Each archetype gets its own single set of element positions below. Every size within an archetype reuses that same set — do not create unique coordinates per individual size.

All coordinates are **percentages of canvas width/height, measured from the top-left corner** of the canvas, unless noted otherwise. `w_pct`/`h_pct` are the element's own width/height as a percentage of canvas width/height.

## Element positions per archetype

### Wide archetype
| element | x_pct | y_pct | w_pct | h_pct | notes |
|---|---|---|---|---|---|
| coupon | 5% | 8% | 11% | 35% | top-left corner |
| product_image | 30% | 32% | 20% | 45% | sits on the shelf between coupon and text block |
| logo | 54% | 13% | 12% | 7% | top-left corner |
| headline | 54% | 25% | 24% | 10% | left-align with logo, right below the logo |
| button | 54% | 46% | 15% | 11% | left-align with logo, right below headline |
| bottom_banner | 0% | 78% | 100% | 22% | full width, pinned to bottom |

### Square archetype
| element | x_pct | y_pct | w_pct | h_pct | notes |
|---|---|---|---|---|---|
| coupon | 7% | 13% | 17% | 18% | top-left corner |
| logo | 41% | 17% | 28% | 5% | top-left corner |
| headline | 41% | 24% | 54% | 8% | left-align with logo, right below the logo |
| button | 41% | 38% | 35% | 10% | left-align with logo, right below headline |
| product_image | 20% | 52% | 28% | 25% | centered below coupon/text block, above bottom banner |
| bottom_banner | 0% | 91% | 100% | 9% | full width, pinned to bottom |

### Tall archetype
| element | x_pct | y_pct | w_pct | h_pct | notes |
|---|---|---|---|---|---|
| coupon | 16% | 15% | 21% | 12% | top-left corner |
| logo | 17% | 33% | 32% | 3% | top-left corner |
| headline | 17% | 37% | 64% | 6% | left-align with logo, right below the logo |
| button | 15% | 45% | 40% | 6% | roughly left-align with logo, right below headline |
| product_image | 36% | 58% | 26% | 17% | centered horizontally, above bottom banner |
| bottom_banner | 0% | 89% | 100% | 11% | full width, pinned to bottom |

**Note on these numbers:** they were read visually off reference banner frames, not measured pixel-exactly — treat widths especially as approximate, since they reflect the length of the specific Japanese copy ("毎日のスキンケア", "詳しくはこちら") at the reference font size. If copy changes, width may need to flex to content rather than staying fixed.

## What I need you to build

1. Take each generated background image (or the live canvas element per size, depending on how the prototype is built) and determine which archetype bucket it falls into, based on its aspect ratio.
2. Convert that archetype's percentage coordinates into actual pixel positions for that specific canvas size (`x_px = x_pct * canvas_width`, `y_px = y_pct * canvas_height`, same for width/height).
3. Overlay each element (image or text box) at the computed position, sized proportionally.
4. Do this for all sizes in the list, so every generated banner shows the same six elements (coupon, logo, headline, button, product_image, bottom_banner), correctly scaled and positioned for its own dimensions — using only these 3 sets of authored coordinates, not one set per size.
5. Make this reusable — e.g. a function/component that takes `(canvas_width, canvas_height, archetype_positions)` and returns rendered element positions, so I can adjust percentage values later without redoing the layout code.

## Constraints

- No real layout/AI computation needed — this is a visual mock. Simple percentage math only.
- Keep element aspect ratios reasonable when scaling (don't distort images/badges/product photo).
- [Add if relevant: "Use CSS absolute positioning with % values" / "Use Figma auto-layout" / "Use canvas/SVG coordinates" — whichever matches your prototype's tech stack]

## Use these to build

- I'll provide the image reference for primary/master position.
- Use the big size.png in the samples folder to put into each size.
- Use the component svgs I already added into the samples folder for each component.
