import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { DraftMention } from './mentions';

export type MentionOption = Readonly<{
  key: string;
  label: string;
  detail?: string;
  mention: DraftMention;
}>;

/** Skills and files of this chat's project, and recent chats across projects. */
export function useMentionOptions(
  directory: string | undefined,
  sessionID: string,
  query: string | undefined,
) {
  const open = query !== undefined;
  const search = query?.toLowerCase() ?? '';
  const [fileQuery, setFileQuery] = useState('');
  useEffect(() => {
    // Skills and chats filter locally on every key; only file search goes to OpenCode.
    const timer = setTimeout(() => setFileQuery(query?.trim() ?? ''), 80);
    return () => clearTimeout(timer);
  }, [query]);
  const skills = useQuery({
    queryKey: ['workspace', 'skills', directory],
    queryFn: ({ signal }) => api.workspaceSkills(directory!, signal),
    enabled: open && Boolean(directory),
    staleTime: 30_000,
  });
  const files = useQuery({
    queryKey: ['workspace', 'files', directory, '', fileQuery],
    queryFn: ({ signal }) => api.files(directory!, '', fileQuery, signal),
    enabled: open && Boolean(directory && fileQuery),
    staleTime: 10_000,
    gcTime: 30_000,
    placeholderData: keepPreviousData,
  });
  // Session lists are infinite queries, so session events update this one like the others.
  const chats = useInfiniteQuery({
    queryKey: ['sessions', 'mentions'],
    queryFn: ({ signal }) => api.searchSessions('', undefined, signal),
    initialPageParam: undefined,
    getNextPageParam: () => undefined,
    enabled: open,
    staleTime: 30_000,
  });
  const options = useMemo(() => {
    if (!open) return [];
    const ranked = (skills.data ?? [])
      .map((skill) => {
        const name = skill.name.toLowerCase();
        // Descriptions are long prose; matching them would crowd out files and chats.
        const rank = name.startsWith(search)
          ? 0
          : name.includes(search) || skill.id.toLowerCase().includes(search)
            ? 1
            : -1;
        return { skill, rank };
      })
      .filter((item) => item.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 5)
      .map(({ skill }): MentionOption => ({
        key: `skill:${skill.id}`,
        label: skill.name,
        detail: skill.description,
        mention: { type: 'skill', id: skill.id, token: `@${skill.name}` },
      }));
    const found = fileQuery
      ? (files.data ?? []).slice(0, 6).map((entry): MentionOption => {
          const slash = entry.path.lastIndexOf('/');
          return {
            key: `file:${entry.path}`,
            label: entry.path.slice(slash + 1),
            detail: slash > 0 ? entry.path.slice(0, slash) : undefined,
            mention: { type: 'file', path: entry.path, token: `@${entry.path}` },
          };
        })
      : [];
    const recent = (chats.data?.pages[0]?.sessions ?? [])
      .filter((chat) => chat.id !== sessionID && chat.title.toLowerCase().includes(search))
      .slice(0, 5)
      .map((chat): MentionOption => ({
        key: `chat:${chat.id}`,
        label: chat.title,
        detail: chat.directory.split(/[\\/]/).at(-1),
        mention: { type: 'chat', id: chat.id, token: `@${chat.title}` },
      }));
    return [...ranked, ...found, ...recent];
  }, [open, search, skills.data, fileQuery, files.data, chats.data, sessionID]);
  const failed = [skills, files, chats].filter((item) => item.isError);
  return {
    options,
    loading: [skills, chats].some((item) => item.isPending && item.isFetching) || files.isFetching,
    failed: failed.length > 0,
    retry: () => failed.forEach((item) => void item.refetch()),
  };
}
