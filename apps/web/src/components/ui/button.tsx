import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const variants = cva('button', {
  variants: {
    variant: { default: 'button-primary', secondary: 'button-secondary', ghost: 'button-ghost' },
    size: { default: '', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>;

export function Button({ className, variant, size, type = 'button', ...props }: Props) {
  return <button type={type} className={cn(variants({ variant, size }), className)} {...props} />;
}
