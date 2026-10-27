import { describe, expect, it } from 'vitest';
import { applyMatrix, ellipseToJoints, parsePathDToJoints, parsePointsAttr, parseTransformAttr } from './svg-geometry';
import { sanitizeSvg } from './svg-import';

describe('sanitizeSvg (imported SVGs are untrusted)', () => {
  it('removes scripts', () => {
    expect(sanitizeSvg('<svg><script>alert(1)</script><rect/></svg>')).toBe('<svg><rect/></svg>');
  });

  it('removes event handler attributes', () => {
    const out = sanitizeSvg(`<svg><rect onclick="alert(1)" onload='x()' width="4"/></svg>`);
    expect(out).not.toMatch(/onclick|onload/);
    expect(out).toContain('width="4"');
  });

  it('removes embedded HTML', () => {
    expect(sanitizeSvg('<svg><foreignObject><div>hi</div></foreignObject></svg>')).toBe('<svg></svg>');
  });

  it('blanks external links but keeps inline data images', () => {
    const out = sanitizeSvg('<svg><image href="https://evil.example/x.png"/><image href="data:image/png;base64,AAA"/></svg>');
    expect(out).not.toContain('evil.example');
    expect(out).toContain('data:image/png;base64,AAA');
  });
});

describe('parsePathDToJoints', () => {
  it('reads straight lines into corner joints', () => {
    const [contour] = parsePathDToJoints('M0 0 L10 0 L10 10');
    expect(contour.closed).toBe(false);
    expect(contour.joints.map((j) => [j.x, j.y])).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(contour.joints.every((j) => !j.handleIn && !j.handleOut)).toBe(true);
  });

  it('marks a Z path as closed', () => {
    expect(parsePathDToJoints('M0 0 L10 0 L10 10 Z')[0].closed).toBe(true);
  });

  it('resolves relative commands', () => {
    const [contour] = parsePathDToJoints('m5 5 l10 0 l0 10');
    expect(contour.joints.map((j) => [j.x, j.y])).toEqual([[5, 5], [15, 5], [15, 15]]);
  });

  it('turns curve control points into joint handles', () => {
    const [contour] = parsePathDToJoints('M0 0 C0 10 10 10 10 0');
    expect(contour.joints[0].handleOut).toEqual({ x: 0, y: 10 });
    expect(contour.joints[1].handleIn).toEqual({ x: 10, y: 10 });
  });

  it('splits a path with several M commands into separate contours', () => {
    expect(parsePathDToJoints('M0 0 L10 0 M20 20 L30 30')).toHaveLength(2);
  });
});

describe('transforms and shapes', () => {
  it('applies translate and scale', () => {
    expect(applyMatrix(parseTransformAttr('translate(10 20)'), { x: 1, y: 1 })).toEqual({ x: 11, y: 21 });
    expect(applyMatrix(parseTransformAttr('scale(2)'), { x: 3, y: 4 })).toEqual({ x: 6, y: 8 });
  });

  it('treats a missing transform as identity', () => {
    expect(applyMatrix(parseTransformAttr(null), { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });

  it('builds an ellipse from 4 cardinal joints', () => {
    const joints = ellipseToJoints(50, 50, 40, 20);
    expect(joints.map((j) => [j.x, j.y])).toEqual([[90, 50], [50, 70], [10, 50], [50, 30]]);
  });

  it('reads polygon point lists', () => {
    expect(parsePointsAttr('0,0 10,0 10 10')).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  });
});
