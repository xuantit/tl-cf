// Types for account-scoped edge features (Cloudflare Tunnel …).
// Shapes mirror node-backend/src/services/cloudflare.ts responses.

export type TunnelStatus = 'inactive' | 'degraded' | 'healthy' | 'down'

export interface TunnelConnection {
  colo?: string
  version?: string
  originIp?: string
  openedAt?: string
  clientId?: string
}

export interface Tunnel {
  id: string
  name: string
  status: TunnelStatus
  createdAt?: string
  /** true = remotely-managed (config_src=cloudflare) — ingress editable from the dashboard. */
  remoteConfig: boolean
  connections: TunnelConnection[]
}

export interface TunnelIngressRule {
  hostname?: string
  service: string
  path?: string
  originRequest?: Record<string, unknown>
}

export interface TunnelConnectorClient {
  id?: string
  version?: string
  arch?: string
  runAt?: string
  conns: Array<{ colo?: string; openedAt?: string; originIp?: string }>
}

/** A route mapping a URL pattern to a Worker script within a zone. */
export interface WorkerRoute {
  id: string
  pattern: string
  script?: string
}

export interface WorkerScript {
  id: string
  createdOn?: string
  modifiedOn?: string
  handlers: string[]
  routes: WorkerRoute[]
  lastDeployedFrom?: string
  compatibilityDate?: string
  hasAssets?: boolean
  logpush?: boolean
}

export interface PagesDeployment {
  id: string
  environment?: string
  url?: string
  createdOn?: string
  modifiedOn?: string
  branch?: string
  commitHash?: string
  status?: string
}

export interface PagesProject {
  name: string
  subdomain?: string
  domains: string[]
  createdOn?: string
  productionBranch?: string
  latestDeployment?: PagesDeployment | null
}

export interface PagesDomain {
  id?: string
  name: string
  status?: string
}

export interface PagesEnvVar {
  key: string
  /** Secret vars come back with an empty value and secret=true. */
  value: string
  secret: boolean
}

export interface PagesProjectDetail {
  name: string
  productionBranch?: string
  envVars: PagesEnvVar[]
}
