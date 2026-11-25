/**
 * What this dashboard knows about the products on sale. It knows nothing by
 * itself: it asks the platform project, which owns the products, so a new
 * product appears here without any change to this code.
 *
 * Product-specific work (setting a new customer up, measuring usage) is also
 * done by the platform, through its private /internal routes.
 */

export interface ProductInfo {
  key: string;
  /** What one customer of this product is called, and the plural. */
  customer: string;
  customers: string;
  icon: 'pulse' | 'building';
  /** Where the customer's staff work, on the platform's address. */
  dashboardPath: string;
  /** Extra questions asked when a customer of this product is created. */
  setupFields: { name: string; label: string }[];
}

/** Where the platform project is published, with no trailing slash. */
export const platformUrl = (import.meta.env.PLATFORM_URL ?? process.env.PLATFORM_URL ?? '').trim().replace(/\/+$/, '');
const secret = (import.meta.env.INTERNAL_API_SECRET ?? process.env.INTERNAL_API_SECRET ?? '').trim();

async function callPlatform(route: string, init: RequestInit = {}): Promise<Response | null> {
  if (!platformUrl || !secret) return null;
  try {
    return await fetch(`${platformUrl}/internal/${route}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }
}

export interface ProductCatalogue {
  products: Record<string, ProductInfo>;
  productList: ProductInfo[];
  /** False when the platform could not be reached; pages say so instead of failing. */
  reachable: boolean;
}

// The list changes only when the platform is redeployed, so it is asked for at most once a minute.
let cached: { at: number; catalogue: ProductCatalogue } | null = null;

export async function loadProducts(): Promise<ProductCatalogue> {
  if (cached && Date.now() - cached.at < 60_000) return cached.catalogue;

  const response = await callPlatform('products');
  if (!response?.ok) return { products: {}, productList: [], reachable: false };

  const productList = ((await response.json()) as ProductInfo[]).map((product) => ({
    ...product,
    icon: product.icon === 'pulse' ? ('pulse' as const) : ('building' as const),
  }));
  const catalogue = { products: Object.fromEntries(productList.map((product) => [product.key, product])), productList, reachable: true };
  cached = { at: Date.now(), catalogue };
  return catalogue;
}

/** Stands in for a product the platform did not report, so an account's page still opens. */
export function fallbackProduct(key: string): ProductInfo {
  return { key, customer: key, customers: key, icon: 'building', dashboardPath: '/login', setupFields: [] };
}

/** Asks the platform to create a new account's product records. False when it could not. */
export async function setUpAccount(accountId: string, answers: Record<string, string>): Promise<boolean> {
  const response = await callPlatform('setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId, answers }),
  });
  return response?.ok === true;
}

/** A few figures showing how much an account uses its product. Empty when the platform cannot be reached. */
export async function fetchUsage(accountId: string, since: string): Promise<{ label: string; value: string }[]> {
  const response = await callPlatform(`usage?id=${encodeURIComponent(accountId)}&since=${since}`);
  return response?.ok ? ((await response.json()) as { label: string; value: string }[]) : [];
}
