"""Sprint 25: browser tests for the three POC changes (CC-236, CC-238, CC-239).

Runs against the production build, like e2e.py:
    npm run build && npx vite preview --port 4173 &
    python tests/e2e/sprint25.py

These changes come from the dummy-profile POC round (docs/research/13-poc-research-round.md). They still need real
research to confirm them.

Maggie's first sign-in shows a short walkthrough of her three big buttons, once, with the largest text selected.
A tap on My day leaves a Saved tick in view. Sarah's low medicine shows "I asked the pharmacy" instead of
"Request refill", and after the tap the card says Circle Care doesn't contact pharmacies. Sarah turns on
"Tell me at the same time as the caregiver", the minutes picker goes away, and the choice survives a reload.
Elder Home gets an axe pass and a 44 px target check.

Exits with 1 if any scenario fails or the page throws, so CI can gate on it.
"""
import datetime
import os
import re
import sys

from playwright.sync_api import sync_playwright, expect

OUT = os.path.join(os.path.dirname(__file__), "out"); os.makedirs(OUT, exist_ok=True)
B = os.environ.get("E2E_BASE", "http://127.0.0.1:4173") + "/#"
AXE = os.path.join(os.path.dirname(__file__), "..", "..", "node_modules", "axe-core", "axe.min.js")
WCAG = "{runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}}"
PT = datetime.timezone(datetime.timedelta(hours=-8))
# Tuesday Dec 29 2026, 11:00 AM Pacific: daytime, outside quiet hours.
TUESDAY = datetime.datetime(2026, 12, 29, 11, 0, tzinfo=PT)
errs = []
results = []


def step(name, fn):
    try:
        fn(); results.append(f"PASS  {name}"); print(results[-1], flush=True)
    except Exception as e:
        try: pg.screenshot(path=f"{OUT}/s25-fail-{len(results)}.png", full_page=True)
        except Exception: pass
        results.append(f"FAIL  {name}: {str(e).splitlines()[0][:300]}"); print(results[-1], flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Los_Angeles", locale="en-US",
                        bypass_csp=True)  # only so axe can be injected, as a11y.py does
    pg = ctx.new_page()
    pg.clock.set_system_time(TUESDAY)
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

    def tour_dialog():
        dlg = pg.get_by_role("dialog", name="Getting started")
        try:
            dlg.wait_for(timeout=1500)
            return dlg
        except Exception:
            return None

    def signin(persona, tour="skip"):
        go(f"/app/sign-in/{persona}")
        if persona == "elder":
            pg.get_by_role("button", name="Sign in with Face ID").click()
        else:
            pg.get_by_role("button", name="Continue").click()
            pg.get_by_label("6-digit code").fill("482913")
            pg.get_by_role("button", name="Sign in").click()
        pg.wait_for_url(f"**/app/{persona}", timeout=5000)
        if tour == "skip":
            dlg = tour_dialog()
            if dlg: dlg.get_by_role("button", name="Skip").click()

    # ---------------- CC-238 ----------------

    def elder_walkthrough():
        signin("elder", tour="keep")
        dlg = tour_dialog()
        assert dlg, "the walkthrough did not show on Maggie's first sign-in"
        seen = []
        while True:
            seen.append(dlg.locator("h2.t-lg").inner_text())  # the step title; the sheet's own heading is "Getting started"
            if dlg.get_by_role("button", name="Next").count():
                dlg.get_by_role("button", name="Next").click()
            else:
                break
        for title in ["What's next", "SOS", "Call my person"]:
            assert title in seen, f"walkthrough steps were {seen}"
        expect(dlg).to_contain_text("Saved")
        dlg.get_by_role("button", name="Start using Circle Care").click()
        expect(pg.get_by_role("dialog", name="Getting started")).to_have_count(0)
        # Once only: signing in again shows no walkthrough.
        signin("elder", tour="keep")
        assert tour_dialog() is None, "the walkthrough showed a second time"

    step("CC-238 Maggie's first sign-in walks through What's next, SOS and Call my person, once", elder_walkthrough)

    def largest_text():
        go("/app/elder/settings")
        expect(pg.get_by_role("radio", name="Largest text")).to_have_attribute("aria-checked", "true")

    step("CC-238 the largest text is selected by default", largest_text)

    def saved_tick():
        go("/app/elder")
        day = pg.locator("section.daily")
        expect(day.get_by_role("status")).to_have_count(0)
        day.get_by_role("button", name="Breakfast").click()
        tick = day.get_by_role("status")
        expect(tick).to_have_text("Saved")
        # It stays in view after the toast has gone.
        pg.wait_for_timeout(5000)
        expect(tick).to_be_visible()
        day.get_by_role("button", name="One more glass").click()
        expect(day.get_by_role("status")).to_have_attribute("aria-label", re.compile(r"^Saved: \d+ of 6 glasses$|^That's your goal for today$"))
        targets(day, "My day")
        axe("Elder Home with the Saved tick")

    step("CC-238 a tap on My day leaves a Saved tick in view", saved_tick)

    # ---------------- CC-236 ----------------

    def refill_wording():
        signin("guardian")
        go("/app/guardian/meds")
        card = pg.locator("article").filter(has=pg.get_by_role("heading", name="Atorvastatin 20 mg"))
        expect(pg.get_by_text("Request refill")).to_have_count(0)
        expect(card).to_contain_text("Circle Care doesn't contact pharmacies.")
        card.get_by_role("button", name="I asked the pharmacy").click()
        expect(card).to_contain_text("asked Fog City Pharmacy for a refill. Circle Care doesn't contact pharmacies.")
        expect(card.get_by_role("button", name="I asked the pharmacy")).to_have_count(0)

    step("CC-236 Sarah taps 'I asked the pharmacy'; the card says Circle Care doesn't contact pharmacies", refill_wording)

    # ---------------- CC-239 ----------------

    def same_time_option():
        go("/app/guardian/settings")
        sw = pg.get_by_role("switch", name="Tell me at the same time as the caregiver")
        expect(sw).not_to_be_checked()
        expect(pg.get_by_text("Alert you after")).to_be_visible()
        sw.check()
        expect(pg.get_by_text("Alert you after")).to_have_count(0)
        go("/app/guardian/settings")
        expect(pg.get_by_role("switch", name="Tell me at the same time as the caregiver")).to_be_checked()
        pg.get_by_role("switch", name="Tell me at the same time as the caregiver").uncheck()
        expect(pg.get_by_text("Alert you after")).to_be_visible()

    step("CC-239 Sarah turns on 'Tell me at the same time as the caregiver' and it sticks", same_time_option)

    b.close()

print()
for r in results: print(r)
if errs:
    print("\nPage errors:"); [print("  " + e) for e in errs[:10]]
sys.exit(1 if errs or any(r.startswith("FAIL") for r in results) else 0)
