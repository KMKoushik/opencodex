import { useState } from 'react';
import type { OpenCodeProject } from '@opencodex/contracts';

export function ProjectIcon({ name, icon }: { name: string; icon?: OpenCodeProject['icon'] }) {
  const source = icon?.override || (!icon?.color ? icon?.url : undefined);
  const [failed, setFailed] = useState<string>();
  return (
    <span className="project-icon" data-color={icon?.color || 'gray'} aria-hidden="true">
      {source && source !== failed ? (
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(source)}
        />
      ) : (
        Array.from(name.trim())[0]?.toLocaleUpperCase() || '?'
      )}
    </span>
  );
}
