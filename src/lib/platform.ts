/**
 * Every account of every product, the plans on offer, subscriptions and
 * payments, and the accounts' sign-ins. None of this is limited to one
 * account, which is why it lives in the owner's dashboard and nowhere else.
 */
import { randomBytes } from 'node:crypto';
import { ACCOUNT_COLUMNS, type Account } from './accounts';
import { newId, query } from './db';
import { generatePassword, hashPassword, hashToken } from './passwords';
import { fetchUsage, loadProducts, setUpAccount } from './products';
import { addDays, addMonths, daysBetween } from './time';

/** How long a new account may try a product before it has to pay. */
const TRIAL_DAYS = 14;

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface Plan {
  id: string;
  product: string;
  name: string;
  months: number;
  price: number;
  sort_order: number;
  is_active: boolean;
}

export function listPlans(options: { product?: string; includeRetired?: boolean } = {}): Promise<Plan[]> {
  return query<Plan>(
    `select id, product, name, months, price, sort_order, is_active from plans
     where ($1::text is null or product = $1) and ($2 or is_active)
     order by product, is_active desc, sort_order, months`,
    [options.product ?? null, options.includeRetired ?? false],
  );
}

export async function savePlan(plan: Omit<Plan, 'id' | 'sort_order'> & { id?: string }): Promise<void> {
  if (plan.id) {
    await query('update plans set name = $2, months = $3, price = $4, is_active = $5 where id = $1', [plan.id, plan.name, plan.months, plan.price, plan.is_active]);
    return;
  }
  await query(
    `insert into plans (id, product, name, months, price, is_active, sort_order)
     values ($1, $2, $3, $4, $5, $6, (select coalesce(max(sort_order), 0) + 1 from plans where product = $2))`,
    [newId(), plan.product, plan.name, plan.months, plan.price, plan.is_active],
  );
}

// ---------------------------------------------------------------------------
// Subscription state
// ---------------------------------------------------------------------------

export type SubscriptionState = 'suspended' | 'expired' | 'expiring' | 'trial' | 'active';

/** Where an account's subscription stands today. "Expiring" means a week or less is left. */
export function subscriptionState(account: Pick<Account, 'status' | 'paid_until' | 'plan_id'>, today: string): SubscriptionState {
  if (account.status === 'suspended') return 'suspended';
  if (!account.paid_until || account.paid_until < today) return 'expired';
  if (daysBetween(today, account.paid_until) <= 7) return 'expiring';
  return account.plan_id ? 'active' : 'trial';
}

export const stateLabels: Record<SubscriptionState, string> = {
  suspended: 'موقوف',
  expired: 'الاشتراك منتهي',
  expiring: 'قرّب ينتهي',
  trial: 'تجربة',
  active: 'شغّال',
};

/** Badge colors reuse the status ones: green for fine, amber for soon, red for a problem. */
export const stateTone: Record<SubscriptionState, string> = {
  active: 'done',
  trial: 'booked',
  expiring: 'arrived',
  expired: 'no_show',
  suspended: 'cancelled',
};

/** What the paying, active accounts are worth per month, with longer plans spread over their months. */
export function monthlyValue(accounts: Pick<Account, 'status' | 'plan_id' | 'price' | 'period_months'>[]): number {
  return Math.round(
    accounts.filter((account) => account.status === 'active' && account.plan_id).reduce((sum, account) => sum + account.price / account.period_months, 0),
  );
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface AccountRow extends Account {
  plan_name: string | null;
  staff_count: number;
  created_at: string | Date;
}

/** Every account with its plan's name, newest first. */
export function listAccounts(search: string): Promise<AccountRow[]> {
  return query<AccountRow>(
    `select ${ACCOUNT_COLUMNS}, accounts.created_at, plans.name as plan_name,
       (select count(*)::int from users where users.account_id = accounts.id) as staff_count
     from accounts left join plans on plans.id = accounts.plan_id
     where $1 = '' or accounts.name ilike '%' || $1 || '%' or accounts.slug ilike '%' || $1 || '%' or accounts.contact_name ilike '%' || $1 || '%'
     order by accounts.created_at desc`,
    [search],
  );
}

export interface NewAccount {
  product: string;
  slug: string;
  name: string;
  contactName: string;
  contactPhone: string;
  staffEmail: string;
  /** Null starts the account on the free trial with no plan chosen yet. */
  planId: string | null;
  /** The product's own setup questions, by field name. */
  answers: Record<string, string>;
}

export type CreateAccountResult =
  | { ok: true; accountId: string; password: string }
  | { ok: false; reason: 'slug_taken' | 'email_taken' | 'unknown_product' | 'unknown_plan' | 'platform_unreachable' };

/**
 * Creates an account that is ready to use: the account itself, whatever its
 * product needs, and a first sign-in. It starts on a free trial. Returns the
 * sign-in's password, which exists nowhere else, so the caller must show it once.
 */
export async function createAccount(input: NewAccount, today: string): Promise<CreateAccountResult> {
  const product = (await loadProducts()).products[input.product];
  if (!product) return { ok: false, reason: 'unknown_product' };

  const plan = input.planId ? (await listPlans({ product: product.key })).find((candidate) => candidate.id === input.planId) : null;
  if (input.planId && !plan) return { ok: false, reason: 'unknown_plan' };

  const [slugTaken] = await query('select 1 from accounts where slug = $1', [input.slug]);
  if (slugTaken) return { ok: false, reason: 'slug_taken' };
  const [emailTaken] = await query('select 1 from users where email = $1', [input.staffEmail]);
  if (emailTaken) return { ok: false, reason: 'email_taken' };

  const accountId = newId();
  const password = generatePassword();

  await query(
    `insert into accounts (id, product, slug, name, plan_id, price, period_months, paid_until, contact_name, contact_phone)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [accountId, product.key, input.slug, input.name, plan?.id ?? null, plan?.price ?? 0, plan?.months ?? 1, addDays(today, TRIAL_DAYS), input.contactName, input.contactPhone],
  );
  // Only the platform knows what a clinic or a restaurant needs to start with.
  // If it cannot be reached, the half-made account is removed rather than left unusable.
  if (!(await setUpAccount(accountId, input.answers))) {
    await query('delete from accounts where id = $1', [accountId]);
    return { ok: false, reason: 'platform_unreachable' };
  }
  await query('insert into users (id, account_id, email, password_hash, name) values ($1, $2, $3, $4, $5)', [
    newId(),
    accountId,
    input.staffEmail,
    hashPassword(password),
    input.contactName,
  ]);

  return { ok: true, accountId, password };
}

export async function setAccountStatus(accountId: string, status: Account['status']): Promise<void> {
  await query('update accounts set status = $2 where id = $1', [accountId, status]);
  // Suspending signs the account's staff out at once.
  if (status === 'suspended') await query('delete from sessions where user_id in (select id from users where account_id = $1)', [accountId]);
}

export interface SubscriptionDetails {
  /** Null keeps the account without a plan (trial). */
  planId: string | null;
  /** When null, the plan's own price is used. */
  price: number | null;
  paid_until: string | null;
  contact_name: string;
  contact_phone: string;
  owner_note: string;
}

/** Changes an account's plan, price and contact details. Returns false for a plan of another product. */
export async function updateSubscription(account: Account, details: SubscriptionDetails): Promise<boolean> {
  const plan = details.planId ? (await listPlans({ product: account.product, includeRetired: true })).find((candidate) => candidate.id === details.planId) : null;
  if (details.planId && !plan) return false;

  await query(
    `update accounts set plan_id = $2, price = $3, period_months = $4, paid_until = $5, contact_name = $6, contact_phone = $7, owner_note = $8
     where id = $1`,
    [account.id, plan?.id ?? null, details.price ?? plan?.price ?? 0, plan?.months ?? 1, details.paid_until, details.contact_name, details.contact_phone, details.owner_note],
  );
  return true;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface Payment {
  id: string;
  amount: number;
  paid_on: string;
  covers_until: string;
  note: string;
}

/**
 * Records a payment and extends the subscription by a number of months.
 * The new period starts where the old one ends, or today if it had lapsed,
 * so an account that pays early loses nothing and one that pays late gets a full period.
 */
export async function recordPayment(account: Account, amount: number, months: number, note: string, today: string): Promise<string> {
  const from = account.paid_until && account.paid_until > today ? account.paid_until : today;
  const coversUntil = addMonths(from, months);

  await query('insert into subscription_payments (id, account_id, amount, paid_on, covers_until, note) values ($1, $2, $3, $4, $5, $6)', [
    newId(),
    account.id,
    amount,
    today,
    coversUntil,
    note,
  ]);
  await query('update accounts set paid_until = $2 where id = $1', [account.id, coversUntil]);
  return coversUntil;
}

export function listPayments(accountId: string): Promise<Payment[]> {
  return query<Payment>(
    'select id, amount, paid_on, covers_until, note from subscription_payments where account_id = $1 order by paid_on desc, created_at desc',
    [accountId],
  );
}

/** Money received from subscriptions since a day, per product. */
export async function getIncomeByProduct(since: string): Promise<Map<string, number>> {
  const rows = await query<{ product: string; total: number }>(
    `select accounts.product, coalesce(sum(subscription_payments.amount), 0)::int as total
     from subscription_payments join accounts on accounts.id = subscription_payments.account_id
     where subscription_payments.paid_on >= $1
     group by accounts.product`,
    [since],
  );
  return new Map(rows.map((row) => [row.product, row.total]));
}

// ---------------------------------------------------------------------------
// Staff sign-ins
// ---------------------------------------------------------------------------

export interface StaffAccount {
  id: string;
  email: string;
  name: string;
}

export function listStaff(accountId: string): Promise<StaffAccount[]> {
  return query<StaffAccount>('select id, email, name from users where account_id = $1 order by email', [accountId]);
}

/** Replaces a sign-in's password and signs it out everywhere. Returns the new password to show once. */
export async function resetStaffPassword(accountId: string, userId: string): Promise<string | null> {
  const password = generatePassword();
  const updated = await query<{ id: string }>('update users set password_hash = $3 where account_id = $1 and id = $2 returning id', [
    accountId,
    userId,
    hashPassword(password),
  ]);
  if (updated.length === 0) return null;

  await query('delete from sessions where user_id = $1', [userId]);
  return password;
}

/** How much an account is being used, in its product's own terms. */
export function getUsage(account: Account, since: string): Promise<{ label: string; value: string }[]> {
  return fetchUsage(account.id, since);
}

/**
 * Makes a one-use pass that signs a browser in to a customer's dashboard as
 * the given staff account. The customer dashboards are on the platform's
 * address, so this dashboard cannot set their sign-in cookie itself: it
 * leaves the pass in the database and sends the browser to the platform with it.
 * The pass lasts a minute and works once.
 */
export async function createDashboardPass(userId: string): Promise<string> {
  const pass = randomBytes(32).toString('hex');
  await query("insert into dashboard_passes (token_hash, user_id, expires_at) values ($1, $2, now() + interval '1 minute')", [hashToken(pass), userId]);
  return pass;
}
