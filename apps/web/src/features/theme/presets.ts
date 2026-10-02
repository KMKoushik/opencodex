export type Variant = 'light' | 'dark';

export type Seed = { surface: string; ink: string; accent: string; contrast: number };

/** Colors a palette publishes beyond its three seeds. Anything not listed is derived. */
export type Tones = {
  error?: string;
  success?: string;
  /** Modified files and cautions such as full access. */
  warning?: string;
  /** Link text; defaults to the accent. */
  link?: string;
  /** Secondary panes such as the sidebar; derived from the surface when omitted. */
  under?: string;
};

/** The review panel's own palette: prose stays on paper, code sits on ink. Always dark. */
export type PanelPalette = Tones & { seed: Omit<Seed, 'contrast'> };

export type Preset = Tones & {
  id: string;
  name: string;
  seed: Seed;
  /** Primary actions are glazed in the foreground ink (default) or the accent. */
  primary?: 'ink' | 'accent';
  /** A dark review panel beside the conversation. When omitted the panel follows the theme. */
  panel?: PanelPalette;
  /** Shiki theme for code; `ink` derives a monochrome theme from the panel. */
  syntax?: string;
  /** Which coat the calico wears in this theme. */
  art?: 'calico' | 'catppuccin';
};

export const defaultContrast = { light: 45, dark: 60 } satisfies Record<Variant, number>;

export const projectIconSeeds = {
  gray: '#676767',
  blue: '#397be5',
  green: '#32815d',
  orange: '#cf713c',
  pink: '#c74795',
  purple: '#7250d8',
} as const;

function preset(
  id: string,
  name: string,
  variant: Variant,
  [surface, ink, accent]: [string, string, string],
  extra: Omit<Preset, 'id' | 'name' | 'seed'> = {},
): Preset {
  return {
    id,
    name,
    seed: { surface, ink, accent, contrast: defaultContrast[variant] },
    ...extra,
  };
}

// The calico's ink half: one review panel shared by both OpenCodex themes.
const calicoInk: PanelPalette = {
  seed: { surface: '#111113', ink: '#f5f5f7', accent: '#f5f5f7' },
  error: '#ff8f86',
  success: '#7fdb97',
  warning: '#e2b85a',
};

// Catppuccin's published palette (catppuccin.com/palette), the swatches this app uses.
const catppuccin = {
  latte: {
    base: '#eff1f5',
    mantle: '#e6e9ef',
    crust: '#dce0e8',
    text: '#4c4f69',
    mauve: '#8839ef',
    red: '#d20f39',
    green: '#40a02b',
    peach: '#fe640b',
    yellow: '#df8e1d',
    blue: '#1e66f5',
  },
  frappe: {
    base: '#303446',
    mantle: '#292c3c',
    crust: '#232634',
    text: '#c6d0f5',
    mauve: '#ca9ee6',
    red: '#e78284',
    green: '#a6d189',
    peach: '#ef9f76',
    yellow: '#e5c890',
    blue: '#8caaee',
  },
  macchiato: {
    base: '#24273a',
    mantle: '#1e2030',
    crust: '#181926',
    text: '#cad3f5',
    mauve: '#c6a0f6',
    red: '#ed8796',
    green: '#a6da95',
    peach: '#f5a97f',
    yellow: '#eed49f',
    blue: '#8aadf4',
  },
  mocha: {
    base: '#1e1e2e',
    mantle: '#181825',
    crust: '#11111b',
    text: '#cdd6f4',
    mauve: '#cba6f7',
    red: '#f38ba8',
    green: '#a6e3a1',
    peach: '#fab387',
    yellow: '#f9e2af',
    blue: '#89b4fa',
  },
};

// One accent (mauve) for primary actions, Base for content, Mantle for sidebars and file trees.
// Latte borrows Mocha's panel, keeping code on ink in the light flavor too.
function catppuccinPreset(flavor: keyof typeof catppuccin, name: string, variant: Variant) {
  const c = catppuccin[flavor];
  const ink = variant === 'light' ? catppuccin.mocha : c;
  return preset(`catppuccin-${flavor}`, name, variant, [c.base, c.text, c.mauve], {
    under: c.mantle,
    error: c.red,
    success: c.green,
    warning: c.peach,
    link: c.blue,
    primary: 'accent',
    panel: {
      seed: { surface: ink.base, ink: ink.text, accent: ink.mauve },
      under: ink.mantle,
      error: ink.red,
      success: ink.green,
      warning: ink.yellow,
      link: ink.blue,
    },
    syntax: `catppuccin-${variant === 'light' ? 'mocha' : flavor}`,
    art: 'catppuccin',
  });
}

// Seed colors come from each theme's published palette. Every other color is derived.
export const presets: Record<Variant, Preset[]> = {
  light: [
    preset('opencodex-light', 'OpenCodex', 'light', ['#f9f9f8', '#18181a', '#18181a'], {
      under: '#f1f1ef',
      error: '#c0392b',
      success: '#1e7a3a',
      warning: '#9a5b00',
      panel: calicoInk,
      syntax: 'ink',
      art: 'calico',
    }),
    catppuccinPreset('latte', 'Catppuccin Latte', 'light'),
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
    preset('opencodex-dark', 'OpenCodex', 'dark', ['#1a1a1d', '#ededf0', '#ededf0'], {
      under: '#141416',
      error: '#ff7b72',
      success: '#5fd47f',
      warning: '#e2b85a',
      panel: calicoInk,
      syntax: 'ink',
      art: 'calico',
    }),
    catppuccinPreset('mocha', 'Catppuccin Mocha', 'dark'),
    catppuccinPreset('macchiato', 'Catppuccin Macchiato', 'dark'),
    catppuccinPreset('frappe', 'Catppuccin Frappé', 'dark'),
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
