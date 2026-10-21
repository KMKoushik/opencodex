import type { SessionMessageAssistant, SessionTransferData } from '@opencode/client';

const OUTPUT_LIMIT = 4_000;

/** A readable Markdown transcript; the JSON export keeps every detail. */
export function formatTranscript({ info, messages }: SessionTransferData) {
  let out = `# ${info.title || 'Untitled thread'}\n\n`;
  out += `Created ${date(info.time.created)} · Updated ${date(info.time.updated)}\n\n`;
  let speaker: 'user' | 'assistant' | undefined;
  for (const message of messages) {
    // Undone messages stay hidden in the chat until the next send, so leave them out here too.
    if (message.id === info.revert?.messageID) break;
    if (message.type === 'user') {
      const files = message.files?.flatMap((file) =>
        file.mention ? [] : [file.name || file.mime],
      );
      out += `---\n\n## User\n\n${message.text}\n\n`;
      if (files?.length) out += `_Attached: ${files.join(', ')}_\n\n`;
      speaker = 'user';
    } else if (message.type === 'assistant') {
      const body = assistant(message);
      if (!body) continue;
      if (speaker !== 'assistant')
        out += `---\n\n## Assistant (${message.agent} · ${message.model.providerID}/${message.model.id})\n\n`;
      out += body;
      speaker = 'assistant';
    } else if (message.type === 'shell') {
      const output = message.output?.output.trimEnd();
      out += `---\n\n## Shell\n\n${fence(`$ ${message.command}${output ? `\n${clip(output)}` : ''}`)}`;
      speaker = undefined;
    } else if (message.type === 'compaction' && message.status === 'completed') {
      out += `---\n\n_The conversation was compacted here._\n\n`;
      speaker = undefined;
    }
  }
  return out;
}

function assistant(message: SessionMessageAssistant) {
  let out = '';
  for (const part of message.content) {
    if (part.type === 'text' && part.text.trim()) out += `${part.text.trim()}\n\n`;
    if (part.type !== 'tool') continue;
    out += `<details>\n<summary>Tool: ${escape(part.name)}</summary>\n\n`;
    if (Object.keys(part.state.input ?? {}).length)
      out += fence(clip(JSON.stringify(part.state.input, null, 2)), 'json');
    if (part.state.status === 'error') out += `**Error:** ${part.state.error.message}\n\n`;
    const text =
      'content' in part.state
        ? part.state.content
            ?.flatMap((item) => (item.type === 'text' ? [item.text] : []))
            .join('\n')
            .trimEnd()
        : undefined;
    if (text) out += fence(clip(text));
    out += `</details>\n\n`;
  }
  if (message.error) out += `> **Error:** ${message.error.message}\n\n`;
  return out;
}

function clip(text: string) {
  return text.length > OUTPUT_LIMIT
    ? `${text.slice(0, OUTPUT_LIMIT)}\n… ${text.length - OUTPUT_LIMIT} more characters`
    : text;
}

/** A fence longer than any backtick run inside, so code in the text can't close it. */
function fence(text: string, language = '') {
  let longest = 2;
  for (const run of text.matchAll(/`{3,}/g)) longest = Math.max(longest, run[0].length);
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}${language}\n${text}\n${ticks}\n\n`;
}

function escape(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function date(time: number) {
  return new Date(time).toLocaleString();
}
