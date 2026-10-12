import type { GroupAutoLayout, LayoutElement } from '@/types';

type Box = { x: number; y: number; w: number; h: number };

/** Bounding box of a set of frames. */
export function framesBounds(frames: LayoutElement['frame'][]): Box {
  const minX = Math.min(...frames.map((f) => f.x));
  const minY = Math.min(...frames.map((f) => f.y));
  const maxX = Math.max(...frames.map((f) => f.x + f.w));
  const maxY = Math.max(...frames.map((f) => f.y + f.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * What switching a group's Auto Layout on starts from — picks the direction and spacing the members
 * already roughly have (like Figma does), so switching it on tidies the group up rather than
 * collapsing everything into a pile. Keeps any `padding` the group already has, with the box placed
 * so the members don't move.
 */
export function inferGroupAutoLayout(members: LayoutElement[], padding = NO_PADDING): GroupAutoLayout {
  const bounds = framesBounds(members.map((m) => m.frame));
  const sumW = members.reduce((sum, m) => sum + m.frame.w, 0);
  const sumH = members.reduce((sum, m) => sum + m.frame.h, 0);
  // Whichever axis has more room left over once the members' own sizes are taken out is the one
  // they're spread along.
  const direction = bounds.h - sumH > bounds.w - sumW ? 'vertical' : 'horizontal';
  const free = direction === 'vertical' ? bounds.h - sumH : bounds.w - sumW;
  const gap = members.length > 1 ? Math.max(0, Math.round(free / (members.length - 1))) : 0;
  return { x: bounds.x - padding.left, y: bounds.y - padding.top, direction, gap, padding };
}

/** Padding only, no stacking — what a group's layout becomes when its padding is set while Auto
 * Layout is off (x/y aren't used: the box follows the members). */
export function paddingOnlyGroupLayout(padding: GroupAutoLayout['padding']): GroupAutoLayout {
  return { x: 0, y: 0, direction: 'none', gap: 0, padding };
}

/**
 * Where every member of a group belongs, plus the group's own box and the spacing between
 * consecutive members (`gaps`, spanning the box's inside width or height). With direction 'none'
 * members stay wherever they are and the box is just their bounds plus padding. Otherwise they're
 * stacked from the box's stored top-left, ordered by their current position along the stacking
 * axis (so dragging one past another reorders the stack), and the box hugs them.
 */
export function computeGroupAutoLayout(members: LayoutElement[], layout: GroupAutoLayout): { frames: Map<string, LayoutElement['frame']>; box: Box; gaps: Box[] } {
  const { padding, gap } = layout;
  if (layout.direction === 'none') {
    const bounds = framesBounds(members.map((m) => m.frame));
    return {
      frames: new Map(members.map((m) => [m.id, m.frame])),
      box: { x: bounds.x - padding.left, y: bounds.y - padding.top, w: bounds.w + padding.left + padding.right, h: bounds.h + padding.top + padding.bottom },
      gaps: [],
    };
  }
  const vertical = layout.direction === 'vertical';
  const originX = layout.x;
  const originY = layout.y;

  const ordered = [...members].sort((a, b) =>
    vertical ? a.frame.y - b.frame.y || a.frame.x - b.frame.x : a.frame.x - b.frame.x || a.frame.y - b.frame.y,
  );

  const frames = new Map<string, LayoutElement['frame']>();
  let cursor = vertical ? originY + padding.top : originX + padding.left;
  for (const m of ordered) {
    const x = vertical ? originX + padding.left : cursor;
    const y = vertical ? cursor : originY + padding.top;
    frames.set(m.id, { ...m.frame, x, y });
    cursor += (vertical ? m.frame.h : m.frame.w) + gap;
  }

  const mainSize = ordered.reduce((sum, m) => sum + (vertical ? m.frame.h : m.frame.w), 0) + gap * Math.max(0, ordered.length - 1);
  const crossSize = Math.max(...ordered.map((m) => (vertical ? m.frame.w : m.frame.h)));
  const box = {
    x: originX,
    y: originY,
    w: (vertical ? crossSize : mainSize) + padding.left + padding.right,
    h: (vertical ? mainSize : crossSize) + padding.top + padding.bottom,
  };

  const gaps: Box[] = [];
  if (gap > 0) {
    for (const m of ordered.slice(0, -1)) {
      const f = frames.get(m.id)!;
      gaps.push(
        vertical
          ? { x: originX + padding.left, y: f.y + f.h, w: box.w - padding.left - padding.right, h: gap }
          : { x: f.x + f.w, y: originY + padding.top, w: gap, h: box.h - padding.top - padding.bottom },
      );
    }
  }
  return { frames, box, gaps };
}

/**
 * What it takes to settle every auto-layout group in `elements` — empty once everything's in
 * place, so a caller can re-run this after any change without looping. If every member of a group
 * is off by the same amount, the group itself was moved (dragged as a whole, aligned, nudged), so
 * its box follows them; otherwise individual members are put back into the stack.
 */
export function pendingGroupAutoLayoutChanges(elements: LayoutElement[]): {
  moves: { id: string; frame: LayoutElement['frame'] }[];
  relocated: { groupId: string; layout: GroupAutoLayout }[];
} {
  const moves: { id: string; frame: LayoutElement['frame'] }[] = [];
  const relocated: { groupId: string; layout: GroupAutoLayout }[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    // A padding-only group has nothing to keep in place — its members move freely.
    if (!el.groupId || !el.groupLayout || el.groupLayout.direction === 'none' || seen.has(el.groupId)) continue;
    seen.add(el.groupId);
    const members = elements.filter((m) => m.groupId === el.groupId);
    const { frames } = computeGroupAutoLayout(members, el.groupLayout);
    const offsets = members.map((m) => ({ m, dx: m.frame.x - frames.get(m.id)!.x, dy: m.frame.y - frames.get(m.id)!.y }));
    const off = offsets.filter((o) => Math.abs(o.dx) > 0.5 || Math.abs(o.dy) > 0.5);
    if (off.length === 0) continue;
    const { dx, dy } = offsets[0];
    if (offsets.every((o) => Math.abs(o.dx - dx) < 0.5 && Math.abs(o.dy - dy) < 0.5)) {
      relocated.push({ groupId: el.groupId, layout: { ...el.groupLayout, x: el.groupLayout.x + dx, y: el.groupLayout.y + dy } });
    } else {
      for (const o of off) moves.push({ id: o.m.id, frame: frames.get(o.m.id)! });
    }
  }
  return { moves, relocated };
}
