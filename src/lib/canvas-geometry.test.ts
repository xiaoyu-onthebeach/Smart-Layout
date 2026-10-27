import { describe, expect, it } from 'vitest';
import { boxContainsPoint, boxFromFrame, rotatedBoundingBox, roundForDisplay, unionBoxes } from './measure';
import { computeSnap } from './snap-guides';

describe('computeSnap', () => {
  it('snaps a layer near the banner’s centre onto it, with a solid guide', () => {
    const { frame, guides } = computeSnap({ x: 248, y: 0, w: 100, h: 10 }, 600, 500, []);
    expect(frame.x).toBe(250);
    expect(guides).toContainEqual({ axis: 'x', position: 300, start: 0, end: 500, style: 'solid' });
  });

  it('snaps to another layer’s edge, with a dotted guide', () => {
    const { frame, guides } = computeSnap({ x: 102, y: 200, w: 50, h: 50 }, 600, 500, [{ x: 100, y: 0, w: 50, h: 50 }]);
    expect(frame.x).toBe(100);
    expect(guides).toContainEqual(expect.objectContaining({ axis: 'x', position: 100, style: 'dotted' }));
  });

  it('leaves a layer alone when nothing is close', () => {
    const input = { x: 10, y: 10, w: 20, h: 20 };
    expect(computeSnap(input, 600, 500, [{ x: 400, y: 400, w: 20, h: 20 }])).toEqual({ frame: input, guides: [] });
  });
});

describe('measure geometry', () => {
  it('converts a frame to a box', () => {
    expect(boxFromFrame({ x: 1, y: 2, w: 3, h: 4 })).toEqual({ left: 1, top: 2, right: 4, bottom: 6, width: 3, height: 4 });
  });

  it('swaps width and height for a quarter turn, around the centre', () => {
    const box = rotatedBoundingBox({ x: 0, y: 0, w: 100, h: 20 }, 90);
    expect(box.width).toBeCloseTo(20);
    expect(box.height).toBeCloseTo(100);
    expect(box.left).toBeCloseTo(40);
    expect(box.top).toBeCloseTo(-40);
  });

  it('unions boxes and hit-tests points', () => {
    const box = unionBoxes([boxFromFrame({ x: 0, y: 0, w: 10, h: 10 }), boxFromFrame({ x: 20, y: 5, w: 10, h: 10 })]);
    expect(box).toEqual({ left: 0, top: 0, right: 30, bottom: 15, width: 30, height: 15 });
    expect(boxContainsPoint(box, 30, 15)).toBe(true);
    expect(boxContainsPoint(box, 31, 0)).toBe(false);
  });

  it('never shows a "-0" distance', () => {
    expect(Object.is(roundForDisplay(-0.3), 0)).toBe(true);
    expect(roundForDisplay(4.6)).toBe(5);
  });
});
