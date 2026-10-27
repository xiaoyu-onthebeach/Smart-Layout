import { describe, expect, it } from 'vitest';
import { clamp, hexToHsv, hexToRgb, hsvToHex, isValidHex, rgbToHex } from './color';
import { isGradient, parseGradient, serializeGradient } from './gradient';

describe('color conversions', () => {
  it('reads 6- and 3-digit hex, with or without #', () => {
    expect(hexToRgb('#4570FF')).toEqual([69, 112, 255]);
    expect(hexToRgb('fff')).toEqual([255, 255, 255]);
  });

  it('falls back to black for garbage', () => {
    expect(hexToRgb('zzzzzz')).toEqual([0, 0, 0]);
  });

  it('writes uppercase hex and clamps out-of-range channels', () => {
    expect(rgbToHex(69, 112, 255)).toBe('#4570FF');
    expect(rgbToHex(-10, 300, 127.6)).toBe('#00FF80');
  });

  it.each(['#FD4E62', '#4570FF', '#000000', '#FFFFFF', '#26262C'])('round-trips %s through HSV', (hex) => {
    expect(hsvToHex(...hexToHsv(hex))).toBe(hex);
  });

  it('validates hex input', () => {
    expect(isValidHex('#abc')).toBe(true);
    expect(isValidHex('A1B2C3')).toBe(true);
    expect(isValidHex('#abcd')).toBe(false);
    expect(isValidHex('red')).toBe(false);
  });

  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});

describe('gradients', () => {
  const css = 'linear-gradient(90deg, #FF0000 0%, #0000FF 100%)';

  it('tells a gradient from a solid colour', () => {
    expect(isGradient(css)).toBe(true);
    expect(isGradient('#FF0000')).toBe(false);
    expect(isGradient(undefined)).toBe(false);
  });

  it('parses angle and stops', () => {
    expect(parseGradient(css)).toEqual({ angle: 90, stops: [{ color: '#FF0000', position: 0 }, { color: '#0000FF', position: 100 }] });
  });

  it('serializes stops in position order and round-trips', () => {
    const out = serializeGradient([{ color: '#0000FF', position: 100 }, { color: '#FF0000', position: 0 }], 90);
    expect(out).toBe(css);
    expect(parseGradient(out)).toEqual(parseGradient(css));
  });

  it('rejects malformed stops', () => {
    expect(parseGradient('linear-gradient(90deg, red 0%, blue 100%)')).toBeNull();
  });
});
