/** An account is one customer of one product. The shape matches the platform project's accounts table. */
import { query } from './db';

export interface Account {
  id: string;
  /** Which product this customer uses: a key the platform reports (see products.ts). */
  product: string;
  slug: string;
  name: string;
  status: 'active' | 'suspended';
  /** Null while the account is still on its free trial. */
  plan_id: string | null;
  /** What the customer pays per period, in whole pounds. */
  price: number;
  period_months: number;
  /** Last day the subscription or trial covers, or null when never set. */
  paid_until: string | null;
  contact_name: string;
  contact_phone: string;
  owner_note: string;
  /** The customer's own web address, or null when they only have the shared one. */
  domain: string | null;
}

export const ACCOUNT_COLUMNS = `accounts.id, accounts.product, accounts.slug, accounts.name, accounts.status, accounts.plan_id, accounts.price,
  accounts.period_months, accounts.paid_until, accounts.contact_name, accounts.contact_phone, accounts.owner_note, accounts.domain`;

export async function getAccountById(id: string): Promise<Account | null> {
  const [account] = await query<Account>(`select ${ACCOUNT_COLUMNS} from accounts where id = $1`, [id]);
  return account ?? null;
}
