import { expect, it } from 'vitest';
import { localCommands, matchSlashCommands } from './slash-commands';

it('ranks command names before descriptions and applies the menu limit after ranking', () => {
  const commands = [
    ...Array.from({ length: 60 }, (_, index) => ({
      name: `skill-${index}`,
      description: 'Build something new',
    })),
    ...localCommands,
    { name: 'renew', description: 'Renew credentials' },
    { name: 'new-project', description: 'Create a project' },
  ];
  const matches = matchSlashCommands(commands, 'NeW');
  expect(matches.slice(0, 3).map((command) => command.name)).toEqual([
    'new',
    'new-project',
    'renew',
  ]);
  expect(matches).toHaveLength(50);
  expect(matches[3]).toBe(commands[0]);
  expect(matchSlashCommands(localCommands, '').map((command) => command.name)).toEqual(
    localCommands.map((command) => command.name),
  );
});
