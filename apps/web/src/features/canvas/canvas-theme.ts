import type { CanvasTheme } from '@opencodex/contracts/canvas';

/** Semantic tokens a canvas can use; its own palette aliases are derived from these. */
const TOKENS = [
  '--project-gray',
  '--project-blue',
  '--project-green',
  '--project-orange',
  '--project-pink',
  '--project-purple',
  '--on-project',
  '--surface',
  '--elevated',
  '--control',
  '--text',
  '--text-secondary',
  '--text-tertiary',
  '--border',
  '--border-heavy',
  '--hover',
  '--secondary',
  '--primary',
  '--on-primary',
  '--accent',
  '--error',
  '--success',
  '--warning',
  '--shadow',
  '--code-bg',
  '--chip',
  '--chip-border',
  '--chip-shadow',
  '--well',
  '--well-shadow',
  '--primary-glaze',
  '--primary-shadow',
  '--font-sans',
  '--font-mono',
];

/** The theme tokens in effect where the canvas is shown. */
export function readCanvasTheme(element: Element): CanvasTheme {
  const style = getComputedStyle(element);
  const vars: Record<string, string> = {};
  for (const name of TOKENS) {
    const value = style.getPropertyValue(name).trim();
    if (value) vars[name] = value;
  }
  return { scheme: style.colorScheme.includes('light') ? 'light' : 'dark', vars };
}
