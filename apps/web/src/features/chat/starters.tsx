import {
  BookOpen01Icon,
  LeftToRightListBulletIcon,
  PlusMinusIcon,
  TestTube01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useDraftStore } from './draft-context';
import { useCommandRegistry } from '../shortcuts/shortcut-context';

const starters = [
  {
    icon: BookOpen01Icon,
    label: 'Explain how this repo is put together',
    prompt:
      'Explain how this repo is put together: the main modules, how data flows between them, and where to start reading.',
  },
  {
    icon: TestTube01Icon,
    label: 'Find and fix the failing test',
    prompt: 'Run the tests, find the failing one, and fix the underlying bug.',
  },
  {
    icon: PlusMinusIcon,
    label: 'Review my uncommitted changes',
    prompt:
      'Review my uncommitted changes for bugs, missed edge cases, and anything that should be simpler.',
  },
  {
    icon: LeftToRightListBulletIcon,
    label: 'Plan a refactor before touching code',
    prompt:
      'Plan a refactor before touching any code: what to change, in what order, and how to verify each step.',
  },
];

/** Starter prompts for an empty thread. Choosing one only fills the draft; nothing is sent. */
export function Starters({ sessionID }: { sessionID: string }) {
  const drafts = useDraftStore();
  const commands = useCommandRegistry();
  return (
    <div className="starters">
      {starters.map((starter) => (
        <button
          key={starter.label}
          type="button"
          className="starter"
          onClick={() => {
            drafts.getState().editText(sessionID, starter.prompt);
            commands.execute('composer.focus');
          }}
        >
          <span className="starter-icon" aria-hidden="true">
            <HugeiconsIcon icon={starter.icon} size={16} />
          </span>
          <span>{starter.label}</span>
        </button>
      ))}
    </div>
  );
}
