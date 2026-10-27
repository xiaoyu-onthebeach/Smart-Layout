import { describe, expect, it } from 'vitest';
import type { Joint, VectorPath } from '@/types';
import { cornerJoints, cubicPointAt, insertJointOnSegment, jointsToPathD, regularPolygonPoints, segmentMidpoint, segments, shapeKindToVectorPath } from './vector-path';

const corner = (x: number, y: number): Joint => ({ x, y, handleIn: null, handleOut: null, mirror: 'sharp' });
const triangle: VectorPath = { joints: [corner(0, 0), corner(10, 0), corner(10, 10)], closed: true };
// One curved segment from (0,0) to (10,0), bulging downwards.
const arc: VectorPath = {
  joints: [
    { x: 0, y: 0, handleIn: null, handleOut: { x: 0, y: 10 }, mirror: 'nomirror' },
    { x: 10, y: 0, handleIn: { x: 10, y: 10 }, handleOut: null, mirror: 'nomirror' },
  ],
  closed: false,
};

describe('jointsToPathD', () => {
  it('draws straight segments as lines and closes the path', () => {
    expect(jointsToPathD(triangle)).toBe('M 0 0 L 10 0 L 10 10 L 0 0 Z');
  });

  it('draws a segment with handles as a cubic curve', () => {
    expect(jointsToPathD(arc)).toBe('M 0 0 C 0 10 10 10 10 0');
  });

  it('draws nothing for fewer than 2 joints', () => {
    expect(jointsToPathD({ joints: [corner(1, 1)], closed: false })).toBe('');
  });
});

describe('segments', () => {
  it('includes the closing segment only for a closed path', () => {
    expect(segments(triangle)).toEqual([{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 }]);
    expect(segments({ ...triangle, closed: false })).toEqual([{ a: 0, b: 1 }, { a: 1, b: 2 }]);
  });
});

describe('cubicPointAt', () => {
  it('starts and ends on the endpoints', () => {
    const [p0, p1, p2, p3] = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }];
    expect(cubicPointAt(p0, p1, p2, p3, 0)).toEqual(p0);
    expect(cubicPointAt(p0, p1, p2, p3, 1)).toEqual(p3);
  });
});

describe('insertJointOnSegment', () => {
  it('adds a plain corner at the middle of a straight segment', () => {
    const { path, insertedIndex } = insertJointOnSegment(triangle, 0);
    expect(insertedIndex).toBe(1);
    expect(path.joints[1]).toEqual(corner(5, 0));
    expect(path.joints).toHaveLength(4);
  });

  it('inserts on the closing segment at the end of the list', () => {
    const { path, insertedIndex } = insertJointOnSegment(triangle, 2);
    expect(insertedIndex).toBe(3);
    expect(path.joints[3]).toEqual(corner(5, 5));
  });

  it('splits a curve on the curve itself without changing its shape', () => {
    const before = segmentMidpoint(arc, 0);
    const { path, insertedIndex } = insertJointOnSegment(arc, 0);
    const added = path.joints[insertedIndex];
    expect(added.x).toBeCloseTo(before.x);
    expect(added.y).toBeCloseTo(before.y);
    expect(added.mirror).toBe('mirror');
    // The two halves still meet at the original endpoints.
    expect(path.joints[0]).toMatchObject({ x: 0, y: 0 });
    expect(path.joints[2]).toMatchObject({ x: 10, y: 0 });
  });

  it('does not change the original path', () => {
    insertJointOnSegment(triangle, 0);
    expect(triangle.joints).toHaveLength(3);
  });
});

describe('shape geometry', () => {
  it('turns a rectangle into a closed path through its 4 corners', () => {
    expect(shapeKindToVectorPath('rect', 40, 20)).toEqual({ joints: cornerJoints([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }]), closed: true });
  });

  it('turns an arrow into an open path', () => {
    expect(shapeKindToVectorPath('arrow', 100, 40).closed).toBe(false);
  });

  it('puts a polygon’s first point at 12 o’clock, inside its box', () => {
    const pts = regularPolygonPoints(4, 100, 100);
    expect(pts).toHaveLength(4);
    expect(pts[0].x).toBeCloseTo(50);
    expect(pts[0].y).toBeCloseTo(0);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.x).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it('never draws fewer than 3 sides', () => {
    expect(regularPolygonPoints(1, 10, 10)).toHaveLength(3);
  });
});
