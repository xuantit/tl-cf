import type { CSSProperties } from 'react'

export interface SkeletonLineProps {
  width?: CSSProperties['width']
  className?: string
}

export function SkeletonLine({ width, className = '' }: SkeletonLineProps) {
  return (
    <div
      aria-hidden
      className={`h-[9px] animate-shimmer rounded-[3px] bg-[linear-gradient(90deg,var(--stroke-2)_25%,var(--bg-hover)_50%,var(--stroke-2)_75%)] bg-[length:200%_100%] ${className}`}
      style={width != null ? { width } : undefined}
    />
  )
}
