import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, letting later Tailwind utilities win over earlier ones.
 *
 * clsx alone concatenates, so `cn('p-2', 'p-4')` would emit both and leave the winner
 * to CSS source order — which is not the order they were written in. twMerge resolves
 * the conflict to `p-4`, which is what makes a `className` prop on a component able to
 * override the component's own defaults.
 *
 * The shadcn/ui convention, and what every generated component expects to import.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
