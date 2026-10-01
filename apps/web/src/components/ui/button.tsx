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

type Props = ComponentProps<'button'> & VariantProps<typeof variants>;

export function Button({ className, variant, size, type = 'button', ...props }: Props) {
  return <button type={type} className={cn(variants({ variant, size }), className)} {...props} />;
}
