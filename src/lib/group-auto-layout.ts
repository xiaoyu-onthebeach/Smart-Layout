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

/**
 * What turning a group's Auto Layout on starts from — picks the direction and spacing the members
 * already roughly have (like Figma does), so switching it on tidies the group up rather than
 * collapsing everything into a pile.
 */
export function inferGroupAutoLayout(members: LayoutElement[]): GroupAutoLayout {
  const bounds = framesBounds(members.map((m) => m.frame));
  const sumW = members.reduce((sum, m) => sum + m.frame.w, 0);
  const sumH = members.reduce((sum, m) => sum + m.frame.h, 0);
  // Whichever axis has more room left over once the members' own sizes are taken out is the one
  // they're spread along.
  const direction = bounds.h - sumH > bounds.w - sumW ? 'vertical' : 'horizontal';
  const free = direction === 'vertical' ? bounds.h - sumH : bounds.w - sumW;
  const gap = members.length > 1 ? Math.max(0, Math.round(free / (members.length - 1))) : 0;
  return { x: bounds.x, y: bounds.y, direction, gap, padding: { top: 0, right: 0, bottom: 0, left: 0 }, hugWidth: true, hugHeight: true, width: bounds.w, height: bounds.h };
}

/**
 * Where every member of an auto-layout group belongs, plus the group's own box (anchored at its
 * stored top-left). Members are ordered by their current position along the stacking axis, so
 * dragging one past another reorders the stack.
 */
export function computeGroupAutoLayout(members: LayoutElement[], layout: GroupAutoLayout): { frames: Map<string, LayoutElement['frame']>; box: Box } {
  const { padding, gap } = layout;
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
  const contentW = vertical ? crossSize : mainSize;
  const contentH = vertical ? mainSize : crossSize;
  return {
    frames,
    box: {
      x: originX,
      y: originY,
      w: layout.hugWidth ? contentW + padding.left + padding.right : layout.width,
      h: layout.hugHeight ? contentH + padding.top + padding.bottom : layout.height,
    },
  };
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
    if (!el.groupId || !el.groupLayout || seen.has(el.groupId)) continue;
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
