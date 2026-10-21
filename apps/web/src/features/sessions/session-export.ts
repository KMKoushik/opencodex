import { api } from '../../lib/api';

export type ExportFormat = 'markdown' | 'json';

export async function downloadSessionExport(
  sessionID: string,
  title: string,
  format: ExportFormat,
) {
  const blob = await api.exportSession(sessionID, format);
  const name =
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || sessionID;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.${format === 'markdown' ? 'md' : 'json'}`;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari hands the URL to its download manager after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
