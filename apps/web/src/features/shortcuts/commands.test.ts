import { describe, expect, it, vi } from 'vitest';
import { CommandRegistry, shortcutLabel } from './commands';

const context = { mac: true, editable: false, blocked: false };
const key = (overrides: Partial<KeyboardEvent> = {}) => ({
  key: 'b',
  code: 'KeyB',
  metaKey: true,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  keyCode: 0,
  isComposing: false,
  defaultPrevented: false,
  repeat: false,
  getModifierState: () => false,
  preventDefault: vi.fn(),
  ...overrides,
});

describe('app command dispatch', () => {
  it('uses exact platform modifiers and consumes only available actions', () => {
    const registry = new CommandRegistry();
    const toggle = vi.fn();
    const unregister = registry.register('sidebar.toggle', toggle);
    const mac = key();
    registry.dispatch(mac, context);
    const windows = key({ metaKey: false, ctrlKey: true });
    registry.dispatch(windows, { ...context, mac: false });
    registry.dispatch(key({ shiftKey: true }), context);
    registry.dispatch(windows, context);
    expect(toggle).toHaveBeenCalledTimes(2);
    expect(mac.preventDefault).toHaveBeenCalledOnce();
    expect(windows.preventDefault).toHaveBeenCalledOnce();
    unregister();
    const inactive = key();
    registry.dispatch(inactive, context);
    expect(inactive.preventDefault).not.toHaveBeenCalled();
    registry.register('sidebar.toggle', () => false);
    registry.dispatch(inactive, context);
    expect(inactive.preventDefault).not.toHaveBeenCalled();
  });

  it('respects local controls, IME, AltGraph, and held keys', () => {
    const registry = new CommandRegistry();
    const toggle = vi.fn();
    registry.register('sidebar.toggle', toggle);
    for (const event of [
      key({ isComposing: true }),
      key({ keyCode: 229 }),
      key({ repeat: true }),
      key({ defaultPrevented: true }),
      key({ getModifierState: () => true }),
    ]) {
      registry.dispatch(event, context);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    registry.dispatch(key(), { ...context, blocked: true });
    expect(toggle).not.toHaveBeenCalled();
    registry.dispatch(key(), { ...context, editable: true });
    expect(toggle).toHaveBeenCalledOnce();
    const dismiss = vi.fn();
    registry.register('view.dismiss', dismiss);
    registry.dispatch(key({ key: 'Escape', metaKey: false }), { ...context, editable: true });
    expect(dismiss).not.toHaveBeenCalled();
    registry.dispatch(key({ key: 'Escape', metaKey: false }), context);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('keeps explicit Control bindings distinct from Command on macOS', () => {
    const registry = new CommandRegistry();
    const cycle = vi.fn();
    registry.register('thinking.cycle', cycle);
    const controlT = key({ key: 't', code: 'KeyT', metaKey: false, ctrlKey: true });
    registry.dispatch(controlT, { ...context, editable: true });
    registry.dispatch(controlT, { ...context, mac: false });
    registry.dispatch(key({ key: 't', code: 'KeyT' }), context);
    expect(cycle).toHaveBeenCalledTimes(2);
    expect(shortcutLabel('thinking.cycle', true)).toBe('⌃T');
    expect(shortcutLabel('thinking.cycle', false)).toBe('Ctrl+T');
  });

  it('accepts both new-chat bindings, including macOS Option symbols', () => {
    const registry = new CommandRegistry();
    const create = vi.fn();
    registry.register('chat.new', create);
    registry.dispatch(key({ key: 'n', code: 'KeyN' }), context);
    registry.dispatch(key({ key: 'Dead', code: 'KeyN', altKey: true }), context);
    registry.dispatch(
      key({ key: 'n', code: 'KeyN', metaKey: false, ctrlKey: true, altKey: true }),
      { ...context, mac: false },
    );
    registry.dispatch(key({ key: 'n', code: 'KeyN', altKey: true, metaKey: false }), context);
    expect(create).toHaveBeenCalledTimes(3);
    expect(shortcutLabel('chat.new', true)).toBe('⌘N / ⌘⌥N');
    expect(shortcutLabel('chat.new', false)).toBe('Ctrl+N / Ctrl+Alt+N');
  });

  it('stops on two quick Escapes, with dismissal and editor composition taking priority', () => {
    const registry = new CommandRegistry();
    const stop = vi.fn();
    const escape = () => key({ key: 'Escape', metaKey: false });
    const typing = { ...context, editable: true };
    const unregister = registry.register('chat.stop', stop);
    registry.dispatch(escape(), typing, 0);
    expect(stop).not.toHaveBeenCalled();
    registry.dispatch(escape(), typing, 200);
    expect(stop).toHaveBeenCalledOnce();

    registry.dispatch(escape(), typing, 1000);
    registry.dispatch(escape(), typing, 1600);
    expect(stop).toHaveBeenCalledOnce();
    registry.dispatch(key({ key: 'x', metaKey: false }), typing, 1700);
    registry.dispatch(escape(), typing, 1800);
    expect(stop).toHaveBeenCalledOnce();
    registry.resetSequence();
    registry.dispatch(escape(), typing, 1850);
    expect(stop).toHaveBeenCalledOnce();
    registry.dispatch(key({ key: 'Escape', metaKey: false, repeat: true }), typing, 1900);
    registry.dispatch(escape(), typing, 2000);
    expect(stop).toHaveBeenCalledOnce();
    registry.dispatch(key({ key: 'Escape', metaKey: false, isComposing: true }), typing, 2100);
    registry.dispatch(escape(), typing, 2200);
    expect(stop).toHaveBeenCalledOnce();

    const dismiss = registry.register('view.dismiss', () => {});
    registry.dispatch(escape(), context, 2250);
    dismiss();
    registry.dispatch(escape(), context, 2300);
    expect(stop).toHaveBeenCalledOnce();
    unregister();
    registry.register('chat.stop', stop);
    registry.dispatch(escape(), context, 2400);
    expect(stop).toHaveBeenCalledOnce();
    registry.dispatch(escape(), context, 2500);
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
