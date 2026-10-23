import type { ReactNode } from 'react'
import { Tag } from './ui'
import ThemeToggle from './ThemeToggle'

export default function AuthCard({ title, description, children }: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-bg-app p-5">
      <div className="fade-in w-[380px] max-w-full rounded-xl border border-stroke bg-bg p-[26px_24px] shadow-[0_8px_30px_-12px_rgb(0_0_0/.12)]">
        <div className="mb-5 flex items-center gap-2">
          <div className="grid h-6 w-6 flex-none place-items-center rounded-[6px] bg-accent text-[13px] text-on-primary">☁</div>
          <div className="font-mono text-[13px] font-semibold text-fg">CF Tool</div>
          <Tag className="ml-auto">v2</Tag>
          <ThemeToggle />
        </div>
        <h1 className="m-0 text-[18px] font-semibold tracking-[-.02em] text-fg">{title}</h1>
        <p className="mt-2 mb-5 text-[13px] leading-relaxed text-fg-3">{description}</p>
        {children}
      </div>
    </div>
  )
}