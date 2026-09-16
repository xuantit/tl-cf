export type TurnstileMode = 'managed' | 'non-interactive' | 'invisible'
export type TurnstileClearance = 'no_clearance' | 'jschallenge' | 'managed' | 'interactive'
export interface TurnstileInput {
  name: string
  domains: string[]
  mode: TurnstileMode
  clearanceLevel: TurnstileClearance
}
export interface TurnstileWidget extends TurnstileInput {
  sitekey: string
  createdOn?: string
  modifiedOn?: string
  region: 'world' | 'china'
  botFightMode: boolean
  ephemeralId: boolean
  offlabel: boolean
}
export interface TurnstileList {
  widgets: TurnstileWidget[]
  total: number
  page: number
  perPage: number
}