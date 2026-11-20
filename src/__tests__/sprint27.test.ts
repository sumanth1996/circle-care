import { describe, it, expect } from "vitest";
import { seed, GUARDIAN, ELDER, FAMILY, CAREGIVER } from "../data/demo";
import { applySettings, evaluate } from "../data/store";
import { clock } from "../data/selectors";
import { chatAudience, chatMessages } from "../data/everyday";
import { sendChat, readChat, setChatPro } from "../data/everydayActions";
import {
  EDIT_MIN, PIN_MAX, canChange, canPin, editChat, takeBack, messageText, pinMessage, unpinMessage, pinnedNotes, pinsFull,
  seenBy, seenLine, readByNames, scheduleChat, changeScheduled, cancelScheduled, sendScheduledNow, scheduledBy, runScheduled,
  muteChat, unmuteChat, chatMutedUntil, readAloudLines, searchChat, loadCircleMessagesDemo, DEMO_LABEL, demoTag,
} from "../data/circleMessages";
import { verifyChain } from "../data/audit";
import { addDays, minutesOfDay, toMin, ymd } from "../lib/time";
import type { State } from "../data/types";

// Sprint 27 "Circle Messages" (CC-249 – CC-256). Times are pinned to noon so nothing crosses midnight.

const at = (s: State, time: string) => { s.clockOffsetMin += toMin(time) - minutesOfDay(clock(s)); };
const later = (s: State, min: number) => { s.clockOffsetMin += min; evaluate(s); };
const noon = () => { const s = seed(); at(s, "12:00"); evaluate(s); return s; };
const last = (s: State) => s.chat.messages.filter((m) => m.at <= clock(s).toISOString()).sort((a, b) => a.at.localeCompare(b.at)).at(-1)!;
const say = (s: State, by: string, text: string) => { expect(sendChat(s, by, text)).toBe(true); return last(s); };
const chatAlerts = (s: State) => s.alerts.filter((a) => a.title === "New message in Circle Care");

describe("edit or take back a message within 5 minutes (CC-251)", () => {
  it("lets the sender edit for 5 minutes, shows 'edited' and keeps no earlier text", () => {
    const s = noon();
    const m = say(s, GUARDIAN, "Dinner at 5 on Sunday");
    later(s, 2);
    expect(canChange(s, GUARDIAN, m)).toBe(true);
    expect(editChat(s, GUARDIAN, m.id, "Dinner at 6 on Sunday")).toBe(true);
    expect(m.text).toBe("Dinner at 6 on Sunday");
    expect(m.editedAt! > m.at).toBe(true);
    const log = s.audit.at(-1)!;
    expect(log).toMatchObject({ actorId: GUARDIAN, action: "updated" });
    expect(log.resource).not.toContain("5 on Sunday");
    expect(JSON.stringify(s)).not.toContain("Dinner at 5 on Sunday");
  });

  it("refuses others, and the sender once 5 minutes have passed", () => {
    const s = noon();
    const m = say(s, GUARDIAN, "See you at 3");
    expect(canChange(s, FAMILY, m)).toBe(false);
    expect(editChat(s, FAMILY, m.id, "See you at 4")).toBe(false);
    expect(s.audit.at(-1)).toMatchObject({ actorId: FAMILY, action: "denied" });
    later(s, EDIT_MIN);
    expect(canChange(s, GUARDIAN, m)).toBe(false);
    expect(editChat(s, GUARDIAN, m.id, "See you at 4")).toBe(false);
    expect(takeBack(s, GUARDIAN, m.id)).toBe(false);
    expect(m.text).toBe("See you at 3");
  });

  it("taking back shows 'Message removed by Sarah', clears the words everywhere and unpins it", () => {
    const s = noon();
    const m = say(s, GUARDIAN, "Wrong chat, the gate code is zebra-quartz");
    expect(pinMessage(s, GUARDIAN, m.id)).toBe(true);
    later(s, 1);
    expect(takeBack(s, GUARDIAN, m.id)).toBe(true);
    expect(m.text).toBe("");
    expect(m.removedBy).toBe(GUARDIAN);
    expect(m.pinnedAt).toBeUndefined();
    expect(messageText(s, m)).toBe("Message removed by Sarah");
    expect(JSON.stringify(s)).not.toContain("zebra-quartz");
    expect(s.audit.at(-1)).toMatchObject({ actorId: GUARDIAN, action: "removed" });
    expect(canChange(s, GUARDIAN, m)).toBe(false);
    expect(searchChat(s, FAMILY, "gate")).toHaveLength(0);
    expect(verifyChain(s.audit).ok).toBe(true);
  });

  it("rejects an empty edit or one that's too long", () => {
    const s = noon();
    const m = say(s, FAMILY, "Hello");
    expect(editChat(s, FAMILY, m.id, "   ")).toBe(false);
    expect(editChat(s, FAMILY, m.id, "x".repeat(1001))).toBe(false);
    expect(m.text).toBe("Hello");
  });
});

describe("pinned notes (CC-249)", () => {
  it("only Maggie and Sarah pin, up to 3, oldest pin first", () => {
    const s = noon();
    expect(canPin(ELDER) && canPin(GUARDIAN)).toBe(true);
    expect(canPin(FAMILY) || canPin(CAREGIVER)).toBe(false);
    const a = say(s, GUARDIAN, "Dinner Sunday at 5");
    expect(pinMessage(s, FAMILY, a.id)).toBe(false);
    expect(s.audit.at(-1)).toMatchObject({ actorId: FAMILY, action: "denied" });
    const ids = [a, say(s, FAMILY, "Garden club Thursday"), say(s, ELDER, "Church at 10")].map((m) => m.id);
    for (const id of ids) { later(s, 1); expect(pinMessage(s, GUARDIAN, id)).toBe(true); }
    expect(pinnedNotes(s, FAMILY).map((m) => m.id)).toEqual(ids);
    expect(pinsFull(s)).toBe(true);
    const d = say(s, ELDER, "Bring chairs Saturday");
    expect(pinMessage(s, ELDER, d.id)).toBe(false);
    expect(pinMessage(s, ELDER, d.id, ids[1])).toBe(true);
    expect(pinnedNotes(s).map((m) => m.id)).toEqual([ids[0], ids[2], d.id]);
    expect(pinnedNotes(s)).toHaveLength(PIN_MAX);
    expect(unpinMessage(s, GUARDIAN, ids[0])).toBe(true);
    expect(pinnedNotes(s)).toHaveLength(2);
  });

  it("a caregiver added later can't see or be shown a pin from before they joined", () => {
    const s = noon();
    const m = say(s, GUARDIAN, "Family dinner Sunday");
    pinMessage(s, GUARDIAN, m.id);
    later(s, 5);
    setChatPro(s, GUARDIAN, CAREGIVER, true);
    expect(pinnedNotes(s, CAREGIVER)).toHaveLength(0);
    expect(seenBy(s, m).notYet).not.toContain("Ana");
  });
});

describe("who has seen a pinned note (CC-250)", () => {
  it("lists who has seen it and who hasn't yet, leaving out the sender", () => {
    const s = noon();
    const m = say(s, GUARDIAN, "Dinner Sunday at 5");
    pinMessage(s, GUARDIAN, m.id);
    later(s, 1);
    readChat(s, FAMILY);
    expect(seenBy(s, m)).toEqual({ seen: ["James"], notYet: ["Maggie"], notShared: [] });
    expect(seenLine(s, m)).toBe("Seen by James. Not yet: Maggie");
    readChat(s, ELDER);
    expect(seenLine(s, m)).toBe("Seen by Maggie and James");
  });

  it("shows Maggie as 'not shared' when she turns it off, and only she can turn it off", () => {
    const s = noon();
    applySettings(s, GUARDIAN, { elderShowsRead: false });
    expect(s.settings.elderShowsRead).toBe(true);
    expect(s.audit.at(-1)).toMatchObject({ actorId: GUARDIAN, action: "denied" });
    applySettings(s, ELDER, { elderShowsRead: false });
    expect(s.settings.elderShowsRead).toBe(false);
    const m = say(s, GUARDIAN, "Dinner Sunday at 5");
    later(s, 1);
    readChat(s, ELDER);
    expect(seenBy(s, m).notShared).toEqual(["Maggie"]);
    expect(seenLine(s, m)).toBe("Not seen yet. Maggie: not shared");
    expect(readByNames(s, m)).not.toContain("Maggie");
  });
});

describe("send later (CC-252)", () => {
  it("only the sender sees it, and it posts at its time with the time it was due", () => {
    const s = noon();
    const sendAt = new Date(clock(s).getTime() + 30 * 60000).toISOString();
    const id = scheduleChat(s, GUARDIAN, "Good morning, everyone", sendAt);
    expect(id).toBeTruthy();
    expect(scheduledBy(s, GUARDIAN)).toHaveLength(1);
    expect(scheduledBy(s, FAMILY)).toHaveLength(0);
    expect(chatMessages(s, FAMILY).some((m) => m.text === "Good morning, everyone")).toBe(false);
    later(s, 31);
    const sent = chatMessages(s, FAMILY).find((m) => m.text === "Good morning, everyone")!;
    expect(sent).toMatchObject({ by: GUARDIAN, at: sendAt });
    expect(scheduledBy(s, GUARDIAN)).toHaveLength(0);
    expect(chatAlerts(s).some((a) => a.to.includes("elder"))).toBe(true);
  });

  it("can be changed, sent now or cancelled, only by its sender, and refuses a time in the past", () => {
    const s = noon();
    const soon = (min: number) => new Date(clock(s).getTime() + min * 60000).toISOString();
    expect(scheduleChat(s, GUARDIAN, "Too late", soon(-1))).toBe(false);
    const id = scheduleChat(s, GUARDIAN, "Plan for tomorrow", soon(60)) as string;
    expect(changeScheduled(s, FAMILY, id, "Hijack", soon(70))).toBe(false);
    expect(changeScheduled(s, GUARDIAN, id, "Plan for tomorrow, updated", soon(70))).toBe(true);
    expect(cancelScheduled(s, FAMILY, id)).toBe(false);
    expect(sendScheduledNow(s, GUARDIAN, id)).toBe(true);
    expect(last(s)).toMatchObject({ text: "Plan for tomorrow, updated", by: GUARDIAN });
    const other = scheduleChat(s, GUARDIAN, "Never mind", soon(60)) as string;
    expect(cancelScheduled(s, GUARDIAN, other)).toBe(true);
    later(s, 61);
    expect(chatMessages(s).some((m) => m.text === "Never mind")).toBe(false);
  });

  it("holds Sarah's notice in her quiet hours, and drops a message whose sender has left the chat", () => {
    const s = noon();
    at(s, "21:50");
    const sendAt = new Date(clock(s).getTime() + 20 * 60000).toISOString(); // 10:10 PM, in her quiet hours
    scheduleChat(s, FAMILY, "Goodnight all", sendAt);
    later(s, 25);
    const alert = chatAlerts(s).find((a) => a.detail === "James wrote in the family chat." && a.to.includes("guardian"));
    expect(alert?.held ?? []).toContain("guardian");

    const t = noon();
    setChatPro(t, GUARDIAN, CAREGIVER, true);
    scheduleChat(t, CAREGIVER, "Running 10 minutes late", new Date(clock(t).getTime() + 30 * 60000).toISOString());
    setChatPro(t, GUARDIAN, CAREGIVER, false);
    later(t, 31);
    expect(chatMessages(t).some((m) => m.text === "Running 10 minutes late")).toBe(false);
    expect(t.chat.scheduled).toHaveLength(0);
  });
});

describe("mute for a day (CC-253)", () => {
  it("'until tomorrow morning' ends at 8 AM tomorrow and stops chat notices, not safety alerts", () => {
    const s = noon();
    expect(muteChat(s, GUARDIAN, "morning")).toBe(true);
    const until = chatMutedUntil(s, GUARDIAN)!;
    expect(until).toBe(new Date(`${ymd(addDays(clock(s), 1))}T08:00:00`).toISOString());
    expect(chatAudience(s, FAMILY)).not.toContain("guardian");
    expect(chatAudience(s, FAMILY)).toContain("elder");
    expect(unmuteChat(s, GUARDIAN)).toBe(true);
    expect(chatAudience(s, FAMILY)).toContain("guardian");
  });

  it("'for 24 hours' ends a day later, and the mute lifts by itself", () => {
    const s = noon();
    muteChat(s, ELDER, "day");
    expect(new Date(chatMutedUntil(s, ELDER)!).getTime() - clock(s).getTime()).toBe(24 * 3600000);
    later(s, 24 * 60 + 1);
    expect(chatMutedUntil(s, ELDER)).toBeUndefined();
    expect(chatAudience(s, FAMILY)).toContain("elder");
  });
});

describe("read new messages aloud to Maggie (CC-254)", () => {
  it("reads pinned notes first, then new messages oldest first, and nothing when nothing is new", () => {
    const s = noon();
    readChat(s, ELDER);
    later(s, 1);
    const pin = say(s, GUARDIAN, "Dinner Sunday at 5");
    pinMessage(s, GUARDIAN, pin.id);
    later(s, 1);
    say(s, FAMILY, "I'll bring pie");
    later(s, 1);
    say(s, GUARDIAN, "Thanks James");
    expect(readAloudLines(s, ELDER).map((l) => l.text)).toEqual([
      "Pinned note from Sarah: Dinner Sunday at 5",
      "James says: I'll bring pie",
      "Sarah says: Thanks James",
    ]);
    readChat(s, ELDER);
    expect(readAloudLines(s, ELDER)).toEqual([]);
  });

  it("'Names only' says just who wrote, and only Maggie can choose it", () => {
    const s = noon();
    applySettings(s, GUARDIAN, { elderChatReading: "names" });
    expect(s.settings.elderChatReading).toBe("full");
    applySettings(s, ELDER, { elderChatReading: "names" });
    readChat(s, ELDER);
    later(s, 1);
    say(s, FAMILY, "The results came back fine");
    expect(readAloudLines(s, ELDER).map((l) => l.text)).toEqual(["New message from James."]);
  });
});

describe("search the chat (CC-255)", () => {
  it("finds what this person can read, newest first, ignoring case", () => {
    const s = noon();
    say(s, GUARDIAN, "Dinner on Sunday");
    later(s, 1);
    say(s, FAMILY, "Is dinner at 5?");
    const found = searchChat(s, FAMILY, "DINNER");
    expect(found.map((m) => m.text).slice(0, 2)).toEqual(["Is dinner at 5?", "Dinner on Sunday"]);
    expect(searchChat(s, FAMILY, "d")).toEqual([]);
  });

  it("doesn't show a caregiver anything from before they joined", () => {
    const s = noon();
    say(s, GUARDIAN, "Dinner on Sunday");
    later(s, 5);
    expect(searchChat(s, CAREGIVER, "dinner")).toEqual([]);
    setChatPro(s, GUARDIAN, CAREGIVER, true);
    expect(searchChat(s, CAREGIVER, "dinner")).toEqual([]);
  });
});

describe("Circle Messages demo scenario (CC-256)", () => {
  it("loads a labelled week of dummy chat with a pinned note, a taken-back message and a scheduled one", () => {
    const s = noon();
    loadCircleMessagesDemo(s);
    const demo = s.chat.messages.filter((m) => m.demo);
    expect(demo.length).toBeGreaterThanOrEqual(8);
    expect(demoTag(demo[0])).toBe(DEMO_LABEL);
    expect(DEMO_LABEL).toBe("Dummy profile (demo)");
    expect(s.demoScenario).toBe("circle-messages");
    expect(pinnedNotes(s, FAMILY).some((m) => m.demo && m.text.includes("Family dinner"))).toBe(true);
    expect(demo.some((m) => m.removedAt && !m.text)).toBe(true);
    expect(scheduledBy(s, GUARDIAN).some((x) => x.demo)).toBe(true);
    expect(verifyChain(s.audit).ok).toBe(true);
  });

  it("loading it twice gives the same story, and the scheduled message goes out in the morning", () => {
    const s = noon();
    loadCircleMessagesDemo(s);
    const n = s.chat.messages.length;
    loadCircleMessagesDemo(s);
    expect(s.chat.messages).toHaveLength(n);
    expect(s.chat.scheduled).toHaveLength(1);
    s.clockOffsetMin += 21 * 60; // 9 AM tomorrow
    runScheduled(s);
    expect(chatMessages(s, FAMILY).some((m) => m.demo && m.text.startsWith("Good morning, everyone"))).toBe(true);
  });
});
