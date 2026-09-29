import { useId, type ReactNode } from 'react';

export function SettingsGroup({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="settings-group" aria-labelledby={title ? id : undefined}>
      {title && (
        <div className="settings-row settings-group-header">
          <h2 id={id}>{title}</h2>
          {action && <div className="settings-control">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {description && <p>{description}</p>}
      </div>
      {children && <div className="settings-control">{children}</div>}
    </div>
  );
}
