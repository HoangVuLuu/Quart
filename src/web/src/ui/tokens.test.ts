import { describe, expect, it } from 'vitest';

// AD-048 and NFR-017: the look lives in the token file, so a component that names a colour, a radius
// or a shadow of its own would drift away from the design the first time a token changes.
const files = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts', '!./*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const sources = Object.entries(files).map(([name, text]) => ({ name, text }));

const forbidden: [string, RegExp][] = [
  ['a hex colour', /#[0-9a-fA-F]{3,8}\b/],
  ['an rgb/hsl/oklch colour', /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/],
  [
    'a CSS colour keyword',
    /\b(?:bg|text|border|outline|ring|fill|stroke|from|to|via|shadow|decoration|divide|caret|accent)-(?:white|black|transparent-)\b/,
  ],
  [
    'a Tailwind palette colour',
    /\b(?:bg|text|border|outline|ring|fill|stroke|from|to|via|shadow|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
  ],
  [
    'an arbitrary colour value',
    /\b(?:bg|text|border|outline|ring|fill|stroke|shadow)-\[(?:#|rgb|hsl|oklch|color:)/,
  ],
  ['a default Tailwind radius', /\brounded(?:-[trbl]{1,2})?-(?:xs|sm|md|lg|xl|2xl|3xl|4xl)\b/],
  ['an arbitrary radius', /\brounded(?:-[trbl]{1,2})?-\[/],
  ['a default Tailwind shadow', /\bshadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner)\b/],
  ['an arbitrary shadow', /\bshadow-\[/],
  ['an inline style', /\bstyle=\{\{/],
];

describe('src/ui', () => {
  it('has components to check', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  it.each(forbidden)('contains no %s', (_what, pattern) => {
    const offenders = sources.filter(({ text }) => pattern.test(text)).map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});
