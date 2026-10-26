// Browser client for the Circle Care API. Same-origin cookies only; every
// data-changing request carries the CSRF header the server requires (CC-174).

export class ApiError extends Error {
  constructor(public status: number, message: string, public field?: string, public fields?: Record<string, string>, public code?: string) {
    super(message);
  }
}

export const SESSION_EXPIRED_EVENT = "cc:session-expired";

type Opts = { method?: string; body?: unknown; raw?: Blob; rawType?: string };

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.raw ? "POST" : "GET");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") headers["X-Requested-With"] = "circle-care";
  let body: BodyInit | undefined;
  if (opts.raw) { body = opts.raw; headers["Content-Type"] = opts.rawType ?? opts.raw.type; }
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers["Content-Type"] = "application/json"; }

  let res: Response;
  try {
    res = await fetch(path, { method, headers, body, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "We couldn't reach Circle Care. Check your connection and try again.");
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON (e.g. static host without the API) */ }
  if (!res.ok) {
    if (res.status === 401 && data.code === "session_expired") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    const message = typeof data.error === "string" ? data.error : res.status === 404 ? "Accounts aren't available on this copy of the site." : "Something went wrong. Please try again.";
    throw new ApiError(res.status, message, data.field as string | undefined, data.fields as Record<string, string> | undefined, data.code as string | undefined);
  }
  return data as T;
}

/* ---------- Types shared with the server responses ---------- */

export type Role = "elder" | "caregiver" | "guardian";
export interface Me {
  id: string; role: Role; loginEmail: string; firstName: string; lastName: string; phone: string; email: string;
  ssnLast4: string | null; hasPhoto: boolean; profileStatus: "complete" | "incomplete"; missing: ("ssn" | "bank_account")[]; createdAt: string;
}
export interface AppConfig {
  env: string; testData: boolean; paymentProvider: string; achFeeCents: number;
  testValues?: { ssn: string; routingNumber: string; accountNumber: string; cards: { number: string; label: string }[] };
}
export interface BankAccount { id: string; bankName: string; holderName: string; accountType: "checking" | "savings"; accountLast4: string; routingLast4: string; achFeeCents: number; createdAt: string }
export interface Card { id: string; holderName: string; brand: string; brandLabel: string; funding: string; last4: string; expMonth: number; expYear: number; isPrimary: boolean; createdAt: string }
export interface PaymentMethods { bankAccount: BankAccount | null; cards: Card[]; fees: { achCents: number; note: string }; maxCards: number; promoted?: { brandLabel: string; last4: string } | null }
export interface ActivityEvent { at: string; action: string; text: string }
