// Sprint 27 "Circle Messages": pin a note (CC-249), see who has read it (CC-250), edit or take back a message
// (CC-251), send later (CC-252), mute the chat for a day (CC-253), read new messages aloud to Maggie (CC-254),
// search the chat (CC-255) and a demo scenario with labelled dummy profiles (CC-256).
// Pure state changes and selectors, so the screens, the rules engine and the tests share one answer.

import type { ChatMessage, ScheduledMessage, State } from "./types";
import { allowed, audit, pushAlert } from "./store";
import { CHAT_MAX, chatAudience, chatMembers, chatMessages, chatMutedUntil, inChat } from "./everyday";
import { clock, nameOf, member } from "./selectors";
import { ELDER, GUARDIAN, FAMILY } from "./demo";
import { DEMO_LABEL } from "./saferDoses";
import { addDays, at as atTime, uid, ymd } from "../lib/time";

const minutesSince = (s: State, iso: string) => (clock(s).getTime() - new Date(iso).getTime()) / 60000;
const now = (s: State) => clock(s).toISOString();
const valid = (text: string) => { const t = text.trim(); return t && t.length <= CHAT_MAX ? t : ""; };
const find = (s: State, id: string) => s.chat.messages.find((m) => m.id === id);

/** "Ana, James and Maggie" */
export const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** What a message shows: its words, or who took it back (CC-251). */
export const messageText = (s: State, m: ChatMessage) => (m.removedAt ? `Message removed by ${nameOf(s, m.removedBy ?? m.by)}` : m.text);

/* ---------- CC-251: edit or take back within 5 minutes ---------- */

export const EDIT_MIN = 5;

/** Only the sender, only within 5 minutes, and never once it's taken back. */
export const canChange = (s: State, who: string, m: ChatMessage) => {
  const age = minutesSince(s, m.at);
  return who === m.by && !m.removedAt && age >= 0 && age < EDIT_MIN;
};

/** Minutes left to edit or take back, rounded up (0 when gone). */
export const changeLeft = (s: State, m: ChatMessage) => Math.max(0, Math.ceil(EDIT_MIN - minutesSince(s, m.at)));

/**
 * The new words replace the old ones and the message shows "edited". The earlier text isn't kept anywhere: the
 * audit log records only who edited and when (PO decision, Nov 20 2026).
 */
export function editChat(s: State, by: string, id: string, text: string) {
  const m = find(s, id);
  const t = valid(text);
  if (!m || !t) return false;
  if (!canChange(s, by, m)) { audit(s, by, "denied", "edit a family chat message"); return false; }
  if (!allowed(s, by, "write", "chat")) return false;
  if (t === m.text) return false;
  m.text = t;
  m.editedAt = now(s);
  delete m.via; // the words weren't all spoken any more
  audit(s, by, "updated", "a family chat message (edited; the earlier text isn't kept)");
  return true;
}

/**
 * Others see "Message removed by Sarah". The text is cleared and isn't kept anywhere, the audit log included:
 * the log records only who took it back and when. A pinned message is unpinned, and search no longer finds it.
 */
export function takeBack(s: State, by: string, id: string) {
  const m = find(s, id);
  if (!m) return false;
  if (!canChange(s, by, m)) { audit(s, by, "denied", "take back a family chat message"); return false; }
  if (!allowed(s, by, "write", "chat")) return false;
  m.text = "";
  m.removedAt = now(s);
  m.removedBy = by;
  delete m.via; delete m.editedAt; delete m.pinnedAt; delete m.pinnedBy;
  audit(s, by, "removed", "a family chat message (taken back; the text isn't kept)");
  return true;
}

/* ---------- CC-249: pinned notes ---------- */

export const PIN_MAX = 3;

/** Only Maggie and Sarah pin, so a caregiver can't change what the family sees first. */
export const canPin = (who: string) => who === ELDER || who === GUARDIAN;

/** Pinned notes this person can see, oldest pin first. */
export const pinnedNotes = (s: State, viewer?: string) =>
  chatMessages(s, viewer).filter((m) => m.pinnedAt && !m.removedAt).sort((a, b) => a.pinnedAt!.localeCompare(b.pinnedAt!));

/** True when 3 are pinned, so a fourth needs one of them unpinned first. */
export const pinsFull = (s: State) => pinnedNotes(s).length >= PIN_MAX;

/** Pins a message. When 3 are already pinned, `replaceId` names the one to unpin; without it nothing changes. */
export function pinMessage(s: State, by: string, id: string, replaceId?: string) {
  const m = find(s, id);
  if (!m || m.removedAt || m.pinnedAt) return false;
  if (!canPin(by)) { audit(s, by, "denied", "pin a note in the family chat"); return false; }
  if (!allowed(s, by, "write", "chat")) return false;
  if (!chatMessages(s, by).some((x) => x.id === id)) return false;
  if (pinsFull(s)) {
    const out = pinnedNotes(s).find((x) => x.id === replaceId);
    if (!out) return false;
    delete out.pinnedAt; delete out.pinnedBy;
  }
  m.pinnedAt = now(s);
  m.pinnedBy = by;
  audit(s, by, "created", `a pinned note in the family chat${replaceId ? " (replacing an older one)" : ""}`);
  return true;
}

export function unpinMessage(s: State, by: string, id: string) {
  const m = find(s, id);
  if (!m?.pinnedAt) return false;
  if (!canPin(by)) { audit(s, by, "denied", "unpin a note in the family chat"); return false; }
  delete m.pinnedAt; delete m.pinnedBy;
  audit(s, by, "removed", "a pinned note in the family chat");
  return true;
}

/* ---------- CC-250: who has seen a pinned note ---------- */

/** Whether Maggie lets others see when she has read (CC-250). On unless she turns it off. */
export const elderShowsRead = (s: State) => s.settings.elderShowsRead !== false;

/**
 * Who has seen a pinned note, read from when each person last opened the chat. Maggie shows as "not shared",
 * never as unread, when she turned off "Show when I've read". The sender has seen their own words, so isn't listed,
 * and a caregiver who joined after the message was sent can't see it, so isn't listed either.
 */
export function seenBy(s: State, m: ChatMessage) {
  const seen: string[] = [], notYet: string[] = [], notShared: string[] = [];
  for (const p of chatMembers(s)) {
    if (p.id === m.by || (s.chat.joinedAt[p.id] ?? "") > m.at) continue;
    if (p.id === ELDER && !elderShowsRead(s)) { notShared.push(p.short); continue; }
    ((s.chat.readAt[p.id] ?? "") >= m.at ? seen : notYet).push(p.short);
  }
  return { seen, notYet, notShared };
}

/** "Seen by Ana, James. Not yet: Maggie" */
export function seenLine(s: State, m: ChatMessage) {
  const { seen, notYet, notShared } = seenBy(s, m);
  const parts = [seen.length ? `Seen by ${listNames(seen)}` : "Not seen yet"];
  if (notYet.length && seen.length) parts.push(`Not yet: ${listNames(notYet)}`);
  for (const n of notShared) parts.push(`${n}: not shared`);
  return parts.join(". ");
}

/** The ordinary "Read by" under your last message leaves Maggie out when she isn't sharing that (CC-250). */
export function readByNames(s: State, m: ChatMessage) {
  return chatMembers(s)
    .filter((p) => p.id !== m.by && !(p.id === ELDER && !elderShowsRead(s)) && (s.chat.joinedAt[p.id] ?? "") <= m.at && (s.chat.readAt[p.id] ?? "") >= m.at)
    .map((p) => p.short);
}

/* ---------- CC-252: send later ---------- */

/** The sender's own scheduled messages, soonest first. Nobody else sees them. */
export const scheduledBy = (s: State, who: string) =>
  (s.chat.scheduled ?? []).filter((x) => x.by === who).sort((a, b) => a.sendAt.localeCompare(b.sendAt));

export function scheduleChat(s: State, by: string, text: string, sendAt: string) {
  const t = valid(text);
  if (!t || !(sendAt > now(s)) || Number.isNaN(Date.parse(sendAt))) return false;
  if (!allowed(s, by, "write", "chat")) return false;
  const item: ScheduledMessage = { id: uid("sch"), by, text: t, sendAt: new Date(sendAt).toISOString(), createdAt: now(s) };
  s.chat.scheduled = [...(s.chat.scheduled ?? []), item];
  audit(s, by, "created", "a scheduled family chat message");
  return item.id;
}

const ownScheduled = (s: State, by: string, id: string) => (s.chat.scheduled ?? []).find((x) => x.id === id && x.by === by);

export function changeScheduled(s: State, by: string, id: string, text: string, sendAt: string) {
  const x = ownScheduled(s, by, id);
  const t = valid(text);
  if (!x || !t || !(sendAt > now(s)) || Number.isNaN(Date.parse(sendAt))) return false;
  x.text = t;
  x.sendAt = new Date(sendAt).toISOString();
  audit(s, by, "updated", "a scheduled family chat message");
  return true;
}

export function cancelScheduled(s: State, by: string, id: string) {
  if (!ownScheduled(s, by, id)) return false;
  s.chat.scheduled = s.chat.scheduled.filter((x) => x.id !== id);
  audit(s, by, "removed", "a scheduled family chat message (cancelled)");
  return true;
}

/** Posts a message on its sender's behalf at `at`. Muted members and quiet hours shape the notice, as for any message. */
function post(s: State, x: ScheduledMessage, at: string) {
  s.chat.messages.push({ id: uid("msg"), by: x.by, at, text: x.text, ...(x.demo ? { demo: true } : {}) });
  s.chat.messages.sort((a, b) => a.at.localeCompare(b.at));
  if (!s.chat.readAt[x.by] || s.chat.readAt[x.by] < at) s.chat.readAt[x.by] = at;
  const to = chatAudience(s, x.by);
  // CC-208: pushAlert holds Sarah's notice in her quiet hours, so the message shows in chat but her notice waits.
  if (to.length) pushAlert(s, { key: `chat-later-${x.id}`, to, severity: "info", title: "New message in Circle Care", detail: `${nameOf(s, x.by)} wrote in the family chat.`, link: "/app/chat" });
}

export function sendScheduledNow(s: State, by: string, id: string) {
  const x = ownScheduled(s, by, id);
  if (!x || !allowed(s, by, "write", "chat")) return false;
  s.chat.scheduled = s.chat.scheduled.filter((y) => y.id !== id);
  post(s, x, now(s));
  audit(s, by, "created", "a family chat message (scheduled one sent now)");
  return true;
}

/**
 * Rules engine: posts what is due. In the web POC this runs on the device's clock while the app is open; sending
 * from the server waits for CC-205. Someone who left the circle, or can't write in the chat any more, has their
 * scheduled messages dropped, not sent.
 */
export function runScheduled(s: State) {
  const t = now(s);
  const due = (s.chat.scheduled ?? []).filter((x) => x.sendAt <= t);
  if (!due.length) return;
  s.chat.scheduled = s.chat.scheduled.filter((x) => x.sendAt > t);
  for (const x of due.sort((a, b) => a.sendAt.localeCompare(b.sendAt))) {
    const m = member(s, x.by);
    if (m?.status !== "active" || !inChat(s, x.by)) { audit(s, x.by, "removed", "a scheduled family chat message (not sent: no longer in the chat)"); continue; }
    post(s, x, x.sendAt);
  }
}

/* ---------- CC-253: mute for a day ---------- */

export const MORNING = "08:00";

/** "Until tomorrow morning" ends at 8 AM tomorrow; "For 24 hours" ends a day from now. */
export function muteChat(s: State, by: string, how: "morning" | "day") {
  if (!inChat(s, by)) return false;
  const c = clock(s);
  const until = how === "day" ? new Date(c.getTime() + 24 * 3600000) : atTime(ymd(addDays(c, 1)), MORNING);
  s.chat.mutedUntil = { ...(s.chat.mutedUntil ?? {}), [by]: until.toISOString() };
  return true;
}

export function unmuteChat(s: State, by: string) {
  if (!s.chat.mutedUntil?.[by]) return false;
  const next = { ...s.chat.mutedUntil };
  delete next[by];
  s.chat.mutedUntil = next;
  return true;
}

export { chatMutedUntil };

/* ---------- CC-254: read new messages aloud to Maggie ---------- */

export type ReadLine = { id: string; text: string };

/**
 * What Read aloud says when Maggie opens the chat: pinned notes first, then new messages oldest first, each with
 * who sent it. "Names only" says just who wrote. Nothing is read when nothing is new. Taken-back messages are skipped.
 */
export function readAloudLines(s: State, viewer = ELDER): ReadLine[] {
  const since = s.chat.readAt[viewer] ?? "";
  const names = s.settings.elderChatReading === "names";
  const fresh = chatMessages(s, viewer).filter((m) => m.by !== viewer && m.at > since && !m.removedAt);
  const pins = pinnedNotes(s, viewer);
  if (!fresh.length && !pins.some((m) => m.pinnedAt! > since)) return [];
  const who = (m: ChatMessage) => (m.by === viewer ? "you" : nameOf(s, m.by));
  const lines: ReadLine[] = pins.map((m) => ({ id: `pin-${m.id}`, text: names ? `Pinned note from ${who(m)}.` : `Pinned note from ${who(m)}: ${m.text}` }));
  for (const m of fresh) if (!m.pinnedAt) lines.push({ id: m.id, text: names ? `New message from ${who(m)}.` : `${who(m)} says: ${m.text}` });
  return lines;
}

/* ---------- CC-255: search ---------- */

/** Messages this person can already read that contain the words, newest first. Taken-back messages are never found. */
export function searchChat(s: State, viewer: string, query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 2 || !inChat(s, viewer)) return [];
  return chatMessages(s, viewer).filter((m) => !m.removedAt && m.text.toLowerCase().includes(q)).reverse();
}

/* ---------- CC-256: the Circle Messages demo scenario ---------- */

export { DEMO_LABEL };

/**
 * A week of family chat on the fictional circle, every message marked demo: a pinned note from Sarah, a message
 * James took back, and a message Sarah scheduled for tomorrow morning. Loading it twice gives the same story.
 */
export function loadCircleMessagesDemo(s: State) {
  const c = clock(s);
  s.chat.messages = s.chat.messages.filter((m) => !m.demo);
  s.chat.scheduled = (s.chat.scheduled ?? []).filter((x) => !x.demo);
  const day = (n: number, time: string) => atTime(ymd(addDays(c, -n)), time).toISOString();
  const msg = (by: string, at: string, text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: uid("msg"), by, at, text, demo: true, ...extra });
  const pinAt = day(5, "09:20");
  const list: ChatMessage[] = [
    msg(GUARDIAN, day(6, "18:05"), "Hi all. This chat is for everyday plans. Health details go in Notes."),
    msg(ELDER, day(6, "18:40"), "Thank you, dear. I like seeing everyone's news here."),
    msg(GUARDIAN, day(5, "09:15"), "Family dinner moved to Sunday at 5 PM at Maggie's. James brings dessert.", { pinnedAt: pinAt, pinnedBy: GUARDIAN }),
    msg(FAMILY, day(5, "09:32"), "Got it. Apple pie it is."),
    msg(FAMILY, day(3, "20:10"), "", { removedAt: day(3, "20:12"), removedBy: FAMILY }),
    msg(FAMILY, day(3, "20:13"), "Sorry, wrong chat. Ignore that."),
    msg(ELDER, day(2, "11:00"), "The garden club meets Thursday. Could someone drive me?"),
    msg(GUARDIAN, day(2, "11:24"), "I can drive you Thursday. I'll pick you up at 1:30."),
    msg(FAMILY, day(1, "19:45"), "Plan for the weekend: I'll bring the folding chairs Saturday morning."),
  ];
  // Keep within 3 pins: the demo's pin replaces the oldest one if needed.
  while (pinnedNotes(s).length >= PIN_MAX) { const old = pinnedNotes(s)[0]; delete old.pinnedAt; delete old.pinnedBy; }
  s.chat.messages = [...s.chat.messages, ...list].sort((a, b) => a.at.localeCompare(b.at));
  s.chat.scheduled = [...s.chat.scheduled, {
    id: uid("sch"), by: GUARDIAN, text: "Good morning, everyone. The plan for today is in the pinned note.",
    sendAt: atTime(ymd(addDays(c, 1)), MORNING).toISOString(), createdAt: c.toISOString(), demo: true,
  }];
  s.demoScenario = "circle-messages";
  audit(s, GUARDIAN, "created", "the Circle Messages demo scenario (dummy profiles)");
  return true;
}

/** Messages in the demo scenario carry the label on their bubble. */
export const demoTag = (m: { demo?: boolean }) => (m.demo ? DEMO_LABEL : undefined);

// The muted line uses chatMutedUntil; re-exported here so the chat screen has one import.
export const isMuted = (s: State, who: string) => !!chatMutedUntil(s, who);
