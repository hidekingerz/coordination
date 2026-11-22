import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FigurePart } from '../lib/figure';
import { OutfitFigure } from './OutfitFigure';

function render(parts: FigurePart[]) {
  return renderToStaticMarkup(createElement(OutfitFigure, { parts }));
}

const base = { variant: 'regular' as const, itemId: 'x', name: 'x' };

/** 描かれた色 (fill 属性でも style の fill でも拾う) */
const painted = (html: string) => new Set([...html.matchAll(/fill(?:="|:\s*)(#[0-9a-fA-F]{3,6})/g)].map((m) => m[1].toLowerCase()));
/** 形だけを比べるため、色と注記 (title) を除く */
const shapeOnly = (html: string) => html.replace(/<title>[^<]*<\/title>/g, '');

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
    expect(painted(html)).toContain('#abcdef');
    expect(painted(html)).toContain('#fedcba');
  });

  it('draws a long coat longer than a regular one', () => {
    const long = render([{ ...base, kind: 'outer', variant: 'long', color: '#000000' }]);
    const regular = render([{ ...base, kind: 'outer', variant: 'regular', color: '#000000' }]);
    expect(shapeOnly(long)).not.toBe(shapeOnly(regular));
  });

  it('renders only the body when there are no parts', () => {
    const html = render([]);
    expect(html.startsWith('<svg')).toBe(true);
    expect(html).not.toContain('<title>'); // 服ごとの注記が無い = 服を描いていない
    expect(painted(html).size).toBe(0);
  });
});

describe('OutfitFigure bottoms variants', () => {
  it('renders distinct shapes for pants, shorts and skirt', () => {
    const pants = render([{ ...base, kind: 'bottoms', variant: 'regular', color: '#111111' }]);
    const shorts = render([{ ...base, kind: 'bottoms', variant: 'short', color: '#111111' }]);
    const skirt = render([{ ...base, kind: 'bottoms', variant: 'skirt', color: '#111111' }]);
    expect(new Set([pants, shorts, skirt].map(shapeOnly)).size).toBe(3);
  });
});

describe('OutfitFigure sleeve variants', () => {
  it('renders distinct shapes for short, long and sleeveless tops', () => {
    const short = render([{ ...base, kind: 'tops', variant: 'short', color: '#111111' }]);
    const long = render([{ ...base, kind: 'tops', variant: 'long', color: '#111111' }]);
    const none = render([{ ...base, kind: 'tops', variant: 'sleeveless', color: '#111111' }]);
    expect(new Set([short, long, none].map(shapeOnly)).size).toBe(3);
  });

  it('renders long-sleeved onepiece differently from the short-sleeved one', () => {
    const short = render([{ ...base, kind: 'onepiece', variant: 'short', color: '#111111' }]);
    const long = render([{ ...base, kind: 'onepiece', variant: 'long', color: '#111111' }]);
    expect(shapeOnly(short)).not.toBe(shapeOnly(long));
  });
});

describe('OutfitFigure accessory kinds', () => {
  it('renders a distinct shape for each accessory kind', () => {
    const kinds = ['neck', 'belt', 'hat', 'bag', 'necklace'] as const;
    const htmls = kinds.map((k) => render([{ ...base, kind: 'accessory', variant: k, color: '#111111' }]));
    expect(new Set(htmls.map(shapeOnly)).size).toBe(kinds.length);
  });
});

describe('OutfitFigure: accent of a mid layer', () => {
  it('paints the sub colour of a jacket worn on its own', () => {
    const html = render([{ ...base, kind: 'outer', color: '#111111', accent: '#ff00aa', layer: 'mid' }]);
    expect(painted(html)).toContain('#ff00aa');
  });
  it('paints the sub colour of a jacket worn under a coat', () => {
    const html = render([
      { ...base, kind: 'outer', color: '#111111', accent: '#ff00aa', layer: 'mid', itemId: 'j' },
      { ...base, kind: 'outer', color: '#222222', layer: 'shell', itemId: 'c' },
    ]);
    expect(painted(html)).toContain('#ff00aa');
  });
});
