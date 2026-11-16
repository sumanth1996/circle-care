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
  /** CC-200: an authenticator app is set up. Required for guardians and caregivers. */
  mfaEnrolled: boolean;
}
export interface AppConfig {
  env: string; testData: boolean; paymentProvider: string; achFeeCents: number;
  testValues?: { ssn: string; routingNumber: string; accountNumber: string; cards: { number: string; label: string }[] };
}
export interface BankAccount { id: string; bankName: string; holderName: string; accountType: "checking" | "savings"; accountLast4: string; routingLast4: string; achFeeCents: number; createdAt: string }
export interface Card { id: string; holderName: string; brand: string; brandLabel: string; funding: string; last4: string; expMonth: number; expYear: number; isPrimary: boolean; createdAt: string }
export interface PaymentMethods { bankAccount: BankAccount | null; cards: Card[]; fees: { achCents: number; note: string }; maxCards: number; promoted?: { brandLabel: string; last4: string } | null }
export interface ActivityEvent { at: string; action: string; text: string }

/* ---------- Sign-in security (CC-200, CC-201) ---------- */

/** Who is signed in, even before the second step is set up. */
export interface AuthUser { id: string; role: Role; email: string; mfaEnrolled: boolean; mfaRequired: boolean }
/** A correct password either signs in, or (with two-step sign-in on) asks for a code. */
export type SignInResult = { user: { id: string; role: Role } } | { mfaRequired: true; challenge: string; expiresInSeconds: number };
export interface MfaSetup { secret: string; otpauthUri: string; issuer: string; account: string }

/** Error code the server sends when a guardian or caregiver must set up two-step sign-in first. */
export const MFA_ENROLMENT_REQUIRED = "mfa_enrolment_required";

export const auth = {
  me: () => api<{ user: AuthUser }>("/api/auth/me"),
  signIn: (email: string, password: string) => api<SignInResult>("/api/auth/signin", { body: { email, password } }),
  /** Send either the 6-digit code or a recovery code with the challenge from signIn(). */
  verify: (challenge: string, answer: { code: string } | { recoveryCode: string }) =>
    api<{ user: { id: string; role: Role }; recoveryCodesLeft?: number }>("/api/auth/mfa/verify", { body: { challenge, ...answer } }),
  startSetup: () => api<MfaSetup>("/api/auth/mfa/enrol/start", { method: "POST", body: {} }),
  confirmSetup: (code: string) => api<{ recoveryCodes: string[] }>("/api/auth/mfa/enrol/confirm", { body: { code } }),
  signOutEverywhere: () => api<{ sessionsEnded: number }>("/api/auth/signout-everywhere", { method: "POST", body: {} }),
  changePassword: (currentPassword: string, newPassword: string) => api<{ otherSessionsEnded: number }>("/api/auth/password", { body: { currentPassword, newPassword } }),
  requestReset: (email: string) => api<{ message: string }>("/api/auth/password-reset/request", { body: { email } }),
  confirmReset: (token: string, password: string) => api<{ ok: true }>("/api/auth/password-reset/confirm", { body: { token, password } }),
};
