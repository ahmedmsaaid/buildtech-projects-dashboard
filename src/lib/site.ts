/**
 * The platform's home page, as the owner sets it: its words, color and
 * picture, and its banners. The platform project reads these same tables
 * to draw the page (its lib/site.ts).
 */
import { newId, query } from './db';

export interface SiteSettings {
  accent: string;
  heroTitle: string;
  /** The part of the headline written in the brand color. */
  heroHighlight: string;
  heroLead: string;
  heroImageId: string | null;
  showPlans: boolean;
}

/** What the page says until the owner changes it. The platform keeps the same list. */
export const defaultSettings: SiteSettings = {
  accent: '#19c37d',
  heroTitle: 'نظام كامل لشغلك،',
  heroHighlight: 'جاهز من النهارده',
  heroLead: 'مش هتستنى شهور بناء. بتختار النظام اللي يناسب نشاطك، بنجهّزه باسمك وألوانك، وتبدأ تشتغل عليه.',
  heroImageId: null,
  showPlans: true,
};

export async function getSiteSettings(): Promise<SiteSettings> {
  const [row] = await query<{ content: Partial<SiteSettings> | string }>('select content from site_settings where id = 1');
  // The local development database hands JSON back as text.
  const saved = typeof row?.content === 'string' ? (JSON.parse(row.content) as Partial<SiteSettings>) : (row?.content ?? {});
  return { ...defaultSettings, ...saved };
}

export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  await query(
    `insert into site_settings (id, content) values (1, $1::jsonb)
     on conflict (id) do update set content = excluded.content, updated_at = now()`,
    [JSON.stringify(settings)],
  );
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

/** Pictures are kept in the database, so they must stay small. */
export const MAX_IMAGE_BYTES = 1_500_000;

/** The picture's real type, read from its first bytes rather than trusted from its name. Null for anything else. */
function imageType(bytes: Uint8Array): string | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  // "RIFF" then four bytes of size then "WEBP".
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export type UploadResult = { ok: true; id: string | null } | { ok: false; problem: string };

/**
 * Stores the picture chosen in a form's file field and returns its id.
 * An empty field is fine and returns a null id: no new picture was chosen.
 */
export async function storeUpload(form: FormData, field: string): Promise<UploadResult> {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) return { ok: true, id: null };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, problem: 'الصورة أكبر من 1.5 ميجا. صغّرها وجرّب تاني.' };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = imageType(bytes);
  if (!mime) return { ok: false, problem: 'الصورة لازم تكون JPG أو PNG أو WebP.' };

  const id = newId();
  await query(`insert into site_images (id, mime, data) values ($1, $2, decode($3, 'base64'))`, [id, mime, Buffer.from(bytes).toString('base64')]);
  return { ok: true, id };
}

/** Removes a picture that nothing shows any more. */
export async function deleteImage(id: string | null): Promise<void> {
  if (id) await query('delete from site_images where id = $1', [id]);
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

export interface Banner {
  id: string;
  title: string;
  body: string;
  link_url: string;
  link_label: string;
  image_id: string | null;
  is_active: boolean;
  sort_order: number;
}

export function listBanners(): Promise<Banner[]> {
  return query<Banner>('select id, title, body, link_url, link_label, image_id, is_active, sort_order from site_banners order by sort_order, created_at');
}

export async function getBanner(id: string): Promise<Banner | null> {
  const [banner] = await query<Banner>('select id, title, body, link_url, link_label, image_id, is_active, sort_order from site_banners where id = $1', [id]);
  return banner ?? null;
}

export async function saveBanner(banner: Omit<Banner, 'id'> & { id?: string }): Promise<void> {
  const values = [banner.title, banner.body, banner.link_url, banner.link_label, banner.image_id, banner.is_active, banner.sort_order];
  if (banner.id) {
    await query('update site_banners set title = $2, body = $3, link_url = $4, link_label = $5, image_id = $6, is_active = $7, sort_order = $8 where id = $1', [banner.id, ...values]);
    return;
  }
  await query('insert into site_banners (id, title, body, link_url, link_label, image_id, is_active, sort_order) values ($1, $2, $3, $4, $5, $6, $7, $8)', [newId(), ...values]);
}

export async function deleteBanner(banner: Banner): Promise<void> {
  await query('delete from site_banners where id = $1', [banner.id]);
  await deleteImage(banner.image_id);
}

/** A banner's button may go to a page of the platform (/login, #products) or to a web address. */
export function isSafeLink(url: string): boolean {
  return /^(https?:\/\/|\/|#)/.test(url);
}
