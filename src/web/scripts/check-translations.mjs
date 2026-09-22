// Fails CI when French and English drift apart (NFR-013): a key missing in one language,
// an empty value, or {{placeholders}} that differ between the two.
import { readFileSync } from 'node:fs';

const load = (language) =>
  JSON.parse(readFileSync(new URL(`../src/i18n/locales/${language}.json`, import.meta.url), 'utf8'));

const flatten = (node, prefix = '') =>
  Object.entries(node).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? flatten(value, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value]],
  );

const placeholders = (text) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)]
    .map((match) => match[1])
    .sort()
    .join(',');

const fr = new Map(flatten(load('fr')));
const en = new Map(flatten(load('en')));
const problems = [];

for (const key of fr.keys()) if (!en.has(key)) problems.push(`missing in en: ${key}`);
for (const key of en.keys()) if (!fr.has(key)) problems.push(`missing in fr: ${key}`);
for (const [language, entries] of [
  ['fr', fr],
  ['en', en],
]) {
  for (const [key, value] of entries) {
    if (typeof value !== 'string' || value.trim() === '')
      problems.push(`empty or not text in ${language}: ${key}`);
  }
}
for (const [key, value] of fr) {
  const other = en.get(key);
  if (typeof value === 'string' && typeof other === 'string' && placeholders(value) !== placeholders(other)) {
    problems.push(
      `placeholders differ for ${key}: fr {${placeholders(value)}} vs en {${placeholders(other)}}`,
    );
  }
}

if (problems.length > 0) {
  console.error(`Translation check failed (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Translations OK: ${fr.size} keys in French and English.`);
