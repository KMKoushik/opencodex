import * as icons from '../../web/node_modules/@hugeicons/core-free-icons';
import { writeFile } from 'node:fs/promises';
const names = {
  more: 'MoreHorizontalIcon',
  info: 'InformationCircleIcon',
  panel: 'PanelRightIcon',
  copy: 'Copy01Icon',
  read: 'File01Icon',
  shell: 'CommandLineIcon',
  check: 'CheckmarkCircle02Icon',
  alert: 'AlertCircleIcon',
  changes: 'FileEditIcon',
  files: 'Folder01Icon',
  canvas: 'DashboardSquare02Icon',
  subagents: 'BotIcon',
  chat: 'BubbleChatQuestionIcon',
  terminal: 'CommandLineIcon',
  open: 'FolderOpenIcon',
  skill: 'Layers01Icon',
  source: 'SourceCodeIcon',
  attachment: 'Attachment01Icon',
  undo: 'Undo03Icon',
  save: 'FloppyDiskIcon',
  browser: 'Globe02Icon',
  latest: 'ArrowDown02Icon',
  preview: 'ViewIcon',
} as const;
let source = '// Generated from Hugeicons by tools/chat-icons.ts.\nuse rune::Icon;\n';
for (const [id, name] of Object.entries(names)) {
  const data = icons[name as keyof typeof icons];
  if (!data) throw new Error(name);
  const body = data
    .map(
      ([tag, props]) =>
        `<${tag} ${Object.entries(props)
          .filter(([key]) => key !== 'key')
          .map(
            ([key, val]) =>
              `${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${String(val).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`,
          )
          .join(' ')}/>`,
    )
    .join('');
  source += `pub const ${id.toUpperCase()}: Icon = Icon { name: "${id}", view:24.0,body:r##"<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</g>"## };\n`;
}
await writeFile(new URL('../src/chat/icons.rs', import.meta.url), source);
