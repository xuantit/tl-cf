/** Các khối chức năng của trang chi tiết domain (dùng chung cho lưới Overview và rail). */
export type ModuleKey = 'dns' | 'cache' | 'rules' | 'security' | 'tags' | 'analytics'

export interface DomainModule {
  key: ModuleKey
  icon: string
  /** Nhãn gốc — chạy qua t() ở nơi hiển thị. */
  label: string
}

export const DOMAIN_MODULES: DomainModule[] = [
  { key: 'dns', icon: '⛁', label: 'DNS' },
  { key: 'cache', icon: '⚡', label: 'Cache' },
  { key: 'rules', icon: '⇄', label: 'Rules' },
  { key: 'security', icon: '⛨', label: 'Security' },
  { key: 'tags', icon: '#', label: 'Tags' },
  { key: 'analytics', icon: '◔', label: 'Analytics' },
]

export function isModuleKey(value: string | null): value is ModuleKey {
  return !!value && DOMAIN_MODULES.some((m) => m.key === value)
}
