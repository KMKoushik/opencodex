import './activity-text.css';

export function ActivityText({
  active,
  children,
  className = '',
  title,
}: {
  active: boolean;
  children: string;
  className?: string;
  title?: string;
}) {
  return (
    <span className={`activity-text ${className}`} data-active={active} title={title}>
      {children}
    </span>
  );
}
