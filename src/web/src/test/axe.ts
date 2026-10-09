import axe from 'axe-core';

// Runs axe-core over the page and returns what it found, as readable lines. Colour contrast is
// skipped: jsdom does not compute styles from the stylesheet, so axe cannot measure it. Contrast is
// guaranteed another way, by the token pairs documented and measured in docs/design/README.md.
export async function accessibilityProblems(root: Element = document.body): Promise<string[]> {
  const results = await axe.run(root, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(' | ')})`,
  );
}
