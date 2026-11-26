/**
 * The owner's audit trail: what happened on the platform and who did it.
 * Events are only ever added, never changed.
 */
import { newId, query } from './db';

export const eventLabels = {
  account_created: 'عميل جديد',
  account_suspended: 'إيقاف عميل',
  account_activated: 'تفعيل عميل',
  subscription_changed: 'تعديل اشتراك',
  payment_recorded: 'تسجيل دفعة',
  password_reset: 'كلمة سر جديدة',
  dashboard_opened: 'دخول لوحة عميل',
  plan_saved: 'تعديل خطة',
  database_given: 'قاعدة بيانات خاصة',
  link_changed: 'لينك خاص للعميل',
  site_changed: 'تعديل الصفحة الرئيسية',
  owner_signed_in: 'دخول لوحة المنصة',
} as const;

export type EventAction = keyof typeof eventLabels;

export interface PlatformEvent {
  id: string;
  created_at: string | Date;
  actor: string;
  account_id: string | null;
  account_name: string;
  action: EventAction;
  detail: string;
}

export async function recordEvent(event: {
  actor: string;
  action: EventAction;
  account?: { id: string; name: string } | null;
  detail?: string;
}): Promise<void> {
  await query('insert into events (id, actor, account_id, account_name, action, detail) values ($1, $2, $3, $4, $5, $6)', [
    newId(),
    event.actor,
    event.account?.id ?? null,
    event.account?.name ?? '',
    event.action,
    event.detail ?? '',
  ]);
}

/** The most recent events, newest first; for one account when given. */
export function listEvents(options: { accountId?: string; limit?: number } = {}): Promise<PlatformEvent[]> {
  return query<PlatformEvent>(
    `select id, created_at, actor, account_id, account_name, action, detail from events
     where $1::text is null or account_id = $1
     order by created_at desc
     limit $2`,
    [options.accountId ?? null, options.limit ?? 100],
  );
}
