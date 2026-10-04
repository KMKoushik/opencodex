import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const variants = cva('button', {
  variants: {
    variant: { primary: 'button-primary', secondary: 'button-secondary', ghost: 'button-ghost' },
    size: { default: '', sm: 'button-sm', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
});

type Props = ComponentProps<'button'> &
  VariantProps<typeof variants> & {
    /** Icon buttons show their title, else their label, unless they open their own hover card. */
    tooltip?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  type = 'button',
  title,
  tooltip = true,
  ...props
}: Props) {
  const text = size === 'icon' && tooltip ? (title ?? props['aria-label']) : undefined;
  return (
    <button
      type={type}
      className={cn(variants({ variant, size }), className)}
      title={size === 'icon' ? undefined : title}
      data-tooltip={text}
      aria-label={props['aria-label'] ?? (size === 'icon' ? title : undefined)}
      {...props}
    />
  );
}
