import { z } from 'zod';
import {
  defaultContrast,
  defaultPresetID,
  findPreset,
  projectIconSeeds,
  type Seed,
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
  const tokens = deriveTokens(variant, preference[variant]);
  const root = document.documentElement;
  root.dataset.theme = variant;
  root.style.colorScheme = variant;
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(`--${name}`, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.surface);
}

type RGB = readonly [number, number, number];
const black: RGB = [0, 0, 0];
const white: RGB = [255, 255, 255];

// Adapted from the Codex desktop app: surfaces, text, and borders are derived from three seeds
// plus a contrast value, so every theme keeps the same visual hierarchy.
export function deriveTokens(variant: Variant, preference: VariantPreference) {
  const seed = resolveSeed(variant, preference);
  const preset = findPreset(variant, preference.preset);
  const surface = rgb(seed.surface);
  const ink = rgb(seed.ink);
  const accent = rgb(seed.accent);
  const light = variant === 'light';
  const c = normalizeContrast(seed.contrast, defaultContrast[variant]);
  const offset = seed.contrast - defaultContrast[variant];
  const under = light
    ? mix(surface, ink, 0.04 + offset * 0.0012)
    : mix(surface, black, 0.16 + offset * 0.0015);
  const backgrounds = [surface, under];
  const text = (color: RGB) => readable(color, backgrounds, ink);
  const error = rgb(preset.error ?? (light ? '#ba2623' : '#ff6764'));
  const success = rgb(preset.success ?? (light ? '#00a240' : '#40c977'));

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
    'text-secondary': css(text(mix(surface, ink, (light ? 0.74 : 0.65) + c * 0.1))),
    'text-tertiary': css(text(mix(surface, ink, (light ? 0.45 : 0.42) + c * 0.12))),
    border: alpha(ink, 0.06 + c * 0.04),
    'border-heavy': alpha(ink, (light ? 0.09 : 0.12) + c * 0.06),
    hover: alpha(ink, (light ? 0.04 : 0.05) + c * 0.03),
    selected: alpha(ink, (light ? 0.06 : 0.07) + c * 0.05),
    secondary: alpha(ink, 0.04 + c * 0.02),
    'secondary-hover': alpha(ink, 0.07 + c * 0.04),
    primary: css(ink),
    'primary-hover': css(mix(ink, surface, 0.14)),
    'on-primary': css(surface),
    accent: css(accent),
    'accent-soft': css(mix(surface, accent, (light ? 0.11 : 0.18) + c * 0.05)),
    'accent-text': css(text(accent)),
    'on-accent': css(luminance(accent) > 0.179 ? black : white),
    error: css(text(error)),
    success: css(success),
    scrim: alpha(black, light ? 0.18 : 0.5),
    shadow: light
      ? '0 12px 32px rgb(0 0 0 / 0.1), 0 2px 6px rgb(0 0 0 / 0.05)'
      : '0 12px 32px rgb(0 0 0 / 0.45), 0 2px 6px rgb(0 0 0 / 0.25)',
  };
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

function alpha(color: RGB, amount: number) {
  return `rgb(${color.join(' ')} / ${Math.min(1, Math.max(0, amount)).toFixed(3)})`;
}
