// Shared validation rules for accounts, identity and payments.
// Used by the browser (instant feedback) and the server (the real check),
// so both always agree (CC-173, CC-180, CC-182, CC-186, CC-187).

export type Role = "elder" | "caregiver" | "guardian";
export const ROLES: Role[] = ["elder", "caregiver", "guardian"];

/* ---------------- Names, phone, email, password ---------------- */

export function normName(s: string): { value?: string; error?: string } {
  const v = (s ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  if (!v) return { error: "Required" };
  if (v.length > 50) return { error: "Use 50 characters or fewer" };
  if (!/^\p{L}[\p{L}\p{M} .'’-]*$/u.test(v)) return { error: "Use letters, spaces, apostrophes or hyphens" };
  return { value: v };
}

/** US numbers only for now. Stored as +1XXXXXXXXXX. */
export function normPhone(s: string): { value?: string; error?: string } {
  let d = (s ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10 || /^[01]/.test(d)) return { error: "Enter a 10-digit US phone number" };
  return { value: `+1${d}` };
}

export const formatPhone = (e164: string) => {
  const d = e164.replace(/^\+1/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
};

export function normEmail(s: string): { value?: string; error?: string } {
  const v = (s ?? "").trim().toLowerCase();
  if (!v) return { error: "Required" };
  if (v.length > 254 || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/.test(v)) return { error: "Enter a valid email address" };
  return { value: v };
}

/** A short list of the most common passwords; the length rule does most of the work. */
const COMMON = new Set([
  "password1234", "password12345", "password123!", "123456789012", "qwertyuiop12", "iloveyou1234", "welcome12345", "letmein12345",
  "passwordpassword", "aaaaaaaaaaaa", "111111111111", "123412341234", "qwerty123456", "abc123abc123", "administrator", "changeme1234",
  "circlecare123", "circlecare2026", "trustno1trustno1", "football1234", "baseball1234", "sunshine1234", "princess1234", "monkey123456",
]);

export type PasswordRule = { id: "length" | "email" | "common"; label: string; ok: boolean };

export function passwordRules(pw: string, email = ""): PasswordRule[] {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const lower = pw.toLowerCase();
  return [
    { id: "length", label: "At least 12 characters", ok: pw.length >= 12 && pw.length <= 128 },
    { id: "email", label: "Doesn't contain your email name", ok: !(local.length >= 3 && lower.includes(local)) },
    { id: "common", label: "Isn't a common password", ok: pw.length > 0 && !COMMON.has(lower) && !/^(.)\1+$/.test(pw) },
  ];
}

/* ---------------- Social Security numbers (CC-180, CC-182) ---------------- */

const KNOWN_INVALID = new Set(["078051120", "219099999", "123456789", "987654320", "987654321", "987654322", "987654323", "987654324", "987654325", "987654326", "987654327", "987654328", "987654329"]);

export const ssnDigits = (s: string) => (s ?? "").replace(/\D/g, "");
export const formatSsnInput = (s: string) => {
  const d = ssnDigits(s).slice(0, 9);
  return d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
};

/**
 * `testData` = true in every non-production environment. The SSA has never
 * issued SSNs with area numbers 900–999, so outside production we accept ONLY
 * those — a real person's SSN can't be entered by mistake. Production does the
 * opposite.
 */
export function checkSsn(s: string, testData: boolean): { digits?: string; error?: string } {
  const d = ssnDigits(s);
  if (d.length !== 9) return { error: "Enter all 9 digits" };
  const area = +d.slice(0, 3), group = d.slice(3, 5), serial = d.slice(5);
  if (/^(\d)\1{8}$/.test(d) || KNOWN_INVALID.has(d)) return { error: "This isn't a valid Social Security number" };
  if (testData) {
    if (area < 900) return { error: "This is a test environment. Use a test SSN that starts with 9 (for example 900-12-3456)." };
    // The IRS issues real ITINs as 9XX-50–65, 70–88, 90–92 and 94–99, so those are refused too (review M3).
    const g = +group;
    if ((g >= 50 && g <= 65) || (g >= 70 && g <= 88) || (g >= 90 && g <= 92) || g >= 94) return { error: "This is a test environment. Use a test SSN that starts with 9 and has middle digits 01–49 (for example 900-12-3456)." };
    if (group === "00" || serial === "0000") return { error: "This isn't a valid Social Security number" };
    return { digits: d };
  }
  if (area === 0 || area === 666 || area >= 900 || group === "00" || serial === "0000") return { error: "This isn't a valid Social Security number" };
  return { digits: d };
}

export const maskSsn = (last4?: string | null) => (last4 ? `•••-••-${last4}` : "");

/* ---------------- Bank accounts (CC-186) ---------------- */

export const TEST_ROUTING = "110000000";

/** ABA routing checksum: 3·(d1+d4+d7) + 7·(d2+d5+d8) + (d3+d6+d9) ≡ 0 (mod 10). */
export function abaValid(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = routing.split("").map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0 && routing !== "000000000";
}

export interface BankInput { bankName: string; holderName: string; routingNumber: string; accountNumber: string; accountType: string }

export function checkBank(b: BankInput, testData: boolean): { errors: Partial<Record<keyof BankInput, string>> } {
  const errors: Partial<Record<keyof BankInput, string>> = {};
  const routing = (b.routingNumber ?? "").replace(/\D/g, "");
  const account = (b.accountNumber ?? "").replace(/\D/g, "");
  const bn = (b.bankName ?? "").trim();
  if (!bn || bn.length > 80 || /\d{5,}/.test(bn)) errors.bankName = "Enter your bank's name";
  if (normName(b.holderName ?? "").error) errors.holderName = "Enter the name on the account";
  if (!["checking", "savings"].includes(b.accountType)) errors.accountType = "Choose checking or savings";
  if (!abaValid(routing)) errors.routingNumber = "Enter a valid 9-digit routing number";
  else if (testData && routing !== TEST_ROUTING) errors.routingNumber = `This is a test environment. Use the test routing number ${TEST_ROUTING}.`;
  if (!/^\d{4,17}$/.test(account)) errors.accountNumber = "Account numbers are 4 to 17 digits";
  else if (testData && !account.startsWith("000")) errors.accountNumber = "This is a test environment. Use a test account number that starts with 000 (for example 000123456789).";
  return { errors };
}

/* ---------------- Cards (CC-187) ---------------- */

export type Brand = "visa" | "mastercard" | "amex" | "discover" | "unknown";
export const BRAND_LABEL: Record<Brand, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", unknown: "Card" };

export function luhn(pan: string): boolean {
  if (!/^\d{12,19}$/.test(pan)) return false;
  let sum = 0;
  for (let i = 0; i < pan.length; i++) {
    let n = +pan[pan.length - 1 - i];
    if (i % 2) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

export function cardBrand(pan: string): Brand {
  const d = pan.replace(/\D/g, "");
  if (/^4/.test(d)) return "visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(d)) return "mastercard";
  if (/^3[47]/.test(d)) return "amex";
  if (/^6(011|5|4[4-9])/.test(d)) return "discover";
  return "unknown";
}

/** Published processor test cards — the only cards accepted outside production. */
export const TEST_CARDS: Record<string, { brand: Brand; funding: "credit" | "debit"; label: string }> = {
  "4242424242424242": { brand: "visa", funding: "credit", label: "Visa credit" },
  "4000056655665556": { brand: "visa", funding: "debit", label: "Visa debit" },
  "5555555555554444": { brand: "mastercard", funding: "credit", label: "Mastercard credit" },
  "5200828282828210": { brand: "mastercard", funding: "debit", label: "Mastercard debit" },
  "378282246310005": { brand: "amex", funding: "credit", label: "American Express" },
  "6011111111111117": { brand: "discover", funding: "credit", label: "Discover" },
};

export const formatCardInput = (s: string) => {
  const d = s.replace(/\D/g, "").slice(0, 19);
  if (cardBrand(d) === "amex") return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(" ");
  return d.replace(/(\d{4})(?=\d)/g, "$1 ");
};

export interface CardInput { holderName: string; number: string; expMonth: number; expYear: number; cvc: string; postalCode: string }

export function checkCard(c: CardInput, testData: boolean, now = new Date()): { errors: Partial<Record<keyof CardInput, string>>; brand: Brand; funding: "credit" | "debit" | "unknown" } {
  const errors: Partial<Record<keyof CardInput, string>> = {};
  const pan = (c.number ?? "").replace(/\D/g, "");
  const brand = cardBrand(pan);
  if (normName(c.holderName ?? "").error) errors.holderName = "Enter the name on the card";
  if (!luhn(pan) || brand === "unknown") errors.number = "Enter a valid card number";
  else if (testData && !TEST_CARDS[pan]) errors.number = "This is a test environment. Use one of the test cards listed above.";
  const m = Number(c.expMonth), y = Number(c.expYear) < 100 ? 2000 + Number(c.expYear) : Number(c.expYear);
  if (!(m >= 1 && m <= 12) || !(y >= 2000 && y <= 2100)) errors.expMonth = "Enter the expiry as MM/YY";
  else if (y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth() + 1)) errors.expMonth = "This card has expired";
  const cvcLen = brand === "amex" ? 4 : 3;
  if (!new RegExp(`^\\d{${cvcLen}}$`).test(c.cvc ?? "")) errors.cvc = `Enter the ${cvcLen}-digit security code`;
  if (!/^\d{5}$/.test(c.postalCode ?? "")) errors.postalCode = "Enter a 5-digit ZIP code";
  const funding = TEST_CARDS[pan]?.funding ?? "unknown";
  return { errors, brand, funding };
}

/* ---------------- Masking (shared by the API, UI and audit export) ---------------- */

export const maskEmail = (e: string) => e.replace(/^(.)[^@]*/, "$1•••");
export const maskPhone = (p: string) => `(•••) •••-${p.slice(-4)}`;
export const maskName = (first: string, last: string) => `${first} ${last.slice(0, 1)}.`;
