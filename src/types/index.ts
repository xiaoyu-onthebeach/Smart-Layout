// Core data model — see auto-layout-prototype-brief-v3.md § Data model.
// `rules-engine`, `adapt-engine`, `size-class`, `size-templates` consume these
// types but stay React-free.

export type SlotKind = 'image' | 'headline' | 'subMessage' | 'price' | 'cta' | 'badge';
export type SizeClass = 'wide' | 'landscape' | 'square' | 'portrait' | 'tall';

export type Rule =
  | { type: 'safeMargin'; px: number }
  | { type: 'maxChars'; slot: SlotKind; max: number }
  | { type: 'minFontSize'; slot: SlotKind; px: number }
  | { type: 'maxTextCoverage'; pct: number }
  | { type: 'requiredSlot'; slot: SlotKind }
  | { type: 'reservedZone'; edge: 'top' | 'bottom' | 'left' | 'right'; px: number; label: string };

export type SizePreset = {
  id: string;
  platformId: string;
  label: string;
  width: number;
  height: number;
  required: boolean;
  ruleSetId: string;
};

export type RuleSet = { id: string; name: string; rules: Rule[] };

export type Platform = { id: string; name: string; presetIds: string[]; maxFileSizeMb: number };

export type Product = {
  id: string;
  name: string;
  imageUrl: string;
  focalPoint: { x: number; y: number };
  headline: string;
  subMessage?: string;
  price?: string;
  ctaLabel: string;
  badge?: string;
};

export type ElementKind = 'image' | 'text' | 'shape';
export type ShapeKind = 'rect' | 'ellipse' | 'line';

export type ShadowStyle = { enabled: boolean; x: number; y: number; blur: number; color: string; opacity: number };

export type LayoutElement = {
  id: string;
  kind: ElementKind;
  slot: SlotKind | null; // null = decorative, adapts by relative position only
  shape?: ShapeKind; // when kind === 'shape'
  content?: string; // text content
  imageUrl?: string; // when kind === 'image'
  focalPoint?: { x: number; y: number };
  frame: { x: number; y: number; w: number; h: number }; // absolute px in layout space
  /**
   * Image only: a larger box dragged out (Cmd+drag a resize handle) beyond `frame` — the image
   * itself stays put at `frame`'s size/position, and the extra area shows as an unfilled, transparent
   * gap with an expand affordance until the user commits it, promoting it to `frame`.
   */
  pendingExpand?: { x: number; y: number; w: number; h: number };
  /**
   * Image only: true once this element's frame has, at some point, fully covered the scene — set
   * automatically by `updateElement` whenever a frame update reaches full coverage, and never
   * cleared afterward. Gates the automatic frame-gap grid/expand affordance, so a freshly placed
   * image (which starts smaller than the frame by default) doesn't show it before the image has
   * actually been full-bleed at least once.
   */
  hasCoveredFrame?: boolean;
  style: {
    fontSize?: number;
    color?: string;
    fontFamily?: string;
    fill?: string;
    radius?: number;
    fontWeight?: number;
    align?: string;
    strokeColor?: string;
    strokeWidth?: number;
    strokeStyle?: 'solid' | 'dashed' | 'dotted';
    letterSpacing?: number;
    /** Horizontal text scale, in percent offset from 100 (0 = normal, e.g. 20 = 120% width). */
    stretch?: number;
    lineHeight?: number;
    textDecoration?: 'none' | 'underline' | 'line-through';
    /** Text only — the "Style" row's own Italic toggle in the decoration popover. */
    fontStyle?: 'normal' | 'italic';
    /** Text only — the decoration popover's "Case" row. */
    textTransform?: 'none' | 'uppercase' | 'capitalize' | 'lowercase';
    /** Text only — the decoration popover's "Features" row (superscript/subscript). */
    verticalAlign?: 'baseline' | 'super' | 'sub';
    /** Shape/image only, 0-100. */
    opacity?: number;
    /** Text only — 'vertical-rl' stacks characters top-to-bottom (traditional Japanese layout). */
    writingMode?: 'horizontal-tb' | 'vertical-rl';
    dropShadow?: ShadowStyle;
    /** Image/shape only — CSS `inset` shadows have no text equivalent, so this is a no-op on text. */
    innerShadow?: ShadowStyle;
  };
  visible: boolean;
  locked?: boolean;
  /** Image only: mirrors the image horizontally/vertically in place (frame is unaffected). */
  flipX?: boolean;
  flipY?: boolean;
  /** Degrees, clockwise, pivoting around the frame's own center. Set by dragging just outside a
   * selected element's corner handle (see SelectionBoundingBox's rotate zone). */
  rotation?: number;
  overridden?: Partial<Record<'frame' | 'style' | 'visible' | 'focalPoint', true>>;
  /** Elements sharing this id (within the same layout) act as one unit — selecting/moving/locking/
   * flipping/reordering/deleting any one of them does the same to every other member. Set by the
   * "Group layers" layer-context-menu action, cleared by "Ungroup". */
  groupId?: string;
};

export type Layout = {
  id: string;
  setId: string;
  productId: string;
  size: { width: number; height: number; presetId?: string; label: string };
  sizeClass: SizeClass;
  ruleSetId: string;
  elements: LayoutElement[];
  isSource: boolean;
  detached: boolean;
  adaptationNotes: string[];
  /** The frame's own background/border — independent of any element on it. */
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted';
  radius?: number;
  /** Hides the scene from export — purely a stored flag, doesn't affect canvas rendering. */
  hidden?: boolean;
  /** User-drawn "scene focus" — absolute px in layout space, kept unaffected by ratio-adaptation. */
  focusRect?: { x: number; y: number; w: number; h: number };
};

// A saved template is a Layout with placeholder content and no set
export type SavedTemplate = {
  id: string;
  name: string;
  category: 'productHero' | 'salePromo' | 'multiProduct' | 'textLed';
  platformId?: string;
  layout: Omit<Layout, 'setId' | 'productId' | 'isSource' | 'detached'>;
  thumbnailFrom: 'render'; // rendered live, not a static image
};

export type BannerSet = {
  id: string;
  name: string;
  sourceLayoutId: string;
  layoutIds: string[];
  productIds: string[];
};

export type Violation = {
  id: string;
  elementId: string;
  ruleType: Rule['type'];
  severity: 'warning';
  message: string;
};
