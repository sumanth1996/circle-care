import type { State, MemoryAid } from "./types";
import { audit, allowed } from "./store";
import { can, roleOf } from "./policy";
import { clock, todayOf } from "./selectors";
import { at, uid } from "../lib/time";
import { ELDER } from "./demo";

// Sprint 22: memory aids (CC-138, CC-139). Family write short notes like "Your keys are in the blue bowl", with an
// optional photo, either always on Maggie's home or once at a date and time. Maggie sees them in large text, read
// aloud once, and taps Got it; the writer sees when. Maggie can turn any note off. Caregivers on shift read them.
// Notes never hold codes or passwords: anyone could be standing next to Maggie's phone.

export const AID_MAX = 140;
/** How many always notes show on Maggie's home at once. More rotate. */
export const AIDS_AT_ONCE = 3;

const WORDS = /\b(pin|pins|passcode|pass code|password|passwords|door code|gate code|alarm code|lock code|lockbox|key code|combination|security code|code is|codes are)\b/i;
// 4 to 8 digits on their own: a PIN or a door code. Not part of a phone number (555-0177), and not a year.
const DIGITS = /(?<![\d\-().:])\d{4,8}(?![\d\-:])/g;

/** CC-138: whether a note looks like it holds a PIN, door code or password. Asked to leave it out before saving. */
export function looksLikeCode(text: string) {
  if (WORDS.test(text)) return true;
  return (text.match(DIGITS) ?? []).some((d) => !(d.length === 4 && /^(19|20)\d\d$/.test(d)));
}

export type AidInput = { text: string; kind: MemoryAid["kind"]; date?: string; time?: string; photoId?: string };

function valid(s: State, a: AidInput) {
  const text = a.text.trim();
  if (!text || text.length > AID_MAX || looksLikeCode(text)) return false;
  if (a.kind === "once") {
    if (!a.date || !/^\d{4}-\d{2}-\d{2}$/.test(a.date) || !a.time || !/^\d{2}:\d{2}$/.test(a.time)) return false;
    if (a.date < todayOf(s)) return false;
  }
  return a.kind === "always" || a.kind === "once";
}

/** Who may see a note at all: Maggie, and anyone whose role reads memory aids now (a caregiver only on shift). */
export const canSeeAids = (s: State, viewer: string) => viewer === ELDER || can(s, viewer, "read", "memoryAids");

/** CC-138: family add a note. Only roles that write memory aids; audited without the note's words. */
export function addAid(s: State, by: string, input: AidInput): MemoryAid | null {
  if (!allowed(s, by, "write", "memoryAids")) return null;
  if (!valid(s, input)) return null;
  const aid: MemoryAid = {
    id: uid("aid"), text: input.text.trim(), kind: input.kind, by, at: clock(s).toISOString(),
    ...(input.kind === "once" ? { date: input.date, time: input.time } : {}),
    ...(input.photoId ? { photoId: input.photoId } : {}),
  };
  s.memoryAids = [...(s.memoryAids ?? []), aid];
  audit(s, by, "created", "a memory aid for Maggie");
  return aid;
}

/** Change a note's words, timing or photo. Only its writer or Sarah. Maggie sees it again as new. */
export function editAid(s: State, by: string, id: string, input: AidInput) {
  const aid = s.memoryAids.find((a) => a.id === id);
  if (!aid) return false;
  if (!allowed(s, by, "write", "memoryAids")) return false;
  if (aid.by !== by && roleOf(s, by) !== "guardian") { audit(s, by, "denied", "change someone else's memory aid"); return false; }
  if (!valid(s, input)) return false;
  if (aid.photoId && aid.photoId !== input.photoId) s.filesToDelete = [...(s.filesToDelete ?? []), aid.photoId];
  Object.assign(aid, { text: input.text.trim(), kind: input.kind, date: input.kind === "once" ? input.date : undefined, time: input.kind === "once" ? input.time : undefined, photoId: input.photoId, updatedAt: clock(s).toISOString(), seenAt: undefined, hiddenOn: undefined, spokenAt: undefined });
  audit(s, by, "updated", "a memory aid for Maggie");
  return true;
}

/** Remove a note and its photo. Only its writer or Sarah. */
export function removeAid(s: State, by: string, id: string) {
  const aid = s.memoryAids.find((a) => a.id === id);
  if (!aid) return false;
  if (!allowed(s, by, "write", "memoryAids")) return false;
  if (aid.by !== by && roleOf(s, by) !== "guardian") { audit(s, by, "denied", "remove someone else's memory aid"); return false; }
  s.memoryAids = s.memoryAids.filter((a) => a.id !== id);
  if (aid.photoId) s.filesToDelete = [...(s.filesToDelete ?? []), aid.photoId];
  audit(s, by, "removed", "a memory aid for Maggie");
  return true;
}

/** CC-138 criterion 4: Maggie turns any note off or back on. Only Maggie. */
export function setAidOn(s: State, by: string, id: string, on: boolean) {
  const aid = s.memoryAids.find((a) => a.id === id);
  if (!aid) return false;
  if (by !== ELDER) { audit(s, by, "denied", "turn off one of Maggie's memory aids"); return false; }
  aid.offAt = on ? undefined : clock(s).toISOString();
  audit(s, by, "updated", on ? "turned a memory aid back on" : "turned a memory aid off");
  return true;
}

/** When a once note is due. */
const dueAt = (a: MemoryAid) => (a.kind === "once" && a.date && a.time ? at(a.date, a.time).getTime() : 0);

/**
 * CC-139: what shows on Maggie's home now. A once note from its time until the end of that day, until she taps Got it.
 * Always notes, unless she tapped Got it today. Notes she turned off never show.
 */
export function aidsDue(s: State) {
  const now = clock(s).getTime();
  const today = todayOf(s);
  const list = (s.memoryAids ?? []).filter((a) => !a.offAt);
  const once = list.filter((a) => a.kind === "once" && a.date === today && dueAt(a) <= now && !a.seenAt).sort((a, b) => dueAt(a) - dueAt(b));
  const always = list.filter((a) => a.kind === "always" && a.hiddenOn !== today);
  return { once, always };
}

/** CC-139 criterion 3: the always notes for one page of the rotation, three at a time. */
export function aidPage(always: MemoryAid[], page: number) {
  if (always.length <= AIDS_AT_ONCE) return always;
  const pages = Math.ceil(always.length / AIDS_AT_ONCE);
  const p = ((page % pages) + pages) % pages;
  return always.slice(p * AIDS_AT_ONCE, p * AIDS_AT_ONCE + AIDS_AT_ONCE);
}

/** CC-138 criterion 2: Maggie tapped Got it. A once note is done; an always note leaves her home for today. */
export function seeAid(s: State, by: string, id: string) {
  const aid = s.memoryAids.find((a) => a.id === id);
  if (!aid || by !== ELDER) return false;
  aid.seenAt = clock(s).toISOString();
  if (aid.kind === "always") aid.hiddenOn = todayOf(s);
  return true;
}

/** CC-139 criterion 1: a note is read aloud once, the first time it shows. */
export function spokeAid(s: State, by: string, id: string) {
  const aid = s.memoryAids.find((a) => a.id === id);
  if (!aid || by !== ELDER || aid.spokenAt) return false;
  aid.spokenAt = clock(s).toISOString();
  return true;
}

/** "Always", "Once, Fri, Dec 4 at 3:00 PM". */
export function aidWhen(a: MemoryAid) {
  if (a.kind === "always") return "Always";
  const d = at(a.date!, a.time!);
  return `Once, ${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
