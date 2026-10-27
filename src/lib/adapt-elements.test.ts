import { describe, expect, it } from 'vitest';
import { el } from '@/test/factories';
import { adaptElementsToSize } from './adapt-elements';

const from = { width: 600, height: 500 };
const to = { width: 300, height: 1000 }; // half as wide, twice as tall

describe('adaptElementsToSize', () => {
  it('scales position and size along each axis independently', () => {
    const [out] = adaptElementsToSize([el('a', { x: 100, y: 50, w: 200, h: 100 })], from, to);
    expect(out.frame).toEqual({ x: 50, y: 100, w: 100, h: 200 });
  });

  it('keeps element ids, so edits can cascade between sizes', () => {
    expect(adaptElementsToSize([el('keep-me', { x: 0, y: 0, w: 1, h: 1 })], from, to)[0].id).toBe('keep-me');
  });

  it('scales font size and corner radius with the width', () => {
    const [out] = adaptElementsToSize([el('t', { x: 0, y: 0, w: 10, h: 10 }, { kind: 'text', style: { fontSize: 40, radius: 8 } })], from, to);
    expect(out.style).toMatchObject({ fontSize: 20, radius: 4 });
  });

  it('leaves unset font size and radius unset', () => {
    const [out] = adaptElementsToSize([el('s', { x: 0, y: 0, w: 10, h: 10 })], from, to);
    expect(out.style.fontSize).toBeUndefined();
    expect(out.style.radius).toBeUndefined();
  });

  it('scales a text layer’s padding with its font', () => {
    const autoLayout = { padding: { top: 10, right: 20, bottom: 30, left: 40 }, hugWidth: false, hugHeight: true };
    const [out] = adaptElementsToSize([el('t', { x: 0, y: 0, w: 10, h: 10 }, { kind: 'text', style: { autoLayout } })], from, to);
    expect(out.style.autoLayout).toEqual({ padding: { top: 5, right: 10, bottom: 15, left: 20 }, hugWidth: false, hugHeight: true });
  });

  it('scales a group’s box position, gap and padding', () => {
    const groupLayout = { x: 100, y: 100, direction: 'vertical' as const, gap: 12, padding: { top: 8, right: 8, bottom: 8, left: 8 } };
    const [out] = adaptElementsToSize([el('g', { x: 0, y: 0, w: 10, h: 10 }, { groupId: 'g', groupLayout })], from, to);
    expect(out.groupLayout).toEqual({ x: 50, y: 200, direction: 'vertical', gap: 6, padding: { top: 4, right: 4, bottom: 4, left: 4 } });
  });

  it('does not change the input elements', () => {
    const input = [el('a', { x: 100, y: 50, w: 200, h: 100 })];
    adaptElementsToSize(input, from, to);
    expect(input[0].frame).toEqual({ x: 100, y: 50, w: 200, h: 100 });
  });
});
