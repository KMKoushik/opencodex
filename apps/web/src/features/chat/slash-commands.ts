import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const localCommands = [
  { name: 'undo', description: 'Stage undo of the last turn; apply when you next send' },
  { name: 'redo', description: 'Cancel staged undo and restore the conversation' },
  { name: 'fork', description: 'Fork this conversation into a new thread' },
  { name: 'new', description: 'Start a new thread in this project' },
  { name: 'compact', description: 'Summarize the conversation to free context' },
  { name: 'rename', description: 'Rename this thread · /rename New title' },
  { name: 'export', description: 'Download this conversation as JSON' },
];
export function useSlashCommands(directory: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['workspace', 'commands', directory],
    enabled: Boolean(directory) && enabled,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const [commands, skills] = await Promise.all([
        api.commands(directory!, signal),
        api.workspaceSkills(directory!, signal),
      ]);
      const entries = new Map(
        localCommands.map((item) => [
          item.name,
          { ...item, skill: undefined as string | undefined },
        ]),
      );
      for (const skill of skills)
        if (!entries.has(skill.name))
          entries.set(skill.name, {
            name: skill.name,
            description: skill.description ?? 'Use skill',
            skill: skill.id,
          });
      for (const command of commands)
        if (!entries.has(command.name))
          entries.set(command.name, {
            ...command,
            description: command.description ?? 'Run command',
            skill: undefined,
          });
      return [...entries.values()];
    },
  });
}
export function parseSlash(text: string) {
  const match = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  return match ? { name: match[1]!, text: match[2] ?? '' } : undefined;
}
