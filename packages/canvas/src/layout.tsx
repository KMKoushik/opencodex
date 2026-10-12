import {
  Children,
  isValidElement,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cx } from './util';

type Gap = 0 | 4 | 8 | 12 | 16 | 20 | 24 | 32;
type Box = { children?: ReactNode; className?: string; style?: CSSProperties };

/** Vertical stack. The default page layout: put a canvas's sections in a Stack. */
export function Stack({
  gap = 16,
  align,
  children,
  className,
  style,
}: Box & { gap?: Gap; align?: 'start' | 'center' | 'end' | 'stretch' }) {
  return (
    <div className={cx('cv-stack', className)} style={{ gap, alignItems: align, ...style }}>
      {children}
    </div>
  );
}

/** Horizontal row that wraps on narrow widths. */
export function Row({
  gap = 12,
  align = 'center',
  justify,
  wrap = true,
  children,
  className,
  style,
}: Box & {
  gap?: Gap;
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
}) {
  return (
    <div
      className={cx('cv-row', className)}
      style={{
        gap,
        alignItems: align,
        justifyContent: justify === 'between' ? 'space-between' : justify,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Responsive grid. `columns` fixes the column count (one column when narrow); otherwise
 * columns fill the width at `minWidth` pixels or wider.
 */
export function Grid({
  columns,
  minWidth = 200,
  gap = 12,
  children,
  className,
  style,
}: Box & { columns?: number; minWidth?: number; gap?: Gap }) {
  return (
    <div
      className={cx('cv-grid', Boolean(columns) && 'cv-grid-fixed', className)}
      style={{
        gap,
        gridTemplateColumns: columns
          ? `repeat(${columns}, minmax(0, 1fr))`
          : `repeat(auto-fill, minmax(min(100%, ${minWidth}px), 1fr))`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A bordered surface. Give it a title for a labelled panel. */
export function Card({
  title,
  subtitle,
  actions,
  padding = 16,
  children,
  className,
  style,
}: Box & { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; padding?: Gap }) {
  return (
    <section className={cx('cv-card', className)} style={style}>
      {(title || actions) && (
        <header className="cv-card-header">
          <div className="cv-card-titles">
            {title && <h3 className="cv-card-title">{title}</h3>}
            {subtitle && <p className="cv-card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="cv-card-actions">{actions}</div>}
        </header>
      )}
      <div className="cv-card-body" style={{ padding }}>
        {children}
      </div>
    </section>
  );
}

/** A titled group of content without a border. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  style,
}: Box & { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx('cv-section', className)} style={style}>
      <header className="cv-section-header">
        <div>
          <h2 className="cv-heading">{title}</h2>
          {description && <p className="cv-muted">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Divider({ label }: { label?: ReactNode }) {
  return label ? (
    <div className="cv-divider-label" role="separator">
      <span>{label}</span>
    </div>
  ) : (
    <hr className="cv-divider" />
  );
}

/** One tab of `Tabs`. */
export function Tab(props: { label: ReactNode; children?: ReactNode }): ReactElement {
  return <>{props.children}</>;
}

/** Tabbed views: `<Tabs><Tab label="Overview">…</Tab><Tab label="Details">…</Tab></Tabs>`. */
export function Tabs({
  children,
  value,
  onChange,
  defaultValue = 0,
}: {
  children: ReactNode;
  /** Selected tab index, when controlled. */
  value?: number;
  onChange?: (index: number) => void;
  defaultValue?: number;
}) {
  const [own, setOwn] = useState(defaultValue);
  const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<{
    label: ReactNode;
    children?: ReactNode;
  }>[];
  const selected = Math.min(value ?? own, tabs.length - 1);
  return (
    <div className="cv-tabs">
      <div className="cv-tab-list" role="tablist">
        {tabs.map((tab, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={index === selected}
            className="cv-tab"
            onClick={() => {
              setOwn(index);
              onChange?.(index);
            }}
          >
            {tab.props.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tabs[selected]?.props.children}</div>
    </div>
  );
}

/** Page title, optionally with a subtitle and actions on the right. */
export function Title({
  children,
  subtitle,
  actions,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="cv-title-block">
      <div>
        <h1 className="cv-title">{children}</h1>
        {subtitle && <p className="cv-muted">{subtitle}</p>}
      </div>
      {actions && <div className="cv-card-actions">{actions}</div>}
    </header>
  );
}

export function Heading({ children, level = 2 }: { children: ReactNode; level?: 2 | 3 | 4 }) {
  const Tag = `h${level}` as const;
  return <Tag className={level === 2 ? 'cv-heading' : 'cv-subheading'}>{children}</Tag>;
}

/** Body text. `muted` for secondary text, `size="sm"` for captions. */
export function Text({
  children,
  muted,
  size = 'md',
  weight,
  mono,
  className,
  style,
}: Box & {
  muted?: boolean;
  size?: 'sm' | 'md' | 'lg';
  weight?: 'normal' | 'medium' | 'bold';
  mono?: boolean;
}) {
  return (
    <p
      className={cx(
        'cv-text',
        `cv-text-${size}`,
        muted && 'cv-muted',
        mono && 'cv-mono',
        className,
      )}
      style={{
        fontWeight: weight === 'bold' ? 650 : weight === 'medium' ? 550 : undefined,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

/** Inline code. */
export function Code({ children }: { children: ReactNode }) {
  return <code className="cv-code">{children}</code>;
}

/** A block of code or preformatted text. */
export function CodeBlock({
  code,
  title,
  maxHeight = 360,
}: {
  code: string;
  title?: ReactNode;
  maxHeight?: number;
}) {
  return (
    <figure className="cv-code-block">
      {title && <figcaption>{title}</figcaption>}
      <pre style={{ maxHeight }}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
