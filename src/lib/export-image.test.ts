import { describe, expect, it } from 'vitest';
import { el, layout } from '@/test/factories';
import { buildSvgMarkup } from './export-image';

const text = (id: string, content: string, style = {}, frame = { x: 100, y: 50, w: 200, h: 40 }) => el(id, frame, { kind: 'text', content, style: { fontSize: 20, ...style } });

describe('buildSvgMarkup (PNG/JPG export)', () => {
  it('is sized to the banner', () => {
    expect(buildSvgMarkup(layout([], { width: 300, height: 250 }))).toContain('viewBox="0 0 300 250"');
  });

  it('paints the banner background', () => {
    expect(buildSvgMarkup({ ...layout([]), backgroundColor: '#4570FF' })).toContain('fill="#4570FF"');
  });

  it('leaves out template placeholders that were never filled in', () => {
    const svg = buildSvgMarkup(layout([text('h', 'Add headline'), text('t', 'Summer sale')]));
    expect(svg).not.toContain('Add headline');
    expect(svg).toContain('Summer sale');
  });

  it('escapes text so it can’t break the markup', () => {
    expect(buildSvgMarkup(layout([text('t', 'Fish & <Chips>')]))).toContain('Fish &amp; &lt;Chips&gt;');
  });

  it('draws a rectangle shape with its corner radius', () => {
    const svg = buildSvgMarkup(layout([el('r', { x: 10, y: 20, w: 30, h: 40 }, { kind: 'shape', shape: 'rect', style: { fill: '#FF0000', radius: 6 } })]));
    expect(svg).toContain('<rect x="10" y="20" width="30" height="40" rx="6" fill="#FF0000"');
  });

  it('places text inside its padding', () => {
    const autoLayout = { padding: { top: 8, right: 0, bottom: 0, left: 12 }, hugWidth: true, hugHeight: true };
    const svg = buildSvgMarkup(layout([text('t', 'Hi', { align: 'left', autoLayout, lineHeight: 1 })]));
    // left edge 100 + 12 padding; first line centred on 50 + 8 padding + half a 20px line
    expect(svg).toContain('<tspan x="112" y="68">Hi</tspan>');
  });

  it('draws a text background behind the text', () => {
    const svg = buildSvgMarkup(layout([text('t', 'CTA', { fill: '#FFE14D', radius: 8 })]));
    expect(svg.indexOf('fill="#FFE14D"')).toBeGreaterThan(-1);
    expect(svg.indexOf('fill="#FFE14D"')).toBeLessThan(svg.indexOf('<text'));
  });
});
