import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { State, Persona, Alert, DoseStatus, Medication, Approval, Member, CareTask, Shift, Handoff, AuditEvent, Settings, CareDoc } from "./types";
import { seed, STATE_VERSION, ELDER, GUARDIAN, CAREGIVER, FAMILY } from "./demo";
import { clock, dosesFor, doseThresholds, meId, nameOf, lateCheckins, todayOf, activeSos, member, todayVisit, tasksFor, checkinToday } from "./selectors";
import { append } from "./audit";
import { can, type Action, type Resource } from "./policy";
import { hm, uid, ymd, toMin, minutesOfDay } from "../lib/time";
import { cryptoAvailable, loadEncrypted, saveEncrypted, wipeDevice } from "../lib/secureStorage";

export const STATE_KEY = "circle-care-demo";

type Updater = (draft: State) => void;

/** Adds an alert unless one with the same key already exists. */
export function pushAlert(s: State, a: Omit<Alert, "id" | "at" | "read">) {
  if (a.key && s.alerts.some((x) => x.key === a.key)) return;
  s.alerts.push({ ...a, id: uid("al"), at: clock(s).toISOString(), read: [] });
}

export function audit(s: State, actorId: string, action: AuditEvent["action"], resource: string) {
  append(s.audit, { id: uid("a"), at: clock(s).toISOString(), actorId, action, resource });
}

/** The elder may change her own display, privacy and emergency-card preferences. */
const ELDER_SETTINGS: (keyof Settings)[] = ["textSize", "highContrast", "readAloud", "sharingPaused", "elderLockMin", "emergencyCard", "toured"];

/**
 * The rules engine. In production these run server-side on a scheduler;
 * here they run in the browser every 15 seconds and after every change.
 */
export function evaluate(s: State) {
  const now = clock(s);
  const today = ymd(now);
  const nowMin = minutesOfDay(now);

  for (const d of dosesFor(s)) {
    if (d.log) continue;
    // Gentle repeat reminder for the elder 10 minutes after the dose time (CC-39).
    if (d.minutesLate >= 10) {
      pushAlert(s, {
        key: `dose-repeat-${today}-${d.key}`, to: ["elder"], severity: "info",
        title: "You have a reminder from Circle Care",
        detail: `Time for ${d.med.name} — ${d.med.dose}. ${d.med.instructions}`, link: "/app/elder/next",
      });
    }
    // Missed-dose escalation (CC-42, CC-43): caregiver first, then guardian.
    const th = doseThresholds(s, d.med);
    if (d.minutesLate >= th.caregiver) {
      pushAlert(s, {
        key: `dose-cg-${today}-${d.key}`, to: ["caregiver"], severity: d.med.critical ? "critical" : "warning",
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

  // Missed daily check-in (CC-52): one more prompt to the elder, then the guardian 15 minutes later.
  if (!checkinToday(s)) {
    const end = toMin(s.settings.checkinWindow.end);
    if (nowMin > end) {
      pushAlert(s, { key: `checkin-elder-${today}`, to: ["elder"], severity: "info", title: "You have a reminder from Circle Care", detail: "Good morning, Maggie. Tap “I'm OK” so Sarah knows you're fine.", link: "/app/elder" });
    }
    if (nowMin > end + 15) {
      pushAlert(s, {
        key: `checkin-${today}`, to: ["guardian"], severity: "warning",
        title: "Circle Care needs your attention",
        detail: `Maggie hasn't checked in today (window ${s.settings.checkinWindow.start}–${s.settings.checkinWindow.end}). Consider calling her.`, link: "/app/guardian",
      });
    }
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

  // Requests waiting more than 24 hours get a reminder (CC-64).
  for (const a of s.approvals) {
    if (a.status === "pending" && now.getTime() - new Date(a.at).getTime() > 24 * 3600000) {
      pushAlert(s, { key: `approval-remind-${a.id}`, to: ["guardian"], severity: "info", title: "You have a reminder from Circle Care", detail: `“${a.title}” has been waiting for your decision for over a day.`, link: "/app/guardian/approvals" });
    }
  }

  // Suspicious-access detection (CC-35): bulk record views or repeated denials.
  const recent = (mins: number) => s.audit.filter((e) => now.getTime() - new Date(e.at).getTime() <= mins * 60000);
  const views = new Map<string, number>();
  const denials = new Map<string, number>();
  for (const e of recent(5)) if (e.action === "viewed" && e.actorId !== ELDER) views.set(e.actorId, (views.get(e.actorId) ?? 0) + 1);
  for (const e of recent(10)) if (e.action === "denied") denials.set(e.actorId, (denials.get(e.actorId) ?? 0) + 1);
  const bucket = Math.floor(now.getTime() / (10 * 60000));
  for (const [actorId, n] of views) {
    if (n >= 8) pushAlert(s, { key: `sec-bulk-${actorId}-${bucket}`, to: ["guardian"], severity: "warning", title: "Circle Care security notice", detail: `Unusual activity: ${nameOf(s, actorId)} opened ${n} parts of Maggie's records in 5 minutes. If this wasn't expected, remove their access in Care circle.`, link: "/app/guardian/circle" });
  }
  for (const [actorId, n] of denials) {
    if (n >= 3) pushAlert(s, { key: `sec-deny-${actorId}-${bucket}`, to: ["guardian"], severity: "warning", title: "Circle Care security notice", detail: `${nameOf(s, actorId)} tried ${n} times to open information their role doesn't allow.`, link: "/app/guardian/circle" });
  }

  // Time-bound access ends automatically (CC-25).
  for (const m of s.members) {
    if (m.expiresOn && m.status === "active" && m.expiresOn < today) {
      m.status = "revoked";
      audit(s, "system", "removed", `${m.name}'s access (time limit ended)`);
    }
  }
}

function useStoreState(initial: State) {
  const [state, setState] = useState<State>(initial);
  const viewed = useRef<Record<string, number>>({});
  const saveTimer = useRef<number>(0);
  const latest = useRef(state);
  latest.current = state;

  // Encrypted, debounced save (CC-26). Flushed when the page is hidden or closed.
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { persist(state).catch(() => {}); }, 250);
  }, [state]);
  useEffect(() => {
    const flush = () => { persist(latest.current).catch(() => {}); };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

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
    /** Permission check (CC-19): refused actions change nothing and are written to the audit log. */
    const guard = (s: State, action: Action, resource: Resource, who = actor(s)) => {
      if (can(s, who, action, resource)) return true;
      audit(s, who, "denied", `${action} ${resource}`);
      return false;
    };
    return {
      setPersona: (p: Persona | null) => update((s) => { s.persona = p; }),
      signIn: (p: Persona) => update((s) => {
        s.signedIn[p] = true;
        s.persona = p;
        audit(s, meId(p), "signed in", "Circle Care");
      }),
      signOut: (p: Persona) => update((s) => { s.signedIn[p] = false; audit(s, meId(p), "signed out", "Circle Care"); }),
      /** CC-27: sign out on every device. In production this revokes all server sessions and push tokens. */
      signOutEverywhere: () => update((s) => {
        for (const p of Object.keys(s.signedIn) as Persona[]) s.signedIn[p] = false;
        audit(s, actor(s), "signed out", "all devices");
        pushAlert(s, { to: ["guardian"], severity: "info", title: "Update from Circle Care", detail: `${nameOf(s, actor(s))} signed out of Circle Care on all devices.` });
      }),
      lockedOut: (p: Persona) => update((s) => {
        pushAlert(s, { to: [p], severity: "warning", title: "Circle Care security notice", detail: "Sign-in was locked for 15 minutes after 5 incorrect codes. If this wasn't you, change your password." });
        audit(s, meId(p), "denied", "sign-in (5 incorrect codes)");
      }),
      resetDemo: () => { setState(seed()); viewed.current = {}; },
      /** CC-33: close the circle and delete its data from this device, including the encryption key. */
      closeCircle: async () => {
        await wipeDevice([STATE_KEY]);
        try {
          const log = JSON.parse(localStorage.getItem("circle-care-deletions") ?? "[]") as string[];
          localStorage.setItem("circle-care-deletions", JSON.stringify([...log, new Date().toISOString()]));
        } catch { /* ignore */ }
        setState(seed());
        viewed.current = {};
      },
      skipAhead: (min: number) => update((s) => { s.clockOffsetMin += min; }),
      simulate: (what: "late-caregiver" | "missed-checkin" | "missed-dose" | "suspicious-access" | "old-request") => update((s) => {
        const today = todayOf(s);
        const nowMin = minutesOfDay(clock(s));
        if (what === "late-caregiver") {
          const v = todayVisit(s);
          if (v) { v.checkIn = undefined; v.checkOut = undefined; }
          const sh = s.shifts.find((x) => x.id === v?.shiftId) ?? s.shifts[0];
          sh.start = hm(new Date(clock(s).getTime() - 25 * 60000));
          if (toMin(sh.end) <= nowMin) sh.end = hm(new Date(clock(s).getTime() + 4 * 60 * 60000));
          s.alerts = s.alerts.filter((a) => !a.key?.startsWith(`late-${today}`));
        }
        if (what === "missed-checkin") {
          s.checkins = s.checkins.filter((c) => c.date !== today);
          s.settings.checkinWindow = { start: hm(new Date(clock(s).getTime() - 150 * 60000)), end: hm(new Date(clock(s).getTime() - 30 * 60000)) };
          s.alerts = s.alerts.filter((a) => a.key !== `checkin-${today}` && a.key !== `checkin-elder-${today}`);
        }
        if (what === "missed-dose") {
          const lis = s.meds.find((m) => m.id === "med-lisinopril")!;
          lis.times = [hm(new Date(clock(s).getTime() - 70 * 60000))];
          s.doses = s.doses.filter((d) => !(d.medId === lis.id && d.date === today));
        }
        if (what === "suspicious-access") {
          for (const r of ["medications", "dose history", "care notes", "documents", "emergency card", "activity feed", "schedule", "care plan", "discharge summary"]) audit(s, FAMILY, "viewed", r);
        }
        if (what === "old-request") {
          const p = s.approvals.find((a) => a.status === "pending");
          if (p) p.at = new Date(clock(s).getTime() - 26 * 3600000).toISOString();
        }
      }),
      logView: (resource: string) => {
        if (Date.now() - (viewed.current[resource] ?? 0) < 10 * 60000) return;
        viewed.current[resource] = Date.now();
        update((s) => { if (s.persona) audit(s, actor(s), "viewed", resource); });
      },
      recordDose: (medId: string, time: string, status: DoseStatus, reason?: string) => update((s) => {
        if (!guard(s, "write", "doses")) return;
        const today = todayOf(s);
        const by = actor(s);
        const visit = todayVisit(s, by);
        const verified = s.persona === "caregiver" && !!visit?.checkIn && !visit?.checkOut;
        s.doses = s.doses.filter((d) => !(d.medId === medId && d.date === today && d.time === time));
        s.doses.push({ id: uid("dose"), medId, date: today, time, status, by, at: clock(s).toISOString(), verified, reason });
        audit(s, by, "created", `a dose record (${s.meds.find((m) => m.id === medId)?.name})`);
      }),
      verifyDose: (medId: string, time: string) => update((s) => {
        if (!guard(s, "write", "doses")) return;
        const d = s.doses.find((d) => d.medId === medId && d.date === todayOf(s) && d.time === time);
        if (d) d.verified = true;
      }),
      saveMed: (med: Medication, isNew: boolean) => update((s) => {
        if (!guard(s, "write", "meds")) return;
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
        if (!guard(s, "propose", "meds")) return;
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
        if (!guard(s, "approve", "approvals")) return;
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
      /** CC-48: the elder can suggest a change to who is alerted first. */
      elderSuggest: (text: string) => update((s) => {
        pushAlert(s, { to: ["guardian"], severity: "info", title: "You have a new message in Circle Care", detail: `Maggie suggested a change to her SOS list: “${text}”`, link: "/app/guardian/circle" });
        audit(s, ELDER, "created", "a suggestion about the SOS list");
      }),
      completeTask: (taskId: string, note?: string) => update((s) => {
        if (!guard(s, "write", "tasks")) return;
        const today = todayOf(s);
        s.taskLogs = s.taskLogs.filter((l) => !(l.taskId === taskId && l.date === today));
        s.taskLogs.push({ taskId, date: today, by: actor(s), at: clock(s).toISOString(), note });
      }),
      undoTask: (taskId: string) => update((s) => { if (guard(s, "write", "tasks")) s.taskLogs = s.taskLogs.filter((l) => !(l.taskId === taskId && l.date === todayOf(s))); }),
      addTask: (t: Omit<CareTask, "id">) => update((s) => {
        if (!guard(s, "write", "tasks")) return;
        s.tasks.push({ ...t, id: uid("t") });
        audit(s, actor(s), "created", `task “${t.title}”`);
      }),
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
        if (!guard(s, "respond", "sos")) return;
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
        if (!guard(s, "write", "schedule")) return;
        const i = s.shifts.findIndex((x) => x.id === sh.id);
        if (i >= 0) s.shifts[i] = sh; else s.shifts.push(sh);
        if (sh.caregiverId && !sh.accepted) pushAlert(s, { to: ["caregiver"], severity: "info", title: "You have a new shift in Circle Care", detail: `Sarah offered you a shift, ${sh.start}–${sh.end}.`, link: "/app/caregiver/schedule" });
      }),
      acceptShift: (id: string) => update((s) => { const sh = s.shifts.find((x) => x.id === id); if (sh) sh.accepted = true; }),
      requestSwap: (shiftId: string, to: string, reason: string) => update((s) => {
        if (!guard(s, "propose", "schedule")) return;
        const sh = s.shifts.find((x) => x.id === shiftId);
        if (!sh) return;
        s.approvals.push({ id: uid("ap"), kind: "shift-swap", title: `Swap ${sh.start}–${sh.end} shift to ${nameOf(s, to)}`, detail: reason || "No reason given.", requestedBy: actor(s), at: clock(s).toISOString(), status: "pending", payload: { shiftId, to } });
        pushAlert(s, { to: ["guardian"], severity: "info", title: "You have a new request in Circle Care", detail: `${nameOf(s, actor(s))} asked to swap a shift with ${nameOf(s, to)}.`, link: "/app/guardian/approvals" });
        audit(s, actor(s), "created", `a shift-swap request to ${nameOf(s, to)}`);
      }),
      addNote: (text: string, visibility: "everyone" | "guardian") => update((s) => {
        if (!guard(s, "write", visibility === "guardian" ? "notes.private" : "notes")) return;
        s.notes.push({ id: uid("n"), by: actor(s), at: clock(s).toISOString(), text, visibility });
      }),
      addDoc: (doc: Pick<CareDoc, "name" | "kind" | "size" | "fileId" | "mime">) => update((s) => {
        if (!guard(s, "write", doc.kind === "Legal authority" ? "docs.legal" : "docs")) return;
        s.docs.push({ ...doc, id: uid("d"), by: actor(s), at: clock(s).toISOString(), status: doc.kind === "Legal authority" ? "pending" : undefined });
        audit(s, actor(s), "created", `document “${doc.name}”`);
        if (doc.kind === "Legal authority") pushAlert(s, { to: ["guardian"], severity: "info", title: "Update from Circle Care", detail: `We received “${doc.name}”. Our review team usually responds within one business day.` });
      }),
      /** CC-24: trust & safety review of legal-authority documents. */
      reviewDoc: (id: string, ok: boolean, reason?: string) => update((s) => {
        if (!guard(s, "review", "docs.legal", "trust-safety")) return;
        const d = s.docs.find((x) => x.id === id);
        if (!d) return;
        d.status = ok ? "verified" : "rejected";
        d.rejectReason = ok ? undefined : reason;
        const g = s.members.find((m) => m.id === d.by);
        if (g && ok) g.verification = "verified";
        audit(s, "trust-safety", ok ? "approved" : "declined", `legal document “${d.name}”`);
        pushAlert(s, { to: ["elder", "guardian"], severity: "info", title: "Update from Circle Care", detail: ok ? `${g?.short ?? "The guardian"}'s legal authority was verified.` : `“${d.name}” couldn't be verified: ${reason}. Please upload a new copy.`, link: "/app/guardian/notes" });
      }),
      docViewed: (name: string) => update((s) => { audit(s, actor(s), "viewed", `document “${name}”`); }),
      invite: (m: Pick<Member, "name" | "role" | "relation" | "phone" | "expiresOn">) => update((s) => {
        if (!guard(s, "invite", "circle")) return;
        const colors = ["#FF6482", "#64D2FF", "#BF5AF2", "#FFD60A", "#32D74B"];
        s.members.push({ ...m, id: uid("m"), short: m.name.split(" ")[0], color: colors[s.members.length % colors.length], status: "pending", invitedAt: clock(s).toISOString(), verification: m.role === "guardian" ? "none" : undefined });
        pushAlert(s, { to: ["elder"], severity: "info", title: "Update from Circle Care", detail: `${m.name} was invited to your circle as ${m.relation}.`, link: "/app/elder/privacy" });
        audit(s, actor(s), "created", `an invitation for ${m.name}`);
      }),
      acceptInvite: (id: string) => update((s) => { const m = s.members.find((x) => x.id === id); if (m) m.status = "active"; }),
      revoke: (id: string) => update((s) => {
        if (!guard(s, "revoke", "circle")) return;
        const m = s.members.find((x) => x.id === id);
        if (!m || m.role === "elder" || m.role === "guardian") return;
        m.status = "revoked";
        s.settings.escalation = s.settings.escalation.filter((x) => x !== id);
        pushAlert(s, { to: ["guardian"], severity: "info", title: "Update from Circle Care", detail: `${nameOf(s, actor(s))} removed ${m.name} from the circle.` });
        audit(s, actor(s), "removed", `${m.name}'s access`);
      }),
      settings: (patch: Partial<Settings>) => update((s) => {
        const who = actor(s);
        const elderOnly = Object.keys(patch).every((k) => ELDER_SETTINGS.includes(k as keyof Settings));
        if (!(elderOnly && who === ELDER) && !guard(s, "write", "settings")) return;
        const wasPaused = s.settings.sharingPaused;
        s.settings = { ...s.settings, ...patch };
        if (patch.sharingPaused !== undefined && patch.sharingPaused !== wasPaused) {
          pushAlert(s, { to: ["guardian", "caregiver"], severity: "info", title: "Update from Circle Care", detail: patch.sharingPaused ? "Maggie paused sharing. Only emergency alerts are shared until she resumes." : "Maggie resumed sharing with the circle." });
          audit(s, who, "updated", patch.sharingPaused ? "sharing (paused)" : "sharing (resumed)");
        }
      }),
      /** CC-22: consent by the elder, or by her guardian on her behalf with a documented reason. */
      acceptConsent: (onBehalfReason?: string) => update((s) => { s.settings.consent = { version: "1.0", at: clock(s).toISOString(), by: actor(s), onBehalfReason }; }),
      markRead: (p: Persona) => update((s) => { for (const a of s.alerts) if (a.to.includes(p) && !a.read.includes(p)) a.read.push(p); }),
      exported: () => update((s) => { if (guard(s, "export", "data")) audit(s, actor(s), "exported", "a full copy of the circle's data"); }),
      denied: (resource: string) => update((s) => { audit(s, actor(s), "denied", resource); }),
      toured: (p: Persona) => update((s) => { s.settings.toured = { ...s.settings.toured, [p]: true }; }),
      requestSetupCall: () => update((s) => { s.settings.setupCallRequested = clock(s).toISOString(); }),
    };
  }, [update]);

  return { state, actions, me };
}

async function persist(state: State) {
  if (cryptoAvailable()) await saveEncrypted(STATE_KEY, state);
  else localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

async function loadState(): Promise<State> {
  try {
    const s = cryptoAvailable() ? await loadEncrypted<State>(STATE_KEY) : (JSON.parse(localStorage.getItem(STATE_KEY) ?? "null") as State | null);
    if (s && s.version === STATE_VERSION) return s;
  } catch {
    /* storage unavailable or unreadable — start a fresh demo */
  }
  return seed();
}

type Store = ReturnType<typeof useStoreState>;
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [initial, setInitial] = useState<State | null>(null);
  useEffect(() => { loadState().then(setInitial); }, []);
  if (!initial) return <div className="boot" aria-busy="true" aria-label="Opening Circle Care" />;
  return <Loaded initial={initial}>{children}</Loaded>;
}

function Loaded({ initial, children }: { initial: State; children: ReactNode }) {
  const store = useStoreState(initial);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

/** UI-side permission check, mirroring the data-layer guard. */
export function useCan(action: Action, resource: Resource) {
  const { state, me } = useStore();
  return can(state, me, action, resource);
}

export { ELDER, GUARDIAN, CAREGIVER, FAMILY, member, tasksFor };
export type { Approval };
