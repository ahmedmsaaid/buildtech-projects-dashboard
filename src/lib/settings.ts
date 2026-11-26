/**
 * Choices about the platform as a whole that the owner makes here, kept one
 * per row in the platform_settings table.
 */
import { query } from './db';

/** How long a new customer's trial lasts until the owner says otherwise. */
const FIRST_TRIAL_DAYS = 14;
export const MAX_TRIAL_DAYS = 365;

/** How many days a new customer may try a product before paying, unless another number is given for them. */
export async function getTrialDays(): Promise<number> {
  const [row] = await query<{ value: string }>("select value from platform_settings where key = 'trial_days'");
  const days = Number(row?.value);
  return row && Number.isInteger(days) && days >= 0 && days <= MAX_TRIAL_DAYS ? days : FIRST_TRIAL_DAYS;
}

export async function setTrialDays(days: number): Promise<void> {
  await query("insert into platform_settings (key, value) values ('trial_days', $1) on conflict (key) do update set value = excluded.value", [String(days)]);
}
