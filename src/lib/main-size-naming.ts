import type { AppState } from '@/store/types';
import { classifyRatioBucket } from './size-class';

/** Disambiguates a name against every existing scene name — "X", then "X 2", "X 3", etc. */
export function nextAvailableName(state: Pick<AppState, 'setsById'>, baseLabel: string): string {
  const existingNames = new Set(Object.values(state.setsById).map((s) => s.name));
  if (!existingNames.has(baseLabel)) return baseLabel;
  let n = 2;
  while (existingNames.has(`${baseLabel} ${n}`)) n++;
  return `${baseLabel} ${n}`;
}

/** Recognizes an auto-generated main-size name ("Main Square", "Main Square 2", ...) — a name the
 * user typed themselves never matches this, so a shape change leaves it alone. */
const MAIN_SIZE_NAME_RE = /^Main (Square|Horizontal|Vertical)(?: (\d+))?$/;

function mainSizeShapeWord(width: number, height: number): 'Square' | 'Horizontal' | 'Vertical' {
  const bucket = classifyRatioBucket(width, height);
  return bucket === 'horizontal' ? 'Horizontal' : bucket === 'vertical' ? 'Vertical' : 'Square';
}

/**
 * If `currentName` still looks auto-generated, returns the name it should carry for the new
 * width/height (e.g. "Main Square" → "Main Horizontal" once its ratio moves into that bucket,
 * "Main Square 2" → "Main Horizontal 2"), disambiguated against every other scene. Returns null
 * when the name was custom (leave it alone) or the shape hasn't actually changed.
 */
export function autoMainSizeRename(state: Pick<AppState, 'setsById'>, currentName: string, width: number, height: number): string | null {
  const match = MAIN_SIZE_NAME_RE.exec(currentName);
  if (!match) return null;
  const shape = mainSizeShapeWord(width, height);
  const suffix = match[2] ? ` ${match[2]}` : '';
  const preferred = `Main ${shape}${suffix}`;
  if (preferred === currentName) return null;
  const existingNames = new Set(Object.values(state.setsById).map((s) => s.name));
  if (!existingNames.has(preferred)) return preferred;
  return nextAvailableName(state, `Main ${shape}`);
}
