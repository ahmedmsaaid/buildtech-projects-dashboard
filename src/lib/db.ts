/**
 * The one door to the database: the same Postgres database the platform
 * project uses. Its tables are created by that project (npm run migrate there).
 */
import postgres from 'postgres';

type Params = (string | number | boolean | null)[];

const databaseUrl = (import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL ?? '').trim();
const isLocalDatabase = /@(127.0.0.1|localhost)[:/]/.test(databaseUrl);

// Kept on globalThis so the dev server's reloads reuse one connection.
const shared = globalThis as { __dashboardDb?: ReturnType<typeof postgres>; __dashboardQueue?: Promise<unknown> };

export async function query<Row = Record<string, unknown>>(sql: string, params: Params = []): Promise<Row[]> {
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');
  // Supabase's pooler does not support prepared statements.
  shared.__dashboardDb ??= postgres(databaseUrl, { prepare: false, max: isLocalDatabase ? 1 : 3 });
  const run = async () => (await shared.__dashboardDb!.unsafe(sql, params)) as never as Row[];
  if (!isLocalDatabase) return run();

  // The platform's local demo database (development only) serves one
  // connection and garbles answers when several queries are sent at once,
  // so there they go one after another.
  const turn = (shared.__dashboardQueue ?? Promise.resolve()).then(run, run);
  shared.__dashboardQueue = turn.catch(() => {});
  return turn;
}

export function newId(): string {
  return crypto.randomUUID();
}
