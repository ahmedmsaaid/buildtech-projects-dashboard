/**
 * A database of the customer's own. Their bookings, menu and orders are
 * moved into it and kept nowhere else; the shared database keeps only the
 * account, its subscription and its sign-ins.
 *
 * It takes two steps: a new database is made at Neon (or the owner pastes
 * the link of one made by hand), and the platform, which knows what each
 * product keeps, moves the customer's records into it.
 */
import { query } from './db';
import { callPlatform } from './products';

const env = (name: string) => ((import.meta.env[name] as string | undefined) ?? process.env[name] ?? '').trim();
const apiKey = env('NEON_API_KEY');
/** Needed with a personal API key when the Neon account has more than one organization. */
const organization = env('NEON_ORG_ID');
/** Where new databases are made. The default is next to where Vercel runs the site. */
const region = env('NEON_REGION') || 'aws-us-east-1';

/** True when this dashboard can make databases at Neon by itself. */
export const canCreateDatabases = apiKey !== '';

function neon(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(`https://console.neon.tech/api/v2${path}`, {
    method,
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

interface NewDatabase {
  /** The database's id at Neon (a project there). */
  ref: string;
  link: string;
}

interface CreatedProject {
  project?: { id?: string };
  connection_uris?: { connection_uri?: string; connection_parameters?: { database?: string; role?: string; password?: string; host?: string; pooler_host?: string } }[];
}

async function createAtNeon(name: string): Promise<NewDatabase | 'refused' | 'unreachable'> {
  try {
    const response = await neon('/projects', 'POST', { project: { name, region_id: region, ...(organization ? { org_id: organization } : {}) } });
    if (!response.ok) {
      // The reason (a wrong key, the plan's limit) is worth having in the server log; it holds no secret.
      console.error('Neon refused to create a database:', response.status, (await response.text()).slice(0, 300));
      return 'refused';
    }
    const created = (await response.json()) as CreatedProject;
    const ref = created.project?.id;
    const connection = created.connection_uris?.[0];
    const parts = connection?.connection_parameters;
    if (!ref) return 'refused';

    // The pooled address suits a site whose every request may open a connection.
    const host = parts?.pooler_host ?? parts?.host;
    if (parts?.role && parts.password && parts.database && host) {
      return { ref, link: `postgresql://${encodeURIComponent(parts.role)}:${encodeURIComponent(parts.password)}@${host}/${encodeURIComponent(parts.database)}` };
    }
    if (connection?.connection_uri) return { ref, link: connection.connection_uri };

    await removeAtNeon(ref);
    return 'refused';
  } catch {
    return 'unreachable';
  }
}

/** Removes a database at Neon. A failure is not fatal: it just stays there for the owner to delete. */
async function removeAtNeon(ref: string): Promise<void> {
  try {
    await neon(`/projects/${encodeURIComponent(ref)}`, 'DELETE');
  } catch {
    // Left for the owner to remove in the Neon console.
  }
}

/**
 * Removes the database of an account that is about to be deleted, so it is
 * not left behind at Neon. Only for an account nobody has used yet.
 */
export async function discardDatabaseOf(accountId: string): Promise<void> {
  const [row] = await query<{ database_ref: string | null }>('select database_ref from accounts where id = $1', [accountId]);
  if (row?.database_ref && canCreateDatabases) await removeAtNeon(row.database_ref);
}

export type OwnDatabaseResult =
  | { ok: true; rows: number }
  | { ok: false; reason: 'not_set_up' | 'neon_refused' | 'neon_unreachable' | 'platform_unreachable' | 'bad_link' | 'has_one' | 'is_demo' | 'database_unreachable' | 'failed' };

/** What to tell the owner for each way this can fail. */
export const ownDatabaseProblems: Record<Exclude<OwnDatabaseResult, { ok: true }>['reason'], string> = {
  not_set_up: 'اللوحة لسه مش متوصلة بنيون. ضيف NEON_API_KEY في إعدادات فيرسيل، أو حط لينك قاعدة جاهزة.',
  neon_refused: 'نيون رفض يعمل القاعدة. راجع إن المفتاح صح وإنك ما وصلتش لحد الخطة.',
  neon_unreachable: 'مقدرتش أوصل لنيون. جرّب تاني بعد شوية.',
  platform_unreachable: 'المنصة ما ردّتش. بيانات العميل زي ما هي، جرّب تاني.',
  bad_link: 'اللينك مش لينك قاعدة Postgres صحيح.',
  has_one: 'العميل ده عنده قاعدة خاصة بالفعل.',
  is_demo: 'ده حساب تجربة مؤقت، مش بيتعمله قاعدة.',
  database_unreachable: 'مقدرتش أفتح القاعدة الجديدة. بيانات العميل زي ما هي، جرّب تاني.',
  failed: 'النقل ما كملش. بيانات العميل لسه في مكانها، جرّب تاني.',
};

/**
 * Gives an account a database of its own. With no `pastedLink` a new one is
 * made at Neon; it is removed again if the customer's records could not be
 * moved, so nothing is left half done.
 */
export async function giveOwnDatabase(account: { id: string; slug: string }, pastedLink = ''): Promise<OwnDatabaseResult> {
  let database: { ref: string | null; link: string };
  if (pastedLink) database = { ref: null, link: pastedLink };
  else {
    if (!canCreateDatabases) return { ok: false, reason: 'not_set_up' };
    const created = await createAtNeon(`bt-${account.slug}`);
    if (created === 'refused') return { ok: false, reason: 'neon_refused' };
    if (created === 'unreachable') return { ok: false, reason: 'neon_unreachable' };
    database = created;
  }

  const response = await callPlatform(
    'database',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: account.id, link: database.link, ref: database.ref }) },
    50_000,
  );
  const answer = (await response?.json().catch(() => null)) as { ok?: boolean; rows?: number; reason?: string } | null;
  if (answer?.ok) return { ok: true, rows: answer.rows ?? 0 };

  // The new database is thrown away only when it is certain the customer is
  // not using it: the platform said so, and the account does not point at it.
  // With no answer the move may still be running, so it is left alone.
  if (!response || !answer) return { ok: false, reason: 'platform_unreachable' };
  const [now] = await query<{ moved: boolean }>('select database_url is not null as moved from accounts where id = $1', [account.id]);
  if (now?.moved) return answer.reason === 'has_one' && pastedLink ? { ok: false, reason: 'has_one' } : { ok: true, rows: 0 };
  if (database.ref) await removeAtNeon(database.ref);
  if (answer.reason === 'unreachable') return { ok: false, reason: 'database_unreachable' };
  if (answer.reason === 'bad_link' || answer.reason === 'has_one' || answer.reason === 'is_demo') return { ok: false, reason: answer.reason };
  return { ok: false, reason: 'failed' };
}
