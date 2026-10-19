import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { State, Persona, Alert, DoseStatus, Medication, Approval, Member, CareTask, Shift, Handoff, AuditEvent, Settings } from "./types";
import { seed, STATE_VERSION, ELDER, GUARDIAN, CAREGIVER, FAMILY } from "./demo";
import { clock, dosesFor, doseThresholds, meId, nameOf, lateCheckins, checkinMissed, todayOf, activeSos, member, todayVisit, tasksFor } from "./selectors";
import { hm, uid, ymd, toMin, minutesOfDay } from "../lib/time";

const KEY = "circle-care-demo";

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      if (s.version === STATE_VERSION) return s;
    }
  } catch {
    /* storage unavailable — fall back to a fresh demo */
  }
  return seed();
}

type Updater = (draft: State) => void;

/** Adds an alert unless one with the same key already exists. */
function pushAlert(s: State, a: Omit<Alert, "id" | "at" | "read">) {
  if (a.key && s.alerts.some((x) => x.key === a.key)) return;
  s.alerts.push({ ...a, id: uid("al"), at: clock(s).toISOString(), read: [] });
}

function audit(s: State, actorId: string, action: AuditEvent["action"], resource: string) {
  s.audit.push({ id: uid("a"), at: clock(s).toISOString(), actorId, action, resource });
}

/**
 * The rules engine. In production these run server-side on a scheduler;
 * here they run in the browser every 15 seconds and after every change.
 */
export function evaluate(s: State) {
  const now = clock(s);
  const today = ymd(now);

  // Missed-dose escalation (CC-42, CC-43): caregiver first, then guardian.
  for (const d of dosesFor(s)) {
    if (d.log) continue;
    const th = doseThresholds(s, d.med);
    if (d.minutesLate >= th.caregiver) {
      pushAlert(s, {
        key: `dose-cg-${today}-${d.key}`, to: ["caregiver", "elder"], severity: d.med.critical ? "critical" : "warning",
        title: "You have a reminder from Circle Care",
        detail: `${d.med.name} ${d.med.strength} (${d.time}) hasn't been confirmed yet.`, link: "/app/caregiver",
      });
    }
    if (d.minutesLate >= th.guardian) {
      pushAlert(s, {
        key: `dose-g-${today}-${d.key}`, to: ["guardian"], severity: d.med.critical ? "critical" : "warning",
        title: "Circle Care needs your attention",
        detail: `${d.med.name} (${d.time}) is ${d.minutesLate} minutes overdue and still unconfirmed.${d.med.critical ? " This is a high-priority medication." : ""}`, link: "/app/guardian",
      });
    }
  }

  // Missed daily check-in (CC-52).
  if (checkinMissed(s)) {
    pushAlert(s, {
      key: `checkin-${today}`, to: ["guardian"], severity: "warning",
      title: "Circle Care needs your attention",
      detail: `Maggie hasn't checked in today (window ${s.settings.checkinWindow.start}–${s.settings.checkinWindow.end}). Consider calling her.`, link: "/app/guardian",
    });
  }

  // Late caregiver check-in (CC-57).
  for (const sh of lateCheckins(s)) {
    pushAlert(s, {
      key: `late-${today}-${sh.id}`, to: ["guardian", "caregiver"], severity: "warning",
      title: "Circle Care needs your attention",
      detail: `${nameOf(s, sh.caregiverId)} hasn't checked in for the ${sh.start} shift.`, link: "/app/guardian/schedule",
    });
  }

  // SOS escalation chain (CC-48): next person every N minutes until acknowledged.
  const sos = activeSos(s);
  if (sos && sos.status === "active") {
    const elapsed = (now.getTime() - new Date(sos.startedAt).getTime()) / 60000;
    const step = Math.min(s.settings.escalation.length - 1, Math.floor(elapsed / s.settings.escalationDelayMin));
    if (step > sos.step) {
      sos.step = step;
      const who = nameOf(s, s.settings.escalation[step]);
      pushAlert(s, {
        key: `sos-${sos.id}-step-${step}`, to: ["guardian", "caregiver"], severity: "critical",
        title: "Emergency alert from Circle Care",
        detail: `No one has responded yet. Now also alerting ${who}.`, link: "/app/sos",
      });
    }
  }

  // Time-bound access ends automatically (CC-25).
  for (const m of s.members) {
    if (m.expiresOn && m.status === "active" && m.expiresOn < today) {
      m.status = "revoked";
      audit(s, "system", "removed", `${m.name}'s access (time limit ended)`);
    }
  }
}

function useStoreState() {
  const [state, setState] = useState<State>(load);
  const viewed = useRef<Record<string, number>>({});

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / private mode */
    }
  }, [state]);

  const update = useCallback((fn: Updater) => {
    setState((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      evaluate(draft);
      return draft;
    });
  }, []);

  // Tick the rules engine so time-based escalations fire while the app is open.
  useEffect(() => {
    update(() => {});
    const t = setInterval(() => update(() => {}), 15000);
    return () => clearInterval(t);
  }, [update]);

  const me = meId(state.persona);

  const actions = useMemo(() => {
    const actor = (s: State) => meId(s.persona);
    return {
      setPersona: (p: Persona | null) => update((s) => { s.persona = p; }),
      signIn: (p: Persona) => update((s) => {
        s.signedIn[p] = true;
        s.persona = p;
        audit(s, meId(p), "signed in", "Circle Care");
      }),
      signOut: (p: Persona) => update((s) => { s.signedIn[p] = false; }),
      resetDemo: () => { setState(seed()); viewed.current = {}; },
      skipAhead: (min: number) => update((s) => { s.clockOffsetMin += min; }),
      simulate: (what: "late-caregiver" | "missed-checkin" | "missed-dose") => update((s) => {
        const today = todayOf(s);
        const nowMin = minutesOfDay(clock(s));
        if (what === "late-caregiver") {
          const v = todayVisit(s);
          if (v) { v.checkIn = undefined; v.checkOut = undefined; }
          // Make sure the shift started more than 15 minutes ago.
          const sh = s.shifts.find((x) => x.id === v?.shiftId) ?? s.shifts[0];
          sh.start = hm(new Date(clock(s).getTime() - 25 * 60000));
          if (toMin(sh.end) <= nowMin) sh.end = hm(new Date(clock(s).getTime() + 4 * 60 * 60000));
          s.alerts = s.alerts.filter((a) => !a.key?.startsWith(`late-${today}`));
        }
        if (what === "missed-checkin") {
          s.checkins = s.checkins.filter((c) => c.date !== today);
          s.settings.checkinWindow = { start: hm(new Date(clock(s).getTime() - 150 * 60000)), end: hm(new Date(clock(s).getTime() - 30 * 60000)) };
          s.alerts = s.alerts.filter((a) => a.key !== `checkin-${today}`);
        }
        if (what === "missed-dose") {
          const lis = s.meds.find((m) => m.id === "med-lisinopril")!;
          const t = hm(new Date(clock(s).getTime() - 70 * 60000));
          lis.times = [t];
          s.doses = s.doses.filter((d) => !(d.medId === lis.id && d.date === today));
        }
      }),
      logView: (resource: string) => {
        const k = `${resource}`;
        if (Date.now() - (viewed.current[k] ?? 0) < 10 * 60000) return;
        viewed.current[k] = Date.now();
        update((s) => { if (s.persona) audit(s, actor(s), "viewed", resource); });
      },
      recordDose: (medId: string, time: string, status: DoseStatus, reason?: string) => update((s) => {
        const today = todayOf(s);
        const by = actor(s);
        const visit = todayVisit(s, by);
        const verified = s.persona === "caregiver" && !!visit?.checkIn && !visit?.checkOut;
        s.doses = s.doses.filter((d) => !(d.medId === medId && d.date === today && d.time === time));
        s.doses.push({ id: uid("dose"), medId, date: today, time, status, by, at: clock(s).toISOString(), verified, reason });
        const med = s.meds.find((m) => m.id === medId);
        audit(s, by, "created", `a dose record (${med?.name})`);
      }),
      verifyDose: (medId: string, time: string) => update((s) => {
        const d = s.doses.find((d) => d.medId === medId && d.date === todayOf(s) && d.time === time);
        if (d) d.verified = true;
      }),
      saveMed: (med: Medication, isNew: boolean) => update((s) => {
        const by = actor(s);
        const stamp = { at: clock(s).toISOString(), by };
        if (isNew) {
          s.meds.push({ ...med, history: [{ ...stamp, change: "Added to schedule" }] });
          audit(s, by, "created", `medication ${med.name}`);
        } else {
          const i = s.meds.findIndex((m) => m.id === med.id);
          const before = s.meds[i];
          const changes: string[] = [];
          if (before.times.join() !== med.times.join()) changes.push(`times ${before.times.join(", ")} → ${med.times.join(", ")}`);
          if (before.dose !== med.dose) changes.push(`dose ${before.dose} → ${med.dose}`);
          if (before.paused !== med.paused) changes.push(med.paused ? "paused" : "resumed");
          if (before.critical !== med.critical) changes.push(med.critical ? "marked high-priority" : "high-priority removed");
          if (before.instructions !== med.instructions) changes.push("instructions updated");
          s.meds[i] = { ...med, history: [...before.history, { ...stamp, change: changes.join("; ") || "Details updated" }] };
          audit(s, by, "updated", `medication ${med.name}`);
        }
        s.approvals.push({ id: uid("ap"), kind: "med-change", title: isNew ? `Added ${med.name}` : `Updated ${med.name}`, detail: "Changed directly by the guardian.", requestedBy: by, at: clock(s).toISOString(), status: "approved", decidedAt: clock(s).toISOString(), elderSeen: s.persona === "elder" });
      }),
      requestMedChange: (med: Medication, reason: string) => update((s) => {
        const by = actor(s);
        const before = s.meds.find((m) => m.id === med.id)!;
        s.approvals.push({
          id: uid("ap"), kind: "med-change", title: `Change ${before.name}: ${before.times.join(", ")} → ${med.times.join(", ")}${before.dose !== med.dose ? `, ${med.dose}` : ""}${med.paused !== before.paused ? (med.paused ? ", pause" : ", resume") : ""}`,
          detail: reason || "No reason given.", requestedBy: by, at: clock(s).toISOString(), status: "pending", payload: { med },
        });
        pushAlert(s, { to: ["guardian"], severity: "info", title: "You have a new request in Circle Care", detail: `${nameOf(s, by)} asked to change ${before.name}.`, link: "/app/guardian/approvals" });
        audit(s, by, "created", `a change request for ${before.name}`);
      }),
      decide: (id: string, approve: boolean, note?: string) => update((s) => {
        const a = s.approvals.find((x) => x.id === id);
        if (!a) return;
        a.status = approve ? "approved" : "declined";
        a.decidedAt = clock(s).toISOString();
        a.note = note;
        a.elderSeen = false;
        if (approve) {
          const p = a.payload ?? {};
          if (a.kind === "med-change" && p.med) {
            const med = p.med as Medication;
            const i = s.meds.findIndex((m) => m.id === med.id);
            if (i >= 0) s.meds[i] = { ...med, history: [...s.meds[i].history, { at: a.decidedAt, by: GUARDIAN, change: `${a.title} (requested by ${nameOf(s, a.requestedBy)})` }] };
          }
          if (a.kind === "med-change" && p.medId) {
            const med = s.meds.find((m) => m.id === p.medId);
            if (med) {
              med.times = med.times.map((t) => (t === p.from ? (p.to as string) : t));
              med.history.push({ at: a.decidedAt, by: GUARDIAN, change: `${a.title} (requested by ${nameOf(s, a.requestedBy)})` });
            }
          }
          if (a.kind === "member" && p.memberId) {
            const m = s.members.find((m) => m.id === p.memberId);
            if (m && m.status === "pending") m.status = "active";
          }
          if (a.kind === "shift-swap" && p.shiftId) {
            const sh = s.shifts.find((x) => x.id === p.shiftId);
            if (sh) sh.caregiverId = p.to as string;
          }
        }
        pushAlert(s, { to: ["caregiver"], severity: "info", title: "You have an update in Circle Care", detail: `Sarah ${a.status} your request: ${a.title}`, link: "/app/caregiver" });
        audit(s, GUARDIAN, approve ? "approved" : "declined", a.title);
      }),
      elderSeen: (id: string) => update((s) => { const a = s.approvals.find((x) => x.id === id); if (a) a.elderSeen = true; }),
      elderAsk: (id: string, q: string) => update((s) => {
        const a = s.approvals.find((x) => x.id === id);
        if (!a) return;
        a.elderQuestion = q;
        a.elderSeen = true;
        pushAlert(s, { to: ["guardian"], severity: "info", title: "You have a new message in Circle Care", detail: `Maggie has a question about “${a.title}”: ${q}`, link: "/app/guardian/approvals" });
      }),
      completeTask: (taskId: string, note?: string) => update((s) => {
        const today = todayOf(s);
        s.taskLogs = s.taskLogs.filter((l) => !(l.taskId === taskId && l.date === today));
        s.taskLogs.push({ taskId, date: today, by: actor(s), at: clock(s).toISOString(), note });
      }),
      undoTask: (taskId: string) => update((s) => { s.taskLogs = s.taskLogs.filter((l) => !(l.taskId === taskId && l.date === todayOf(s))); }),
      addTask: (t: Omit<CareTask, "id">) => update((s) => { s.tasks.push({ ...t, id: uid("t") }); audit(s, actor(s), "created", `task “${t.title}”`); }),
      elderCheckin: (mood?: string) => update((s) => {
        const today = todayOf(s);
        s.checkins = s.checkins.filter((c) => c.date !== today);
        s.checkins.push({ date: today, at: clock(s).toISOString(), mood });
      }),
      sosStart: (via: "app" | "sms-fallback" = "app") => update((s) => {
        if (activeSos(s)) return;
        const e = { id: uid("sos"), startedAt: clock(s).toISOString(), status: "active" as const, step: 0, via };
        s.sos.push(e);
        pushAlert(s, { key: `sos-${e.id}-step-0`, to: ["guardian", "caregiver"], severity: "critical", title: "Emergency alert from Circle Care", detail: `Maggie pressed SOS. Alerting ${nameOf(s, s.settings.escalation[0])} first.`, link: "/app/sos" });
      }),
      sosAcknowledge: () => update((s) => {
        const e = activeSos(s);
        if (!e || e.status !== "active") return;
        e.status = "acknowledged";
        e.responderId = actor(s);
        e.acknowledgedAt = clock(s).toISOString();
        pushAlert(s, { to: ["elder", "guardian", "caregiver"], severity: "info", title: "Update from Circle Care", detail: `${nameOf(s, e.responderId)} is responding to Maggie's SOS.`, link: "/app/sos" });
      }),
      sosResolve: (outcome: string) => update((s) => {
        const e = activeSos(s);
        if (!e) return;
        e.status = "resolved";
        e.resolvedAt = clock(s).toISOString();
        e.outcome = outcome;
        e.responderId ??= actor(s);
      }),
      visitCheckIn: (manualReason?: string) => update((s) => {
        const by = actor(s);
        let v = todayVisit(s, by);
        if (!v) {
          const sh = s.shifts.find((x) => x.caregiverId === by) ?? s.shifts[0];
          v = { id: uid("visit"), shiftId: sh.id, caregiverId: by, date: todayOf(s) };
          s.visits.push(v);
        }
        v.checkIn = clock(s).toISOString();
        v.checkOut = undefined;
        v.manualReason = manualReason;
        audit(s, by, "viewed", "today's care plan");
      }),
      submitHandoff: (h: Omit<Handoff, "id" | "visitId" | "by" | "at">) => update((s) => {
        const by = actor(s);
        const v = todayVisit(s, by);
        if (!v) return;
        v.checkOut = clock(s).toISOString();
        s.handoffs.push({ ...h, id: uid("ho"), visitId: v.id, by, at: clock(s).toISOString() });
        audit(s, by, "created", "a shift hand-off");
      }),
      acknowledgeHandoff: (id: string) => update((s) => {
        const h = s.handoffs.find((x) => x.id === id);
        if (h) { h.acknowledgedBy = actor(s); h.acknowledgedAt = clock(s).toISOString(); }
      }),
      saveShift: (sh: Shift) => update((s) => {
        const i = s.shifts.findIndex((x) => x.id === sh.id);
        if (i >= 0) s.shifts[i] = sh; else s.shifts.push(sh);
        if (sh.caregiverId && !sh.accepted) pushAlert(s, { to: ["caregiver"], severity: "info", title: "You have a new shift in Circle Care", detail: `Sarah offered you a shift, ${sh.start}–${sh.end}.`, link: "/app/caregiver/schedule" });
      }),
      acceptShift: (id: string) => update((s) => { const sh = s.shifts.find((x) => x.id === id); if (sh) sh.accepted = true; }),
      requestSwap: (shiftId: string, to: string, reason: string) => update((s) => {
        const sh = s.shifts.find((x) => x.id === shiftId);
        if (!sh) return;
        s.approvals.push({ id: uid("ap"), kind: "shift-swap", title: `Swap ${sh.start}–${sh.end} shift to ${nameOf(s, to)}`, detail: reason || "No reason given.", requestedBy: actor(s), at: clock(s).toISOString(), status: "pending", payload: { shiftId, to } });
        pushAlert(s, { to: ["guardian"], severity: "info", title: "You have a new request in Circle Care", detail: `${nameOf(s, actor(s))} asked to swap a shift with ${nameOf(s, to)}.`, link: "/app/guardian/approvals" });
      }),
      addNote: (text: string, visibility: "everyone" | "guardian") => update((s) => { s.notes.push({ id: uid("n"), by: actor(s), at: clock(s).toISOString(), text, visibility }); }),
      addDoc: (name: string, kind: State["docs"][number]["kind"], size: string) => update((s) => {
        s.docs.push({ id: uid("d"), name, kind, by: actor(s), at: clock(s).toISOString(), size, status: kind === "Legal authority" ? "pending" : undefined });
        audit(s, actor(s), "created", `document “${name}”`);
      }),
      reviewDoc: (id: string, ok: boolean) => update((s) => {
        const d = s.docs.find((x) => x.id === id);
        if (!d) return;
        d.status = ok ? "verified" : "rejected";
        const g = s.members.find((m) => m.id === d.by);
        if (g && ok) g.verification = "verified";
        audit(s, "trust-safety", ok ? "approved" : "declined", `legal document “${d.name}”`);
        pushAlert(s, { to: ["elder", "guardian"], severity: "info", title: "Update from Circle Care", detail: ok ? `${g?.short ?? "The guardian"}'s legal authority was verified.` : `A legal document needs to be resubmitted.` });
      }),
      invite: (m: Pick<Member, "name" | "role" | "relation" | "phone" | "expiresOn">) => update((s) => {
        const colors = ["#FF6482", "#64D2FF", "#BF5AF2", "#FFD60A", "#32D74B"];
        const id = uid("m");
        s.members.push({ ...m, id, short: m.name.split(" ")[0], color: colors[s.members.length % colors.length], status: "pending", invitedAt: clock(s).toISOString(), verification: m.role === "guardian" ? "none" : undefined });
        pushAlert(s, { to: ["elder"], severity: "info", title: "Update from Circle Care", detail: `${m.name} was invited to your circle as ${m.relation}.`, link: "/app/elder/privacy" });
        audit(s, actor(s), "created", `an invitation for ${m.name}`);
      }),
      acceptInvite: (id: string) => update((s) => { const m = s.members.find((x) => x.id === id); if (m) m.status = "active"; }),
      revoke: (id: string) => update((s) => {
        const m = s.members.find((x) => x.id === id);
        if (!m || m.role === "elder" || m.role === "guardian") return;
        m.status = "revoked";
        s.settings.escalation = s.settings.escalation.filter((x) => x !== id);
        pushAlert(s, { to: ["guardian"], severity: "info", title: "Update from Circle Care", detail: `${nameOf(s, actor(s))} removed ${m.name} from the circle.` });
        audit(s, actor(s), "removed", `${m.name}'s access`);
      }),
      settings: (patch: Partial<Settings>) => update((s) => {
        const wasPaused = s.settings.sharingPaused;
        s.settings = { ...s.settings, ...patch };
        if (patch.sharingPaused !== undefined && patch.sharingPaused !== wasPaused) {
          pushAlert(s, { to: ["guardian", "caregiver"], severity: "info", title: "Update from Circle Care", detail: patch.sharingPaused ? "Maggie paused sharing. Only emergency alerts are shared until she resumes." : "Maggie resumed sharing with the circle." });
          audit(s, actor(s), "updated", patch.sharingPaused ? "sharing (paused)" : "sharing (resumed)");
        }
      }),
      acceptConsent: () => update((s) => { s.settings.consent = { version: "1.0", at: clock(s).toISOString(), by: actor(s) }; }),
      markRead: (p: Persona) => update((s) => { for (const a of s.alerts) if (a.to.includes(p) && !a.read.includes(p)) a.read.push(p); }),
      exported: () => update((s) => { audit(s, actor(s), "exported", "a full copy of the circle's data"); }),
      denied: (resource: string) => update((s) => { audit(s, actor(s), "denied", resource); }),
    };
  }, [update]);

  return { state, actions, me };
}

type Store = ReturnType<typeof useStoreState>;
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useStoreState();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

export { ELDER, GUARDIAN, CAREGIVER, FAMILY, member, tasksFor };
export type { Approval };
