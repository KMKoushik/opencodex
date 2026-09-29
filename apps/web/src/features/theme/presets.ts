export type Variant = 'light' | 'dark';

export type Seed = { surface: string; ink: string; accent: string; contrast: number };

export type Preset = {
  id: string;
  name: string;
  seed: Seed;
  error?: string;
  success?: string;
};

export const defaultContrast = { light: 45, dark: 60 } satisfies Record<Variant, number>;

function preset(
  id: string,
  name: string,
  variant: Variant,
  [surface, ink, accent]: [string, string, string],
  status: { error?: string; success?: string } = {},
): Preset {
  return {
    id,
    name,
    seed: { surface, ink, accent, contrast: defaultContrast[variant] },
    ...status,
  };
}

// Seed colors come from each theme's published palette. Every other color is derived.
export const presets: Record<Variant, Preset[]> = {
  light: [
    preset('opencodex-light', 'OpenCodex', 'light', ['#ffffff', '#1a1c1f', '#0169cc']),
    preset('catppuccin-latte', 'Catppuccin Latte', 'light', ['#eff1f5', '#4c4f69', '#8839ef'], {
      error: '#d20f39',
      success: '#40a02b',
    }),
    preset('github-light', 'GitHub Light', 'light', ['#ffffff', '#1f2328', '#0969da'], {
      error: '#d1242f',
      success: '#1a7f37',
    }),
    preset('everforest-light', 'Everforest Light', 'light', ['#fdf6e3', '#5c6a72', '#8da101'], {
      error: '#f85552',
      success: '#8da101',
    }),
    preset('gruvbox-light', 'Gruvbox Light', 'light', ['#fbf1c7', '#3c3836', '#076678'], {
      error: '#9d0006',
      success: '#79740e',
    }),
    preset('nord-light', 'Nord Light', 'light', ['#eceff4', '#2e3440', '#5e81ac'], {
      error: '#bf616a',
      success: '#a3be8c',
    }),
    preset('one-light', 'One Light', 'light', ['#fafafa', '#383a42', '#4078f2'], {
      error: '#e45649',
      success: '#50a14f',
    }),
    preset('rose-pine-dawn', 'Rosé Pine Dawn', 'light', ['#faf4ed', '#575279', '#907aa9'], {
      error: '#b4637a',
      success: '#286983',
    }),
    preset('solarized-light', 'Solarized Light', 'light', ['#fdf6e3', '#586e75', '#268bd2'], {
      error: '#dc322f',
      success: '#859900',
    }),
    preset('tokyo-night-day', 'Tokyo Night Day', 'light', ['#e1e2e7', '#3760bf', '#2e7de9'], {
      error: '#f52a65',
      success: '#587539',
    }),
  ],
  dark: [
    preset('opencodex-dark', 'OpenCodex', 'dark', ['#181818', '#ffffff', '#339cff']),
    preset('catppuccin-mocha', 'Catppuccin Mocha', 'dark', ['#1e1e2e', '#cdd6f4', '#cba6f7'], {
      error: '#f38ba8',
      success: '#a6e3a1',
    }),
    preset(
      'catppuccin-macchiato',
      'Catppuccin Macchiato',
      'dark',
      ['#24273a', '#cad3f5', '#c6a0f6'],
      { error: '#ed8796', success: '#a6da95' },
    ),
    preset('catppuccin-frappe', 'Catppuccin Frappé', 'dark', ['#303446', '#c6d0f5', '#ca9ee6'], {
      error: '#e78284',
      success: '#a6d189',
    }),
    preset('dracula', 'Dracula', 'dark', ['#282a36', '#f8f8f2', '#bd93f9'], {
      error: '#ff5555',
      success: '#50fa7b',
    }),
    preset('everforest-dark', 'Everforest Dark', 'dark', ['#2d353b', '#d3c6aa', '#a7c080'], {
      error: '#e67e80',
      success: '#a7c080',
    }),
    preset('github-dark', 'GitHub Dark', 'dark', ['#0d1117', '#e6edf3', '#4493f8'], {
      error: '#f85149',
      success: '#3fb950',
    }),
    preset('gruvbox-dark', 'Gruvbox Dark', 'dark', ['#282828', '#ebdbb2', '#fabd2f'], {
      error: '#fb4934',
      success: '#b8bb26',
    }),
    preset('nord', 'Nord', 'dark', ['#2e3440', '#eceff4', '#88c0d0'], {
      error: '#bf616a',
      success: '#a3be8c',
    }),
    preset('one-dark', 'One Dark', 'dark', ['#282c34', '#abb2bf', '#61afef'], {
      error: '#e06c75',
      success: '#98c379',
    }),
    preset('rose-pine', 'Rosé Pine', 'dark', ['#191724', '#e0def4', '#c4a7e7'], {
      error: '#eb6f92',
      success: '#9ccfd8',
    }),
    preset('solarized-dark', 'Solarized Dark', 'dark', ['#002b36', '#93a1a1', '#268bd2'], {
      error: '#dc322f',
      success: '#859900',
    }),
    preset('tokyo-night', 'Tokyo Night', 'dark', ['#1a1b26', '#c0caf5', '#7aa2f7'], {
      error: '#f7768e',
      success: '#9ece6a',
    }),
  ],
};

export const defaultPresetID = {
  light: 'opencodex-light',
  dark: 'opencodex-dark',
} satisfies Record<Variant, string>;

export function findPreset(variant: Variant, id: string) {
  return presets[variant].find((preset) => preset.id === id) ?? presets[variant][0]!;
}
