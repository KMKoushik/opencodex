import { registerCustomTheme, type ThemeRegistration } from '@pierre/diffs';
import type { Syntax } from '../theme/theme';

const registered = new Set<string>();

/** Pierre theme names for the review panel's code; derived ink themes register on first use. */
export function diffThemes(syntax: Syntax) {
  const theme = syntax.theme;
  if (theme && !registered.has(syntax.name)) {
    registered.add(syntax.name);
    registerCustomTheme(syntax.name, async () => theme as ThemeRegistration);
  }
  return { dark: syntax.name, light: syntax.name };
}
