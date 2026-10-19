// Pilot program data (CC-74/76/77). Stored separately from the care circle so
// research data never mixes with health information. Only non-identifying
// fields are kept: no names, contact details or free-text health information.

const LEADS = "circle-care-pilot-leads";
const NPS = "circle-care-nps";

export type PilotLead = { at: string; role: string; state: string; hasPro: boolean };
export type NpsResponse = { at: string; persona: "elder" | "caregiver" | "guardian"; score: number; comment?: string };

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}
function write<T>(key: string, v: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export const pilotLeads = () => read<PilotLead>(LEADS);
export function addPilotLead(l: Omit<PilotLead, "at">) {
  write(LEADS, [...pilotLeads(), { ...l, state: l.state.trim().slice(0, 30), at: new Date().toISOString() }]);
}

/** Strips anything that looks like health detail from free-text feedback (CC-76). */
const healthWords = /\b(mg|mcg|ml|tablet|pill|dose|medic\w*|diagnos\w*|diabet\w*|blood pressure|cholesterol|cancer|dementia|alzheimer\w*|depress\w*|anxiety|surgery|prescri\w*|lisinopril|metformin|atorvastatin|vitamin)\b/gi;
export function scrubHealth(text: string) {
  return text.replace(healthWords, "[removed]");
}

export const npsResponses = () => read<NpsResponse>(NPS);
export function addNps(r: Omit<NpsResponse, "at">) {
  write(NPS, [...npsResponses(), { ...r, comment: r.comment ? scrubHealth(r.comment).slice(0, 500) : undefined, at: new Date().toISOString() }]);
}
export function npsScore(rs: NpsResponse[]) {
  if (!rs.length) return null;
  const pro = rs.filter((r) => r.score >= 9).length;
  const det = rs.filter((r) => r.score <= 6).length;
  return Math.round(((pro - det) / rs.length) * 100);
}
