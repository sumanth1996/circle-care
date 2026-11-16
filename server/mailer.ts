// Account email (CC-201). A small Mailer interface so a real provider can be
// plugged in later. No provider is integrated yet — that is a human step
// before launch (choosing a vendor, a signed BAA if a message could ever touch
// care information, SPF/DKIM for the sending domain).
//
//   development  OutboxMailer that also prints each message to the console,
//                so a developer can open a reset link locally.
//   test/staging OutboxMailer that keeps messages in memory only (tests read it).
//   production   NoProviderMailer: nothing is sent. The server records that
//                delivery isn't configured (audit event + a log line that never
//                contains the message, the link or the address).

import { audit } from "./audit";
import type { Config } from "./config";
import type { Queryable } from "./db";

export type MailKind = "password_reset" | "password_changed" | "account_locked" | "mfa_locked"
  | "mfa_reset_confirm" | "mfa_reset_started" | "mfa_reset_cancelled" | "mfa_reset_done";

export interface MailMessage {
  kind: MailKind;
  to: string;
  subject: string;
  text: string;
  /** The account the message is about, for the audit trail when it can't be delivered. */
  userId?: string;
}

export interface Mailer {
  /** False when no email provider is configured: send() must not be called. */
  readonly configured: boolean;
  send(m: MailMessage): Promise<void>;
}

/** Keeps messages in memory (newest last). Never used in production. */
export class OutboxMailer implements Mailer {
  readonly configured = true;
  readonly messages: MailMessage[] = [];
  constructor(private readonly printToConsole = false) {}
  async send(m: MailMessage) {
    this.messages.push(m);
    if (this.messages.length > 500) this.messages.shift();
    // Development only: production never gets this mailer, so tokens never reach a production log.
    if (this.printToConsole) console.log(`[mail:dev] to ${m.to} — ${m.subject}\n${m.text}\n`);
  }
  /** The newest message to an address, optionally of one kind (tests). */
  last(to: string, kind?: MailKind) {
    return [...this.messages].reverse().find((m) => m.to === to && (!kind || m.kind === kind));
  }
}

/** Production until a provider is connected. */
export class NoProviderMailer implements Mailer {
  readonly configured = false;
  async send(): Promise<void> { throw new Error("No email provider is configured"); }
}

export function createMailer(cfg: Config): Mailer {
  if (cfg.mailer === "none") return new NoProviderMailer();
  return new OutboxMailer(cfg.env === "development");
}

/**
 * Sends a message, or records that it couldn't be sent. Delivery failures are
 * logged by kind only — never the address, link or body.
 */
export async function deliver(q: Queryable, mailer: Mailer, m: MailMessage, now: Date) {
  if (!mailer.configured) {
    await audit(q, { action: "email.undeliverable", actor: null, subject: m.userId ?? null, detail: { kind: m.kind, reason: "no_provider" }, at: now });
    console.warn(`[mail] no email provider is configured; a ${m.kind} message was not sent`);
    return;
  }
  try {
    await mailer.send(m);
  } catch (e) {
    await audit(q, { action: "email.undeliverable", actor: null, subject: m.userId ?? null, detail: { kind: m.kind, reason: "send_failed" }, at: now });
    console.error(`[mail] a ${m.kind} message could not be sent:`, e instanceof Error ? e.message : "unknown");
  }
}

/* ---------------- Messages ---------------- */

const SIGNATURE = "\n\n— Circle Care\nYou're receiving this because of activity on your Circle Care account. We'll never ask for your password or a sign-in code by email.";

export const messages = {
  passwordReset: (to: string, link: string, userId: string): MailMessage => ({
    kind: "password_reset", to, userId,
    subject: "Reset your Circle Care password",
    text: `Someone asked to reset the password for this Circle Care account. If it was you, open this link within 30 minutes:\n\n${link}\n\nThe link works once. If you didn't ask, you can ignore this email — your password hasn't changed.${SIGNATURE}`,
  }),
  passwordChanged: (to: string, userId: string, how: "changed" | "reset"): MailMessage => ({
    kind: "password_changed", to, userId,
    subject: "Your Circle Care password was " + how,
    text: `The password for your Circle Care account was just ${how}, and ${how === "reset" ? "every device was" : "your other devices were"} signed out. If this wasn't you, reset your password straight away and contact support.${SIGNATURE}`,
  }),
  accountLocked: (to: string, userId: string, minutes: number): MailMessage => ({
    kind: "account_locked", to, userId,
    subject: "We paused sign-in to your Circle Care account",
    text: `There were 5 sign-in attempts with the wrong password, so we paused sign-in for ${minutes} minutes. Devices that were already signed in stay signed in.\n\nIf this was you, wait ${minutes} minutes and try again, or reset your password. If it wasn't, reset your password once the pause ends.${SIGNATURE}`,
  }),
  mfaLocked: (to: string, userId: string, minutes: number): MailMessage => ({
    kind: "mfa_locked", to, userId,
    subject: "Someone entered wrong sign-in codes for your Circle Care account",
    text: `Your password was entered correctly, but then 5 wrong two-step sign-in codes. We've stopped accepting codes for ${minutes} minutes.\n\nIf this wasn't you, someone may know your password: change it as soon as you can.${SIGNATURE}`,
  }),
  // CC-235: getting back in after losing the authenticator and every recovery code.
  mfaResetConfirm: (to: string, link: string, userId: string, waitHours: number): MailMessage => ({
    kind: "mfa_reset_confirm", to, userId,
    subject: "Confirm resetting two-step sign-in for Circle Care",
    text: `Someone entered your password and said they lost their phone and recovery codes. If it was you, open this link within 30 minutes to start a ${waitHours}-hour wait, after which you can set up two-step sign-in again:\n\n${link}\n\nThe link works once. If it wasn't you, don't open it, and change your password: someone knows it.${SIGNATURE}`,
  }),
  mfaResetStarted: (to: string, userId: string, readyAt: string, cancelLink: string): MailMessage => ({
    kind: "mfa_reset_started", to, userId,
    subject: "Two-step sign-in for Circle Care can be reset after a wait",
    text: `The reset of two-step sign-in was confirmed. From ${readyAt} you can sign in with your password and set it up again on a new phone. Until then, nothing changes.\n\nIf this wasn't you, cancel it now and then change your password:\n\n${cancelLink}\n\nYou can also cancel it from My account on any device where you're still signed in.${SIGNATURE}`,
  }),
  mfaResetCancelled: (to: string, userId: string): MailMessage => ({
    kind: "mfa_reset_cancelled", to, userId,
    subject: "The reset of two-step sign-in was cancelled",
    text: `The waiting reset of two-step sign-in for your Circle Care account was cancelled. Your authenticator app and recovery codes keep working as before.${SIGNATURE}`,
  }),
  mfaResetDone: (to: string, userId: string): MailMessage => ({
    kind: "mfa_reset_done", to, userId,
    subject: "Two-step sign-in was reset for your Circle Care account",
    text: `Two-step sign-in was reset after the waiting period, and every device was signed out. The old authenticator app and recovery codes no longer work. Set up two-step sign-in again the next time you sign in.\n\nIf this wasn't you, reset your password straight away and contact support.${SIGNATURE}`,
  }),
};
