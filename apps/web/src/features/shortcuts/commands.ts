type Binding = {
  key: string;
  mod?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  presses?: 2;
};
type Command = {
  id: string;
  label: string;
  group: 'App' | 'Chat';
  bindings: readonly Binding[];
  inInput: boolean;
};

// One catalog drives dispatch, tooltips, accessibility hints, and the shortcuts page.
export const commands = [
  {
    id: 'sidebar.toggle',
    label: 'Toggle sidebar',
    group: 'App',
    bindings: [{ key: 'b', mod: true }],
    inInput: true,
  },
  {
    id: 'chat.new',
    label: 'New chat',
    group: 'App',
    bindings: [
      { key: 'n', mod: true },
      { key: 'n', mod: true, alt: true },
    ],
    inInput: true,
  },
  {
    id: 'project.open',
    label: 'Open project',
    group: 'App',
    bindings: [{ key: 'o', mod: true }],
    inInput: true,
  },
  {
    id: 'settings.open',
    label: 'Open settings',
    group: 'App',
    bindings: [{ key: ',', mod: true }],
    inInput: true,
  },
  {
    id: 'shortcuts.open',
    label: 'Keyboard shortcuts',
    group: 'App',
    bindings: [{ key: '/', mod: true }],
    inInput: true,
  },
  {
    id: 'view.dismiss',
    label: 'Close sidebar overlay / leave settings',
    group: 'App',
    bindings: [{ key: 'Escape' }],
    inInput: false,
  },
  {
    id: 'composer.focus',
    label: 'Focus message',
    group: 'Chat',
    bindings: [{ key: 'l', mod: true, shift: true }],
    inInput: true,
  },
  {
    id: 'model.choose',
    label: 'Choose model',
    group: 'Chat',
    bindings: [{ key: 'm', mod: true, shift: true }],
    inInput: true,
  },
  {
    id: 'thinking.choose',
    label: 'Choose thinking level',
    group: 'Chat',
    bindings: [{ key: 'e', mod: true, shift: true }],
    inInput: true,
  },
  {
    id: 'thinking.cycle',
    label: 'Cycle thinking level',
    group: 'Chat',
    bindings: [{ key: 't', ctrl: true }],
    inInput: true,
  },
  {
    id: 'chat.stop',
    label: 'Stop response',
    group: 'Chat',
    bindings: [{ key: 'Escape', presses: 2 }],
    inInput: true,
  },
] as const satisfies readonly Command[];

export type CommandID = (typeof commands)[number]['id'];
export type CommandHandler = () => void | false;
export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export function shortcutLabel(id: CommandID, mac = isMac) {
  return commands
    .find((command) => command.id === id)!
    .bindings.map((binding) => bindingLabel(binding, mac))
    .join(' / ');
}

function bindingLabel(binding: Binding, mac: boolean) {
  if (binding.presses === 2) return 'Esc Esc';
  return [
    binding.mod && (mac ? '⌘' : 'Ctrl'),
    binding.ctrl && (mac ? '⌃' : 'Ctrl'),
    binding.alt && (mac ? '⌥' : 'Alt'),
    binding.shift && (mac ? '⇧' : 'Shift'),
    binding.key === 'Escape' ? 'Esc' : binding.key.toUpperCase(),
  ]
    .filter(Boolean)
    .join(mac ? '' : '+');
}

export function shortcutProps(id: CommandID) {
  const command = commands.find((item) => item.id === id)!;
  return {
    title: `${command.label} (${shortcutLabel(id)})`,
    // ARIA describes chords, not sequences; the tooltip describes double Escape.
    'aria-keyshortcuts':
      command.bindings
        .flatMap((binding: Binding) =>
          binding.presses
            ? []
            : [
                [
                  binding.mod && (isMac ? 'Meta' : 'Control'),
                  binding.ctrl && 'Control',
                  binding.alt && 'Alt',
                  binding.shift && 'Shift',
                  binding.key,
                ]
                  .filter(Boolean)
                  .join('+'),
              ],
        )
        .join(' ') || undefined,
  };
}

type KeyEvent = Pick<
  KeyboardEvent,
  | 'key'
  | 'code'
  | 'metaKey'
  | 'ctrlKey'
  | 'altKey'
  | 'shiftKey'
  | 'isComposing'
  | 'keyCode'
  | 'repeat'
  | 'defaultPrevented'
  | 'getModifierState'
  | 'preventDefault'
>;

export class CommandRegistry {
  private handlers = new Map<CommandID, CommandHandler>();
  private pending?: { id: CommandID; at: number };

  resetSequence() {
    this.pending = undefined;
  }

  register(id: CommandID, handler: CommandHandler) {
    if (this.handlers.has(id)) throw new Error(`Command already registered: ${id}`);
    this.handlers.set(id, handler);
    return () => {
      this.handlers.delete(id);
      if (this.pending?.id === id) this.resetSequence();
    };
  }

  execute(id: CommandID) {
    const handler = this.handlers.get(id);
    return handler ? handler() !== false : false;
  }

  dispatch(
    event: KeyEvent,
    context: { mac: boolean; editable: boolean; blocked: boolean },
    now = performance.now(),
  ) {
    const pending = this.pending;
    this.resetSequence();
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.repeat ||
      context.blocked ||
      event.getModifierState('AltGraph')
    )
      return;
    // Most typing takes this constant-time exit; no React state or catalog work.
    if (!event.metaKey && !event.ctrlKey && event.key !== 'Escape') return;
    for (const command of commands) {
      if (context.editable && !command.inInput) continue;
      const bindings: readonly Binding[] = command.bindings;
      for (const binding of bindings) {
        if (
          event.metaKey !== (context.mac && !!binding.mod) ||
          event.ctrlKey !== (!!binding.ctrl || (!context.mac && !!binding.mod)) ||
          event.altKey !== !!binding.alt ||
          event.shiftKey !== !!binding.shift
        )
          continue;
        // Option produces symbols on macOS. Only use physical letter fallback there.
        const key =
          context.mac && event.altKey && /^Key[A-Z]$/.test(event.code)
            ? event.code.slice(3)
            : event.key;
        if (key.toLowerCase() !== binding.key.toLowerCase()) continue;
        if (!this.handlers.has(command.id)) continue;
        if (binding.presses === 2 && !(pending?.id === command.id && now - pending.at <= 500)) {
          this.pending = { id: command.id, at: now };
          event.preventDefault();
          return;
        }
        if (this.execute(command.id)) {
          event.preventDefault();
          return;
        }
      }
    }
  }
}
