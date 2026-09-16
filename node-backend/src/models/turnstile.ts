import { isIP } from 'node:net';
import { z } from 'zod';

export const turnstileSitekey = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);
export const turnstileAccountId = z.string().regex(/^[a-f0-9]{32}$/i);
const hostname = z.string().trim().toLowerCase().min(1).max(253).refine((value) =>
  isIP(value) !== 0 || value.split('.').every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)),
  'Use a hostname or IP only, without scheme, port, path or wildcard',
);
export const turnstileInput = z.object({
  name: z.string().trim().min(1).max(254),
  domains: z.array(hostname).min(1).max(10).transform((items) => [...new Set(items)]),
  mode: z.enum(['managed', 'non-interactive', 'invisible']),
  clearanceLevel: z.enum(['no_clearance', 'jschallenge', 'managed', 'interactive']),
}).strict();
export type TurnstileInput = z.infer<typeof turnstileInput>;
export interface TurnstileWidget extends TurnstileInput {
  sitekey: string;
  createdOn?: string;
  modifiedOn?: string;
  region: 'world' | 'china';
  botFightMode: boolean;
  ephemeralId: boolean;
  offlabel: boolean;
}
export interface RawTurnstileWidget {
  sitekey: string;
  secret?: string;
  name: string;
  domains: string[];
  mode: TurnstileInput['mode'];
  clearance_level?: TurnstileInput['clearanceLevel'];
  created_on?: string;
  modified_on?: string;
  region?: TurnstileWidget['region'];
  bot_fight_mode?: boolean;
  ephemeral_id?: boolean;
  offlabel?: boolean;
}
// Explicit allowlist: list/get/create/update must never return a widget secret.
export function publicTurnstileWidget(raw: RawTurnstileWidget): TurnstileWidget {
  return {
    sitekey: raw.sitekey, name: raw.name, domains: raw.domains, mode: raw.mode,
    clearanceLevel: raw.clearance_level ?? 'no_clearance',
    createdOn: raw.created_on, modifiedOn: raw.modified_on, region: raw.region ?? 'world',
    botFightMode: raw.bot_fight_mode ?? false, ephemeralId: raw.ephemeral_id ?? false, offlabel: raw.offlabel ?? false,
  };
}