import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** Wraps any block with a light sweep. The sweep stops under reduced motion. */
export default function Shimmer({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("shimmer", className)} {...rest} />;
}

/** Placeholder block for loading states. Size it with className (h-*, w-*). */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <Shimmer aria-hidden className={cx("rounded-lg bg-surface-3", className)} {...rest} />;
}
