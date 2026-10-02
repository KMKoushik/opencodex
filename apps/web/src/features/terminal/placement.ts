import { readStorage } from '../../lib/storage';

export type TerminalPlacement = 'bottom' | 'right';

export function readTerminalPlacement(): TerminalPlacement {
  return readStorage('terminalPlacement') === 'right' ? 'right' : 'bottom';
}
