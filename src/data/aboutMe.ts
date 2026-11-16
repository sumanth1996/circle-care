import type { State, AboutKey, AboutSection } from "./types";
import { audit, allowed, pushAlert } from "./store";
import { can } from "./policy";
import { clock } from "./selectors";
import { ELDER, GUARDIAN } from "./demo";

// Sprint 19: Maggie's What matters to me page (CC-219). Four sections in her own words: her day, the food she
// likes, how to help her and the things she doesn't want. Each section is seen only by the people Maggie picks
// for it, and a paid caregiver sees it only while on shift. Sarah can help write it unless Maggie turns that off,
// and Maggie sees what Sarah changed the next time she opens the page. No audio is kept: dictation is the phone's.

export const ABOUT_MAX = 1500;

export const SECTIONS: { key: AboutKey; title: string; hint: string; placeholder: string }[] = [
  { key: "day", title: "My day", hint: "When I get up, eat, rest and go to bed", placeholder: "I get up around…" },
  { key: "food", title: "Food I like", hint: "What I like to eat and drink", placeholder: "I like…" },
  { key: "help", title: "How to help me", hint: "How I like to be helped", placeholder: "Please…" },
  { key: "avoid", title: "Things I don't want", hint: "What upsets me or what I'd rather not have", placeholder: "Please don't…" },
];

export const sectionTitle = (key: AboutKey) => SECTIONS.find((x) => x.key === key)!.title;
const sectionOf = (s: State, key: AboutKey) => s.aboutMe.sections.find((x) => x.key === key);

/** The people Maggie can share a section with: everyone active in her circle. */
export const aboutCandidates = (s: State) => s.members.filter((m) => m.status === "active" && m.id !== ELDER);

/**
 * Who sees a section: Maggie, and the people she picked for it (criterion 2). The permission matrix adds the rest:
 * a paid caregiver only on shift (criterion 8), and family and caregivers nothing while sharing is paused (criterion 7).
 */
export function canSeeSection(s: State, viewer: string, sec: AboutSection) {
  if (!can(s, viewer, "read", "aboutMe")) return false;
  return viewer === ELDER || sec.sharedWith.includes(viewer);
}

/** Maggie writes any section. Sarah writes while Maggie lets her, a new section or one shared with her (criterion 6). */
export function canEditSection(s: State, viewer: string, key: AboutKey) {
  if (!can(s, viewer, "write", "aboutMe")) return false;
  if (viewer === ELDER) return true;
  if (viewer !== GUARDIAN || !s.aboutMe.sarahCanEdit) return false;
  const sec = sectionOf(s, key);
  return !sec || sec.sharedWith.includes(GUARDIAN);
}

/** The page for one viewer: each section they may see (written ones only, unless they may write it). */
export function aboutView(s: State, viewer: string) {
  return SECTIONS.map((meta) => {
    const sec = sectionOf(s, meta.key);
    const visible = !!sec && canSeeSection(s, viewer, sec);
    return { ...meta, section: visible ? sec : undefined, canEdit: canEditSection(s, viewer, meta.key) };
  }).filter((x) => x.section || x.canEdit);
}

/** CC-219 criterion 3: the sections Ana sees on her shift screen, "How to help me" first. Nothing off shift. */
export function shiftSections(s: State, viewer: string) {
  const order: AboutKey[] = ["help", "day", "food", "avoid"];
  return order.map((k) => sectionOf(s, k)).filter((x): x is AboutSection => !!x && canSeeSection(s, viewer, x));
}

/**
 * Saves a section in the writer's words (criterion 1). A new section is shared with no one but its writer until
 * Maggie picks (criterion 2). When Sarah changes one, the old words are kept so Maggie sees what changed
 * (criterion 5). Maggie can clear a section to remove it.
 */
export function saveSection(s: State, by: string, key: AboutKey, text: string) {
  if (!SECTIONS.some((x) => x.key === key)) return false;
  if (!allowed(s, by, "write", "aboutMe")) return false;
  if (!canEditSection(s, by, key)) { audit(s, by, "denied", "change Maggie's What matters to me"); return false; }
  const t = text.trim().slice(0, ABOUT_MAX);
  const now = clock(s).toISOString();
  const sec = sectionOf(s, key);
  if (!t) {
    if (!sec || by !== ELDER) return false;
    s.aboutMe.sections = s.aboutMe.sections.filter((x) => x !== sec);
    audit(s, by, "removed", `What matters to me (${sectionTitle(key)})`);
    return true;
  }
  if (!sec) {
    s.aboutMe.sections.push({ key, text: t, by, at: now, sharedWith: by === ELDER ? [] : [by] });
    audit(s, by, "created", `What matters to me (${sectionTitle(key)})`);
    if (by !== ELDER) pushAlert(s, { key: `about-${key}-${now}`, to: ["elder"], severity: "info", title: "Update from Circle Care", detail: `${by === GUARDIAN ? "Sarah" : "Someone"} added "${sectionTitle(key)}" to your What matters to me page. Only you and Sarah see it until you choose who else can.`, link: "/app/elder/about-me" });
    return true;
  }
  if (sec.text === t) return true;
  if (by === ELDER) {
    sec.text = t; sec.by = ELDER; sec.at = now;
    sec.changedBy = undefined; sec.changedAt = undefined; sec.before = undefined;
  } else {
    // Keep the words Maggie last saw, even after several changes, so she sees the whole change at once.
    if (!sec.changedBy) sec.before = sec.text;
    sec.text = t; sec.changedBy = by; sec.changedAt = now;
  }
  audit(s, by, "updated", `What matters to me (${sectionTitle(key)})`);
  return true;
}

/** Criterion 4: only Maggie picks who sees a section. It takes effect at once and is in the access history. */
export function setSectionSharing(s: State, by: string, key: AboutKey, ids: string[]) {
  if (by !== ELDER) { audit(s, by, "denied", "change who sees Maggie's What matters to me"); return false; }
  const sec = sectionOf(s, key);
  if (!sec) return false;
  const ok = new Set(aboutCandidates(s).map((m) => m.id));
  sec.sharedWith = [...new Set(ids)].filter((id) => ok.has(id));
  audit(s, by, "updated", `who sees What matters to me (${sectionTitle(key)})`);
  return true;
}

/** Criterion 6: Maggie turns Sarah's editing on or off. */
export function setSarahEditing(s: State, by: string, on: boolean) {
  if (by !== ELDER) { audit(s, by, "denied", "change who can edit Maggie's What matters to me"); return false; }
  s.aboutMe.sarahCanEdit = on;
  audit(s, by, "updated", on ? "Sarah can edit What matters to me" : "Sarah can't edit What matters to me");
  return true;
}

/** Criterion 5: the sections someone else changed since Maggie last opened the page. */
export function changesForMaggie(s: State) {
  const since = s.aboutMe.elderSeenAt ?? "";
  return s.aboutMe.sections.filter((x) => x.changedBy && x.changedAt! > since);
}

/** Maggie opened the page: changes she's now seen are settled. */
export function markSeen(s: State, by: string) {
  if (by !== ELDER) return;
  s.aboutMe.elderSeenAt = clock(s).toISOString();
  for (const sec of s.aboutMe.sections) { sec.changedBy = undefined; sec.changedAt = undefined; sec.before = undefined; }
}
