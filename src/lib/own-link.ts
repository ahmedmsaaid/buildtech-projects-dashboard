/**
 * A customer's own web address, e.g. elnour-clinic.vercel.app. The platform
 * stays one site; the address is one more name for it, and the platform
 * shows that customer's page to whoever arrives through it.
 *
 * Giving a customer an address is two steps: the host (Vercel) must send the
 * address to the platform, and the account must remember it. With a Vercel
 * access token set, the first step happens here; without one the owner adds
 * the address in Vercel by hand.
 */
import { query } from './db';
import { platformUrl } from './products';

const env = (name: string) => ((import.meta.env[name] as string | undefined) ?? process.env[name] ?? '').trim();
const token = env('VERCEL_TOKEN');
/** The platform's project on Vercel, by name or id. */
const project = env('VERCEL_PROJECT');
/** Only needed when the project belongs to a team rather than a personal account. */
const team = env('VERCEL_TEAM_ID');

/** True when this dashboard can add addresses on Vercel by itself. */
export const canManageAddresses = token !== '' && project !== '';

/**
 * Turns what the owner typed into a full address: a bare name gets
 * .vercel.app, and a name with a dot is taken as a domain they own.
 * Returns null for anything that cannot be an address.
 */
export function toAddress(typed: string): string | null {
  const name = typed
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  if (/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(name)) return `${name}.vercel.app`;
  if (name.length <= 100 && /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(name)) return name;
  return null;
}

function vercel(path: string, method: string, body?: unknown): Promise<Response> {
  const url = new URL(`https://api.vercel.com${path}`);
  if (team) url.searchParams.set('teamId', team);
  return fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}

export type LinkResult =
  | { ok: true; address: string; /** False when the owner still has to add the address in Vercel. */ live: boolean; /** A domain they own may need DNS set up first. */ needsDns: boolean }
  | { ok: false; reason: 'taken_here' | 'taken_elsewhere' | 'refused' | 'unreachable' | 'is_platform' };

/** Gives an account an address of its own, replacing any it had. */
export async function setOwnLink(accountId: string, address: string, previous: string | null): Promise<LinkResult> {
  if (platformUrl && new URL(platformUrl).host === address) return { ok: false, reason: 'is_platform' };
  const [other] = await query('select 1 from accounts where domain = $1 and id <> $2', [address, accountId]);
  if (other) return { ok: false, reason: 'taken_here' };

  let needsDns = false;
  if (canManageAddresses && address !== previous) {
    try {
      const response = await vercel(`/v10/projects/${encodeURIComponent(project)}/domains`, 'POST', { name: address });
      // 409 means some other project already has this address.
      if (response.status === 409) return { ok: false, reason: 'taken_elsewhere' };
      const answer = await response.text();
      // Vercel answers 400 both for an address it will not accept and for one
      // that is already on our project; only the second is fine to save.
      const alreadyOurs = response.status === 400 && /already/i.test(answer);
      if (!response.ok && !alreadyOurs) return { ok: false, reason: 'refused' };
      if (response.ok) needsDns = (JSON.parse(answer) as { verified?: boolean }).verified === false || !address.endsWith('.vercel.app');
    } catch {
      return { ok: false, reason: 'unreachable' };
    }
  }

  await query('update accounts set domain = $2 where id = $1', [accountId, address]);
  if (previous && previous !== address) await releaseAddress(previous);
  return { ok: true, address, live: canManageAddresses, needsDns };
}

/** Takes an account's own address away. Its shared address keeps working. */
export async function removeOwnLink(accountId: string, address: string): Promise<void> {
  await query('update accounts set domain = null where id = $1', [accountId]);
  await releaseAddress(address);
}

/** Frees an address on Vercel. A failure is not fatal: the address just stays reserved there. */
async function releaseAddress(address: string): Promise<void> {
  if (!canManageAddresses) return;
  try {
    await vercel(`/v9/projects/${encodeURIComponent(project)}/domains/${encodeURIComponent(address)}`, 'DELETE');
  } catch {
    // Left for the owner to remove in Vercel if they care to.
  }
}
