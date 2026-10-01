import type { CSSProperties } from 'react';
import { CpuIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

const assets = import.meta.glob<string>('./provider-logos/*.svg', {
  eager: true,
  import: 'default',
  query: '?url',
});
const aliases: Record<string, string> = {
  codex: 'openai',
  chatgpt: 'openai',
  claude: 'anthropic',
  gemini: 'google',
  'google-vertex': 'google',
  copilot: 'github-copilot',
  'github-copilot-enterprise': 'github-copilot',
  'ollama-cloud': 'ollama',
  'azure-cognitive-services': 'azure',
};

export function ProviderLogo({
  providerID,
  canonical,
}: {
  providerID: string;
  canonical?: string;
}) {
  const id = (canonical || providerID).toLowerCase();
  const src = assets[`./provider-logos/${aliases[id] ?? id}.svg`];
  return src ? (
    <span
      className="provider-logo"
      aria-hidden="true"
      style={{ '--provider-logo': `url("${src}")` } as CSSProperties}
    />
  ) : (
    <HugeiconsIcon icon={CpuIcon} size={18} className="provider-logo-fallback" aria-hidden="true" />
  );
}
