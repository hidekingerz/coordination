import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FigurePart } from '../lib/figure';
import { OutfitFigure } from './OutfitFigure';

function render(parts: FigurePart[]) {
  return renderToStaticMarkup(createElement(OutfitFigure, { parts }));
}

const base = { variant: 'regular' as const, itemId: 'x', name: 'x' };

describe('OutfitFigure', () => {
  it('renders an svg with a title for every part', () => {
    const html = render([
      { ...base, kind: 'shoes', color: '#111111', itemId: 's', name: '黒スニーカー' },
      { ...base, kind: 'bottoms', color: '#222222', itemId: 'b', name: 'デニム' },
      { ...base, kind: 'tops', variant: 'long', color: '#333333', itemId: 't', name: 'ニット' },
    ]);
    expect(html.startsWith('<svg')).toBe(true);
    expect(html).toContain('<title>黒スニーカー</title>');
    expect(html).toContain('<title>デニム</title>');
    expect(html).toContain('<title>ニット</title>');
  });

  it('fills each part with the item colour and paints the accent when given', () => {
    const html = render([{ ...base, kind: 'tops', variant: 'short', color: '#abcdef', accent: '#fedcba' }]);
    expect(html).toContain('fill="#abcdef"');
    expect(html).toContain('fill="#fedcba"');
  });

  it('marks each part with its kind and variant for styling and inspection', () => {
    const html = render([
      { ...base, kind: 'outer', variant: 'long', color: '#000000' },
      { ...base, kind: 'onepiece', color: '#000000' },
    ]);
    expect(html).toContain('data-part="outer:long"');
    expect(html).toContain('data-part="onepiece:regular"');
  });

  it('renders only the body when there are no parts', () => {
    const html = render([]);
    expect(html.startsWith('<svg')).toBe(true);
    expect(html).not.toContain('data-part=');
  });
});

describe('OutfitFigure bottoms variants', () => {
  it('renders distinct shapes for pants, shorts and skirt', () => {
    const pants = render([{ ...base, kind: 'bottoms', variant: 'regular', color: '#111111' }]);
    const shorts = render([{ ...base, kind: 'bottoms', variant: 'short', color: '#111111' }]);
    const skirt = render([{ ...base, kind: 'bottoms', variant: 'skirt', color: '#111111' }]);
    expect(pants).toContain('data-part="bottoms:regular"');
    expect(shorts).toContain('data-part="bottoms:short"');
    expect(skirt).toContain('data-part="bottoms:skirt"');
    // data-part 以外の描画内容 (パスや矩形) が実際に異なること
    const shapeOnly = (html: string) => html.replace(/data-part="[^"]*"/g, '');
    expect(new Set([pants, shorts, skirt].map(shapeOnly)).size).toBe(3);
  });
});

describe('OutfitFigure sleeve variants', () => {
  it('renders distinct shapes for short, long and sleeveless tops', () => {
    const shapeOnly = (html: string) => html.replace(/data-part="[^"]*"/g, '');
    const short = render([{ ...base, kind: 'tops', variant: 'short', color: '#111111' }]);
    const long = render([{ ...base, kind: 'tops', variant: 'long', color: '#111111' }]);
    const none = render([{ ...base, kind: 'tops', variant: 'sleeveless', color: '#111111' }]);
    expect(new Set([short, long, none].map(shapeOnly)).size).toBe(3);
    expect(none).toContain('data-part="tops:sleeveless"');
  });

  it('renders long-sleeved onepiece differently from the short-sleeved one', () => {
    const shapeOnly = (html: string) => html.replace(/data-part="[^"]*"/g, '');
    const short = render([{ ...base, kind: 'onepiece', variant: 'short', color: '#111111' }]);
    const long = render([{ ...base, kind: 'onepiece', variant: 'long', color: '#111111' }]);
    expect(shapeOnly(short)).not.toBe(shapeOnly(long));
  });
});
