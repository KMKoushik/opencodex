import { z } from 'zod';
import {
  defaultContrast,
  defaultPresetID,
  findPreset,
  projectIconSeeds,
  type Seed,
  type Tones,
  type Variant,
} from './presets';

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const variantSchema = z.object({
  preset: z.string().max(64),
  surface: hex.optional(),
  ink: hex.optional(),
  accent: hex.optional(),
  contrast: z.number().int().min(0).max(100).optional(),
});
const preferenceSchema = z.object({
  mode: z.enum(['system', 'light', 'dark']),
  light: variantSchema,
  dark: variantSchema,
});

export type ThemeMode = z.infer<typeof preferenceSchema>['mode'];
export type VariantPreference = z.infer<typeof variantSchema>;
export type ThemePreference = z.infer<typeof preferenceSchema>;

export const defaultPreference: ThemePreference = {
  mode: 'system',
  light: { preset: defaultPresetID.light },
  dark: { preset: defaultPresetID.dark },
};

export function parseThemePreference(value: string | null): ThemePreference {
  // The first release stored only "light" or "dark".
  if (value === 'light' || value === 'dark') return { ...defaultPreference, mode: value };
  try {
    const parsed = preferenceSchema.safeParse(JSON.parse(value ?? 'null'));
    return parsed.success ? parsed.data : defaultPreference;
  } catch {
    return defaultPreference;
  }
}

export function resolveVariant(mode: ThemeMode, systemDark: boolean): Variant {
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
}

export function resolveSeed(variant: Variant, preference: VariantPreference): Seed {
  const { seed } = findPreset(variant, preference.preset);
  return {
    surface: preference.surface ?? seed.surface,
    ink: preference.ink ?? seed.ink,
    accent: preference.accent ?? seed.accent,
    contrast: preference.contrast ?? seed.contrast,
  };
}

export function isCustomized(preference: VariantPreference) {
  return Boolean(
    preference.surface || preference.ink || preference.accent || preference.contrast !== undefined,
  );
}

export function applyTheme(preference: ThemePreference, systemDark: boolean) {
  const variant = resolveVariant(preference.mode, systemDark);
  const theme = deriveTheme(variant, preference[variant]);
  const root = document.documentElement;
  root.dataset.theme = variant;
  root.dataset.panel = theme.panel ? 'ink' : 'surface';
  root.dataset.art = theme.art;
  root.style.colorScheme = variant;
  for (const [name, value] of Object.entries(theme.tokens))
    root.style.setProperty(`--${name}`, value);
  for (const [name, value] of Object.entries(theme.ink))
    root.style.setProperty(`--ink-${name}`, value);
  root.style.setProperty('--ink-scheme', theme.panel ? 'dark' : variant);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.tokens.surface);
}

type RGB = readonly [number, number, number];
const black: RGB = [0, 0, 0];
const white: RGB = [255, 255, 255];

export type Tokens = ReturnType<typeof derive>;

/**
 * Everything the UI needs from one theme: the conversation's tokens, the review panel's
 * tokens (identical unless the preset keeps code on its own ink), syntax, and artwork.
 */
export function deriveTheme(variant: Variant, preference: VariantPreference) {
  const preset = findPreset(variant, preference.preset);
  const tokens = deriveTokens(variant, preference);
  const panel = preset.panel;
  const ink = panel
    ? derive(
        'dark',
        {
          ...panel.seed,
          accent: preference.accent ?? panel.seed.accent,
          contrast: defaultContrast.dark,
        },
        panel,
        preset.primary ?? 'ink',
        preset.syntax === 'ink',
      )
    : tokens;
  const syntax: Syntax =
    preset.syntax === 'ink'
      ? { name: inkSyntaxName(ink), type: 'dark', theme: inkSyntaxTheme(ink) }
      : preset.syntax
        ? { name: preset.syntax, type: panel ? 'dark' : variant }
        : { name: panel ? 'pierre-dark' : `pierre-${variant}`, type: panel ? 'dark' : variant };
  return { tokens, ink, panel: Boolean(panel), syntax, art: preset.art ?? 'calico' };
}

export type Syntax = { name: string; type: Variant; theme?: InkSyntaxTheme };

// Adapted from the Codex desktop app: surfaces, text, and borders are derived from three seeds
// plus a contrast value, so every theme keeps the same visual hierarchy.
export function deriveTokens(variant: Variant, preference: VariantPreference) {
  const preset = findPreset(variant, preference.preset);
  const seed = resolveSeed(variant, preference);
  // A custom background invalidates the palette's published sidebar tone.
  return derive(
    variant,
    seed,
    { ...preset, under: preference.surface ? undefined : preset.under },
    preset.primary ?? 'ink',
  );
}

function derive(
  variant: Variant,
  seed: Seed,
  tones: Tones,
  primarySource: 'ink' | 'accent',
  /** Monochrome code: brightness and weight instead of hue. */
  mono = false,
) {
  const surface = rgb(seed.surface);
  const ink = rgb(seed.ink);
  const accent = rgb(seed.accent);
  const light = variant === 'light';
  const c = normalizeContrast(seed.contrast, defaultContrast[variant]);
  const offset = seed.contrast - defaultContrast[variant];
  const under = tones.under
    ? rgb(tones.under)
    : light
      ? mix(surface, ink, 0.04 + offset * 0.0012)
      : mix(surface, black, 0.16 + offset * 0.0015);
  const backgrounds = [surface, under];
  const text = (color: RGB) => readable(color, backgrounds, ink);
  const error = rgb(tones.error ?? (light ? '#ba2623' : '#ff6764'));
  const success = rgb(tones.success ?? (light ? '#00a240' : '#40c977'));
  const warning = rgb(tones.warning ?? (light ? '#9a5b00' : '#e2b85a'));
  const link = text(rgb(tones.link ?? seed.accent));
  const onAccent = luminance(accent) > 0.179 ? black : white;
  const primary = primarySource === 'accent' ? accent : ink;
  const onPrimary = primarySource === 'accent' ? onAccent : surface;
  // Ceramic: raised things are glazed (a lighter top, a hairline ring, a soft drop);
  // light themes glaze toward white, dark themes toward the ink.
  const lift = (amount: number) =>
    light ? mix(surface, white, amount) : mix(surface, ink, amount);
  const sink = (amount: number) => mix(surface, ink, amount);
  const drop = (amount: number) => alpha(black, amount);
  const edge = light ? css(white) : alpha(ink, 0.07);
  const secondary = text(mix(surface, ink, (light ? 0.74 : 0.65) + c * 0.1));
  const tertiary = text(mix(surface, ink, (light ? 0.45 : 0.42) + c * 0.12));

  return {
    ...Object.fromEntries(
      Object.entries(projectIconSeeds).map(([name, seed]) => [
        `project-${name}`,
        css(mix(rgb(seed), surface, light ? 0 : 0.12)),
      ]),
    ),
    'on-project': css(white),
    surface: css(surface),
    'surface-under': css(under),
    elevated: css(
      light ? mix(surface, white, 0.16 + c * 0.12) : mix(surface, ink, 0.03 + c * 0.03),
    ),
    control: css(light ? mix(surface, white, 0.09 + c * 0.04) : mix(surface, ink, 0.07 + c * 0.05)),
    text: css(ink),
    'text-secondary': css(secondary),
    'text-tertiary': css(tertiary),
    border: alpha(ink, 0.06 + c * 0.04),
    'border-heavy': alpha(ink, (light ? 0.09 : 0.12) + c * 0.06),
    hover: alpha(ink, (light ? 0.04 : 0.05) + c * 0.03),
    selected: alpha(ink, (light ? 0.06 : 0.07) + c * 0.05),
    secondary: alpha(ink, 0.04 + c * 0.02),
    'secondary-hover': alpha(ink, 0.07 + c * 0.04),
    primary: css(primary),
    'primary-hover': css(mix(primary, surface, 0.14)),
    'on-primary': css(onPrimary),
    accent: css(accent),
    'accent-soft': css(mix(surface, accent, (light ? 0.11 : 0.18) + c * 0.05)),
    'accent-text': css(text(accent)),
    'on-accent': css(onAccent),
    error: css(text(error)),
    success: css(text(success)),
    warning: css(text(warning)),
    link: css(link),
    'link-underline': alpha(link, 0.4),
    scrim: alpha(black, light ? 0.18 : 0.5),
    shadow: light
      ? '0 12px 32px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.05)'
      : '0 12px 32px rgb(0 0 0 / 0.45), 0 2px 6px rgb(0 0 0 / 0.25)',
    bubble: css(sink(light ? 0.055 : 0.065)),
    'code-bg': alpha(ink, light ? 0.06 : 0.08),
    'wordmark-muted': css(mix(surface, ink, 0.47)),
    glaze: gradient(lift(light ? 1 : 0.055), light ? sink(0.025) : lift(0.03)),
    'glaze-shadow': `inset 0 1px 0 ${edge}, 0 0 0 1px ${alpha(ink, 0.08)}, 0 1px 3px ${drop(light ? 0.07 : 0.35)}`,
    chip: gradient(lift(light ? 1 : 0.08), light ? sink(0.035) : lift(0.045)),
    'chip-border': alpha(ink, light ? 0.1 : 0.09),
    'chip-shadow': `inset 0 1px 0 ${edge}, 0 1px 1px ${drop(light ? 0.06 : 0.2)}`,
    composer: gradient(lift(light ? 1 : 0.04), light ? sink(0.012) : lift(0.015)),
    'composer-shadow': `inset 0 1px 0 ${edge}, 0 0 0 1px ${alpha(ink, light ? 0.09 : 0.08)}, 0 10px 28px ${drop(light ? 0.07 : 0.35)}, 0 2px 5px ${drop(light ? 0.05 : 0.25)}`,
    well: light ? alpha(ink, 0.05) : css(mix(surface, black, 0.3)),
    'well-shadow': `inset 0 1px 2px ${drop(light ? 0.08 : 0.7)}`,
    ...primaryGlaze(primary, primarySource, light),
    // Code in the editor and diffs shares one scale.
    'syntax-keyword': css(mono ? ink : text(accent)),
    'syntax-keyword-weight': mono ? '600' : '400',
    'syntax-string': css(mono ? mix(surface, ink, 0.68) : text(success)),
    'syntax-comment': css(tertiary),
    'syntax-punctuation': css(mono ? mix(surface, ink, 0.52) : secondary),
  };
}

/** The primary action's glaze. Accent fills stay near-flat: no colored halo. */
function primaryGlaze(color: RGB, source: 'ink' | 'accent', light: boolean) {
  if (source === 'accent')
    return {
      'primary-glaze': gradient(mix(color, white, 0.08), mix(color, black, 0.06)),
      'primary-shadow': `inset 0 1px 0 ${alpha(white, 0.28)}, 0 1px 2px ${alpha(black, light ? 0.28 : 0.6)}`,
      'primary-sheen': gradient(alpha(white, 0.12), alpha(white, 0)),
    };
  if (luminance(color) < 0.5)
    return {
      'primary-glaze': gradient(mix(color, white, 0.14), css(color), mix(color, black, 0.55)),
      'primary-shadow': `inset 0 1px 0 ${alpha(white, 0.2)}, inset 0 -2px 4px ${alpha(black, 0.45)}, 0 1px 2px ${alpha(black, 0.28)}, 0 3px 8px ${alpha(black, 0.12)}`,
      'primary-sheen': gradient(alpha(white, 0.2), alpha(white, 0)),
    };
  return {
    'primary-glaze': gradient(white, mix(color, black, 0.02), mix(color, black, 0.11)),
    'primary-shadow': `inset 0 1px 0 ${css(white)}, inset 0 -2px 3px ${alpha(black, 0.12)}, 0 1px 2px ${alpha(black, 0.5)}, 0 3px 8px ${alpha(black, 0.35)}`,
    'primary-sheen': gradient(alpha(white, 0.65), alpha(white, 0)),
  };
}

export type InkSyntaxTheme = ReturnType<typeof inkSyntaxTheme>;

/**
 * Monochrome syntax for the calico's ink half: brightness and weight instead of hue, so the
 * diff's green and red are the only colors in the panel.
 */
function inkSyntaxTheme(panel: Tokens) {
  const surface = rgb(panel.surface);
  const ink = rgb(panel.text);
  const tone = (amount: number) => css(mix(surface, ink, amount));
  const keyword = panel['syntax-keyword'];
  const rule = (scope: string[], foreground: string, fontStyle?: string) => ({
    scope,
    settings: fontStyle ? { foreground, fontStyle } : { foreground },
  });
  return {
    name: inkSyntaxName(panel),
    type: 'dark' as const,
    colors: { 'editor.background': panel.surface, 'editor.foreground': tone(0.8) },
    tokenColors: [
      rule(['source', 'variable', 'identifier', 'meta.definition.variable'], tone(0.8)),
      rule(
        ['punctuation', 'meta.brace', 'keyword.operator', 'meta.tag.punctuation'],
        panel['syntax-punctuation'],
      ),
      rule(['comment', 'punctuation.definition.comment'], panel['syntax-comment'], 'italic'),
      rule(
        ['string', 'constant.numeric', 'constant.language', 'constant.character'],
        panel['syntax-string'],
      ),
      rule(['entity.name.function', 'support.function', 'meta.function-call'], tone(0.9)),
      rule(
        [
          'entity.name.type',
          'entity.name.class',
          'support.type',
          'support.class',
          'entity.name.tag',
        ],
        tone(0.95),
      ),
      rule(
        ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.control'],
        keyword,
        'bold',
      ),
      rule(
        ['keyword.operator.new', 'keyword.operator.expression', 'keyword.operator.logical'],
        keyword,
        'bold',
      ),
    ],
  };
}

function inkSyntaxName(panel: Tokens) {
  return `opencodex-ink-${panel.surface.slice(1)}${panel.text.slice(1)}`;
}

function normalizeContrast(value: number, standard: number) {
  const base = standard / 100;
  const scaled = value / 100 + ((value - standard) / 60) * 0.7;
  return value <= standard ? scaled : base + (scaled - base) * 2;
}

function readable(color: RGB, backgrounds: RGB[], toward: RGB) {
  let result = color;
  for (let step = 1; step <= 10 && minimumContrast(result, backgrounds) < 4.5; step++) {
    result = mix(color, toward, step / 10);
  }
  return result;
}

function minimumContrast(color: RGB, backgrounds: RGB[]) {
  const foreground = luminance(color);
  return Math.min(
    ...backgrounds.map((background) => {
      const other = luminance(background);
      return (Math.max(foreground, other) + 0.05) / (Math.min(foreground, other) + 0.05);
    }),
  );
}

function luminance(color: RGB) {
  const [r, g, b] = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function rgb(value: string): RGB {
  return [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function mix(from: RGB, to: RGB, amount: number): RGB {
  const t = Math.min(1, Math.max(0, amount));
  return from.map((channel, index) => Math.round(channel + (to[index]! - channel) * t)) as [
    number,
    number,
    number,
  ];
}

function css(color: RGB) {
  return `#${color.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function gradient(...stops: (RGB | string)[]) {
  const colors = stops.map((stop) => (typeof stop === 'string' ? stop : css(stop)));
  const at = (index: number) =>
    stops.length === 3 && index === 1 ? 55 : Math.round((index / (stops.length - 1)) * 100);
  return `linear-gradient(180deg, ${colors.map((color, index) => `${color} ${at(index)}%`).join(', ')})`;
}

function alpha(color: RGB, amount: number) {
  return `rgb(${color.join(' ')} / ${Math.min(1, Math.max(0, amount)).toFixed(3)})`;
}
