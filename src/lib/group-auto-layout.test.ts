import { describe, expect, it } from 'vitest';
import type { GroupAutoLayout } from '@/types';
import { el } from '@/test/factories';
import { computeGroupAutoLayout, framesBounds, inferGroupAutoLayout, paddingOnlyGroupLayout, pendingGroupAutoLayoutChanges } from './group-auto-layout';

const PAD = (n: number) => ({ top: n, right: n, bottom: n, left: n });

// Three layers spread down a column, 30px apart, left edges aligned.
const column = () => [el('a', { x: 0, y: 0, w: 100, h: 20 }), el('b', { x: 0, y: 50, w: 80, h: 20 }), el('c', { x: 0, y: 100, w: 60, h: 20 })];

describe('framesBounds', () => {
  it('spans every frame', () => {
    expect(framesBounds([{ x: 10, y: 20, w: 30, h: 40 }, { x: -5, y: 50, w: 10, h: 10 }])).toEqual({ x: -5, y: 20, w: 45, h: 40 });
  });
});

describe('inferGroupAutoLayout', () => {
  it('picks the axis the layers are spread along, and their average spacing', () => {
    expect(inferGroupAutoLayout(column())).toMatchObject({ direction: 'vertical', gap: 30, x: 0, y: 0 });
  });

  it('detects a row', () => {
    const row = [el('a', { x: 0, y: 0, w: 40, h: 20 }), el('b', { x: 60, y: 0, w: 40, h: 20 })];
    expect(inferGroupAutoLayout(row)).toMatchObject({ direction: 'horizontal', gap: 20 });
  });

  it('places the box so existing padding surrounds the layers without moving them', () => {
    expect(inferGroupAutoLayout(column(), { top: 5, right: 0, bottom: 0, left: 10 })).toMatchObject({ x: -10, y: -5 });
  });

  it('never infers a negative gap for overlapping layers', () => {
    const overlapping = [el('a', { x: 0, y: 0, w: 50, h: 50 }), el('b', { x: 10, y: 10, w: 50, h: 50 })];
    expect(inferGroupAutoLayout(overlapping).gap).toBe(0);
  });
});

describe('computeGroupAutoLayout', () => {
  const vertical: GroupAutoLayout = { x: 0, y: 0, direction: 'vertical', gap: 10, padding: PAD(5) };

  it('stacks a column from the box corner, inside the padding', () => {
    const { frames } = computeGroupAutoLayout(column(), vertical);
    expect(frames.get('a')).toMatchObject({ x: 5, y: 5 });
    expect(frames.get('b')).toMatchObject({ x: 5, y: 35 });
    expect(frames.get('c')).toMatchObject({ x: 5, y: 65 });
  });

  it('keeps each layer’s own size', () => {
    const { frames } = computeGroupAutoLayout(column(), vertical);
    expect(frames.get('b')).toMatchObject({ w: 80, h: 20 });
  });

  it('hugs the stack plus padding', () => {
    // widest layer 100 + 5 + 5; three 20px layers + two 10px gaps + 5 + 5
    expect(computeGroupAutoLayout(column(), vertical).box).toEqual({ x: 0, y: 0, w: 110, h: 90 });
  });

  it('reports the gaps between layers, spanning the inside width', () => {
    expect(computeGroupAutoLayout(column(), vertical).gaps).toEqual([
      { x: 5, y: 25, w: 100, h: 10 },
      { x: 5, y: 55, w: 100, h: 10 },
    ]);
  });

  it('reports no gaps when the gap is 0', () => {
    expect(computeGroupAutoLayout(column(), { ...vertical, gap: 0 }).gaps).toEqual([]);
  });

  it('orders a row by current position, not by layer order', () => {
    const members = [el('right', { x: 200, y: 0, w: 30, h: 10 }), el('left', { x: 0, y: 0, w: 50, h: 10 })];
    const { frames } = computeGroupAutoLayout(members, { x: 0, y: 0, direction: 'horizontal', gap: 4, padding: PAD(0) });
    expect(frames.get('left')).toMatchObject({ x: 0, y: 0 });
    expect(frames.get('right')).toMatchObject({ x: 54, y: 0 });
  });

  it('with no direction, leaves layers alone and grows the box by the padding', () => {
    const members = column();
    const { frames, box, gaps } = computeGroupAutoLayout(members, paddingOnlyGroupLayout({ top: 1, right: 2, bottom: 3, left: 4 }));
    expect(frames.get('b')).toEqual(members[1].frame);
    expect(box).toEqual({ x: -4, y: -1, w: 106, h: 124 });
    expect(gaps).toEqual([]);
  });
});

describe('pendingGroupAutoLayoutChanges', () => {
  const groupLayout: GroupAutoLayout = { x: 0, y: 0, direction: 'vertical', gap: 10, padding: PAD(0) };
  const settled = () => [
    el('a', { x: 0, y: 0, w: 100, h: 20 }, { groupId: 'g', groupLayout }),
    el('b', { x: 0, y: 30, w: 80, h: 20 }, { groupId: 'g', groupLayout }),
  ];

  it('has nothing to do once everything is in place', () => {
    expect(pendingGroupAutoLayoutChanges(settled())).toEqual({ moves: [], relocated: [] });
  });

  it('puts a single displaced layer back into the stack', () => {
    const elements = settled();
    elements[1] = { ...elements[1], frame: { ...elements[1].frame, x: 40 } };
    const { moves, relocated } = pendingGroupAutoLayoutChanges(elements);
    expect(relocated).toEqual([]);
    expect(moves).toEqual([{ id: 'b', frame: { x: 0, y: 30, w: 80, h: 20 } }]);
  });

  it('restacks the layers after one grows', () => {
    const elements = settled();
    elements[0] = { ...elements[0], frame: { ...elements[0].frame, h: 50 } };
    expect(pendingGroupAutoLayoutChanges(elements).moves).toEqual([{ id: 'b', frame: { x: 0, y: 60, w: 80, h: 20 } }]);
  });

  it('treats every layer shifting by the same amount as moving the whole group', () => {
    const elements = settled().map((m) => ({ ...m, frame: { ...m.frame, x: m.frame.x + 15, y: m.frame.y + 25 } }));
    const { moves, relocated } = pendingGroupAutoLayoutChanges(elements);
    expect(moves).toEqual([]);
    expect(relocated).toEqual([{ groupId: 'g', layout: { ...groupLayout, x: 15, y: 25 } }]);
  });

  it('ignores padding-only groups, whose layers move freely', () => {
    const free = paddingOnlyGroupLayout(PAD(10));
    const elements = [el('a', { x: 0, y: 0, w: 10, h: 10 }, { groupId: 'g', groupLayout: free }), el('b', { x: 300, y: 7, w: 10, h: 10 }, { groupId: 'g', groupLayout: free })];
    expect(pendingGroupAutoLayoutChanges(elements)).toEqual({ moves: [], relocated: [] });
  });

  it('ignores layers that aren’t in an auto-layout group', () => {
    expect(pendingGroupAutoLayoutChanges([el('a', { x: 3, y: 9, w: 10, h: 10 }), el('b', { x: 0, y: 0, w: 10, h: 10 }, { groupId: 'plain' })])).toEqual({ moves: [], relocated: [] });
  });
});
