"""Sprint 22: browser tests for feeling confident at home (CC-129, CC-132 to CC-134, CC-138, CC-139).

Runs against the production build, like e2e.py:
    npm run build && npx vite preview --port 4173 &
    python tests/e2e/sprint22.py

Maggie marks a resting or away day and Sarah sees it instead of alerts. Sarah writes a memory aid (a note that
looks like a code is refused), Ana reads it on shift, and Maggie's home shows it large, reads it aloud once and
records Got it. Maggie asks "Is this a scam?", Sarah works through the checklist and marks it resolved, and
Maggie sees she's safe. The weekly tip shows on Monday, Not now brings it back the next day, Got it moves the
progress on. Elder screens get an axe pass, a 44 px target check and a 200% zoom check.

Exits with 1 if any scenario fails or the page throws, so CI can gate on it.
"""
import datetime
import os
import sys

from playwright.sync_api import sync_playwright, expect

OUT = os.path.join(os.path.dirname(__file__), "out"); os.makedirs(OUT, exist_ok=True)
B = os.environ.get("E2E_BASE", "http://127.0.0.1:4173") + "/#"
AXE = os.path.join(os.path.dirname(__file__), "..", "..", "node_modules", "axe-core", "axe.min.js")
WCAG = "{runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}}"
PT = datetime.timezone(datetime.timedelta(hours=-8))
# Monday Dec 7 2026, 9:00 AM Pacific: Ana is on shift (8 AM to 2 PM) and the week's tip is due.
MONDAY = datetime.datetime(2026, 12, 7, 9, 0, tzinfo=PT)
errs = []
results = []

# Records what would be read aloud, instead of speaking it.
SPEECH = """
window.__spoken = [];
if (window.speechSynthesis) {
  window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); };
  window.speechSynthesis.cancel = () => {};
}
"""


def step(name, fn):
    try:
        fn(); results.append(f"PASS  {name}"); print(results[-1], flush=True)
    except Exception as e:
        try: pg.screenshot(path=f"{OUT}/s22-fail-{len(results)}.png", full_page=True)
        except Exception: pass
        results.append(f"FAIL  {name}: {str(e).splitlines()[0][:300]}"); print(results[-1], flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Los_Angeles", locale="en-US",
                        bypass_csp=True)  # only so axe can be injected, as a11y.py does
    ctx.add_init_script(SPEECH)
    pg = ctx.new_page()
    pg.clock.set_system_time(MONDAY)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "unsplash" not in m.text and "Failed to load resource" not in m.text else None)

    def go(path):
        # A hash-only change keeps the same document; load it fresh so the page reads the saved state again.
        pg.goto("about:blank")
        pg.goto(B + path)

    def axe(label):
        pg.add_script_tag(path=AXE)
        v = pg.evaluate(f"axe.run(document, {WCAG}).then(r => r.violations.map(v => v.impact + ' ' + v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(' | ')))")
        assert not v, f"{label} has accessibility problems: {v}"

    def targets(region, label):
        small = region.evaluate("""el => [...el.querySelectorAll('button, a, input, [role=switch]')]
            .filter(x => x.offsetParent !== null && x.type !== 'file')
            .map(x => [x.textContent.trim() || x.getAttribute('aria-label') || x.tagName, x.getBoundingClientRect()])
            .filter(([, r]) => r.height < 44 || r.width < 44).map(([n, r]) => `${n} ${Math.round(r.width)}x${Math.round(r.height)}`)""")
        assert not small, f"{label} has targets under 44 px: {small}"

    def zoom(label):
        # 200% zoom on a 390 px phone is the same layout as a 195 px wide window.
        pg.set_viewport_size({"width": 195, "height": 844})
        try:
            wide = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            assert wide <= 1, f"{label} scrolls sideways by {wide} px at 200% zoom"
        finally:
            pg.set_viewport_size({"width": 390, "height": 844})

    def skip_tour():
        dlg = pg.get_by_role("dialog", name="Getting started")
        try:
            dlg.wait_for(timeout=1500)
        except Exception:
            return
        dlg.get_by_role("button", name="Skip").click()

    def signin(persona):
        go(f"/app/sign-in/{persona}")
        if persona == "elder":
            pg.get_by_role("button", name="Sign in with Face ID").click()
        else:
            pg.get_by_role("button", name="Continue").click()
            pg.get_by_label("6-digit code").fill("482913")
            pg.get_by_role("button", name="Sign in").click()
        pg.wait_for_url(f"**/app/{persona}", timeout=5000)
        skip_tour()

    # ---------------- CC-129 ----------------

    def maggie_rests():
        signin("elder")
        quiet = pg.get_by_role("region", name="Resting or away")
        quiet.get_by_role("button", name="Resting today").click()
        expect(quiet).to_contain_text("You're resting today")
        targets(quiet, "The resting card")
        signin("guardian")
        expect(pg.get_by_role("region", name="Maggie's quiet day")).to_contain_text("Maggie is resting today")
        expect(pg.get_by_role("region", name="Maggie's quiet day")).to_contain_text("Medicine and SOS alerts still come to you.")

    step("CC-129 Maggie taps Resting today; Sarah sees 'Maggie is resting today' instead of alerts", maggie_rests)

    def maggie_away_then_back():
        signin("elder")
        quiet = pg.get_by_role("region", name="Resting or away")
        quiet.get_by_role("button", name="I'm back").click()
        quiet.get_by_role("button", name="Away until…").click()
        date = quiet.get_by_label("Back on")
        expect(date).to_have_attribute("max", "2026-12-21")
        date.fill("2026-12-11")
        quiet.get_by_role("button", name="Save").click()
        expect(quiet).to_contain_text("You're away until Fri, Dec 11")
        signin("guardian")
        expect(pg.get_by_role("region", name="Maggie's quiet day")).to_contain_text("Maggie is away until Fri, Dec 11")
        signin("elder")
        pg.get_by_role("region", name="Resting or away").get_by_role("button", name="I'm back").click()
        expect(pg.get_by_role("region", name="Resting or away")).to_contain_text("Taking a quiet day?")
        signin("guardian")
        expect(pg.get_by_role("region", name="Maggie's quiet day")).to_have_count(0)

    step("CC-129 Away until a date up to 14 days ahead, then I'm back clears it for Sarah", maggie_away_then_back)

    # ---------------- CC-138 ----------------

    def sarah_writes_note():
        signin("guardian")
        go("/app/guardian/memory-aids")
        expect(pg.get_by_role("heading", name="Notes for Maggie")).to_be_visible()
        form = pg.get_by_role("form", name="New note")
        form.get_by_label("Note", exact=True).fill("The door code is 4821")
        expect(form.get_by_role("alert")).to_have_text("This looks like a PIN, door code or password. Please leave it out of the note.")
        form.get_by_role("button", name="Add note").click()
        expect(pg.get_by_role("region", name="Notes on Maggie's home")).not_to_contain_text("4821")
        form.get_by_label("Note", exact=True).fill("Your glasses are on the hall shelf.")
        expect(form.get_by_text("35 of 140 characters")).to_be_visible()
        form.get_by_role("button", name="Add note").click()
        expect(pg.get_by_role("region", name="Notes on Maggie's home")).to_contain_text("Your glasses are on the hall shelf.")
        axe("Sarah's Memory aids page")

    step("CC-138 Sarah adds a note; one that looks like a door code is refused", sarah_writes_note)

    def ana_reads_only():
        signin("caregiver")
        go("/app/caregiver/memory-aids")
        expect(pg.get_by_role("region", name="Notes on Maggie's home")).to_contain_text("Your glasses are on the hall shelf.")
        expect(pg.get_by_role("form", name="New note")).to_have_count(0)
        expect(pg.get_by_role("button", name="Change")).to_have_count(0)

    step("CC-138 Ana, on shift, reads the notes but can't add or change them", ana_reads_only)

    # ---------------- CC-139 ----------------

    def maggie_sees_note():
        signin("elder")
        aids = pg.get_by_role("region", name="Notes from your family")
        expect(aids).to_contain_text("Your glasses are on the hall shelf.")
        expect(aids).to_contain_text("Your keys are in the blue bowl by the door.")
        # Read aloud once: the new note is spoken, the one she already heard is not.
        pg.wait_for_function("window.__spoken.some(t => t.includes('glasses'))", timeout=4000)
        spoken = pg.evaluate("window.__spoken")
        assert not any("keys" in t for t in spoken), spoken
        note = aids.get_by_role("article", name="Note from Sarah").filter(has_text="glasses")
        note.get_by_role("button", name="Read again").click()
        assert pg.evaluate("window.__spoken.filter(t => t.includes('glasses')).length") == 2
        targets(aids, "The notes on Maggie's home")
        axe("Maggie's home with notes")
        zoom("Maggie's home with notes")
        # Reload: still not read aloud a second time.
        go("/app/elder")
        expect(pg.get_by_role("region", name="Notes from your family")).to_contain_text("glasses")
        pg.wait_for_timeout(800)
        assert not pg.evaluate("window.__spoken.some(t => t.includes('glasses'))"), "a note was read aloud twice"
        pg.get_by_role("region", name="Notes from your family").get_by_role("article").filter(has_text="glasses").get_by_role("button", name="Got it").click()
        expect(pg.get_by_role("region", name="Notes from your family")).not_to_contain_text("glasses")

    step("CC-139 Maggie's home shows the note large, reads it aloud once, Read again repeats it, Got it clears it", maggie_sees_note)

    def sarah_sees_seen():
        signin("guardian")
        go("/app/guardian/memory-aids")
        row = pg.get_by_role("region", name="Notes on Maggie's home").get_by_role("article").filter(has_text="glasses")
        expect(row).to_contain_text("Seen at 9:")

    step("CC-138 Sarah sees when Maggie read the note", sarah_sees_seen)

    def maggie_turns_off():
        signin("elder")
        go("/app/elder/settings")
        sw = pg.get_by_role("switch", name='Show the note "Your keys are in the blue bowl by the door."')
        expect(sw).to_be_checked()
        sw.uncheck(force=True)
        # Read-aloud off: a new note stays silent.
        pg.get_by_role("switch", name="Read things aloud").uncheck(force=True)
        axe("Maggie's settings with notes")
        signin("guardian")
        go("/app/guardian/memory-aids")
        form = pg.get_by_role("form", name="New note")
        form.get_by_label("Note", exact=True).fill("Library books go back on Friday.")
        form.get_by_role("button", name="Add note").click()
        signin("elder")
        aids = pg.get_by_role("region", name="Notes from your family")
        expect(aids).to_contain_text("Library books go back on Friday.")
        expect(aids).not_to_contain_text("blue bowl")
        expect(aids.get_by_role("button", name="Read again")).to_have_count(0)
        pg.wait_for_timeout(800)
        assert not pg.evaluate("window.__spoken.some(t => t.includes('Library'))"), "spoken with read-aloud off"
        go("/app/elder/settings")
        pg.get_by_role("switch", name="Read things aloud").check(force=True)
        pg.get_by_role("switch", name='Show the note "Your keys are in the blue bowl by the door."').check(force=True)

    step("CC-138, CC-139 Maggie turns a note off in Settings; with read-aloud off the card is silent", maggie_turns_off)

    # ---------------- CC-132 ----------------

    def maggie_reports():
        signin("elder")
        pg.get_by_role("link", name="Is this a scam?").click()
        pg.wait_for_url("**/app/elder/scam")
        expect(pg.get_by_role("heading", name="Is this a scam?")).to_be_visible()
        axe("The scam check")
        zoom("The scam check")
        pg.get_by_role("radio", name="Phone call").click()
        pg.get_by_label("Anything to add?").fill("They said they were from my bank and wanted the code.")
        pg.get_by_role("button", name="Tell Sarah").click()
        sent = pg.get_by_role("status", name="Report sent")
        expect(sent).to_contain_text("Don't send money or share codes. Sarah has been told.")
        expect(sent.get_by_role("link", name="Call Sarah")).to_have_attribute("href", "tel:+14155550177")
        axe("The scam report sent")
        sent.get_by_role("button", name="Back to home").click()
        expect(pg.get_by_role("region", name="Scam checks")).to_contain_text("Sarah has been told.")

    step("CC-132 Maggie asks 'Is this a scam?' about a call and sees what to do, with Call Sarah", maggie_reports)

    def sarah_alerted_not_family():
        signin("guardian")
        go("/app/guardian/alerts")
        expect(pg.get_by_text('Maggie asked "Is this a scam?" about a phone call.').first).to_be_visible()
        expect(pg.get_by_text("from my bank")).to_have_count(0)
        signin("family")
        go("/app/family/alerts")
        expect(pg.get_by_text("Is this a scam?")).to_have_count(0)

    step("CC-132 Sarah gets the alert straight away without the note; James doesn't", sarah_alerted_not_family)

    # ---------------- CC-133 ----------------

    def sarah_resolves():
        signin("guardian")
        scams = pg.get_by_role("region", name="Scam checks")
        scams.get_by_role("link", name="Phone call").click()
        expect(pg.get_by_role("heading", name="Phone call")).to_be_visible()
        expect(pg.get_by_role("region", name="What Maggie shared")).to_contain_text("They said they were from my bank and wanted the code.")
        expect(pg.get_by_role("link", name="Call Maggie")).to_have_attribute("href", "tel:+14155550141")
        check = pg.get_by_role("region", name="Checklist")
        check.get_by_label("Call Maggie's bank using the number on her card or statement").check()
        expect(check).to_contain_text("Report it to the FTC or the state attorney general's office")
        axe("Sarah's scam report")
        # The tick is kept for every guardian.
        go(pg.url.split("#", 1)[1])
        expect(pg.get_by_role("region", name="Checklist").get_by_label("Call Maggie's bank using the number on her card or statement")).to_be_checked()
        pg.get_by_label("A note for Maggie").fill("It was a scam. I called the bank and your card is safe.")
        pg.get_by_role("button", name="Mark resolved").click()
        expect(pg.get_by_role("region", name="Resolved")).to_contain_text("Resolved by Sarah")

    step("CC-133 Sarah opens the report, ticks the checklist and marks it resolved with a note", sarah_resolves)

    def maggie_safe():
        signin("elder")
        scams = pg.get_by_role("region", name="Scam checks")
        expect(scams).to_contain_text("Sarah: It was a scam. I called the bank and your card is safe.")
        scams.get_by_role("button", name="OK").click()
        expect(pg.get_by_role("region", name="Scam checks")).to_have_count(0)

    step("CC-133 Maggie sees Sarah's note once the report is resolved", maggie_safe)

    # ---------------- CC-134 ----------------

    def weekly_tip():
        signin("elder")
        tip = pg.get_by_role("region", name="This week's tip")
        expect(tip).to_contain_text("0 of 12 tips")
        expect(tip).to_contain_text("Your bank never asks for a code")
        expect(tip).to_contain_text("For example:")
        targets(tip, "The weekly tip")
        axe("Maggie's home with the weekly tip")
        tip.get_by_role("button", name="Read it to me").click()
        assert pg.evaluate("window.__spoken.some(t => t.startsWith('Your bank never asks for a code'))")
        tip.get_by_role("button", name="Not now").click()
        expect(pg.get_by_role("region", name="This week's tip")).to_have_count(0)
        # Tuesday morning: it's back.
        pg.clock.set_system_time(MONDAY + datetime.timedelta(days=1))
        go("/app/elder")
        tip = pg.get_by_role("region", name="This week's tip")
        expect(tip).to_contain_text("Your bank never asks for a code")
        tip.get_by_role("button", name="Got it").click()
        expect(pg.get_by_role("region", name="This week's tip")).to_have_count(0)
        # Next Monday: the next tip, with the progress moved on.
        pg.clock.set_system_time(MONDAY + datetime.timedelta(days=7))
        go("/app/elder")
        tip = pg.get_by_role("region", name="This week's tip")
        expect(tip).to_contain_text("1 of 12 tips")
        expect(tip).to_contain_text("Gift cards are for gifts")

    step("CC-134 Monday's tip shows; Not now brings it back the next day; Got it moves to the next week's", weekly_tip)

    b.close()

print("\n".join(results))
print("errors:", errs[:10] if errs else "none")
sys.exit(1 if errs or any(r.startswith("FAIL") for r in results) else 0)
