"""Sprint 26 "Safer Doses": browser tests for CC-243, CC-244, CC-246 and CC-248.

Runs against the production build, like e2e.py:
    npm run build && npx vite preview --port 4173 &
    python tests/e2e/sprint26.py

Everyone here is a fictional demo profile. Maggie marks a missed Lisinopril dose, gets a large Undo for 10 minutes,
undoes it, and Sarah gets one short note with no medicine name. After 10 minutes Undo is gone and Sarah uses
"Correct this"; the first entry stays in the history. James sees who recorded each dose and gets no "Correct this".
Maggie and James mark the same dose from two tabs at once: one record is kept, Maggie's, and James sees who got
there first. Sarah stops Metformin: it moves to the Stopped list with the date and her name, it's off Maggie's
screens, adding a medicine with its name asks "Add it again?", and Restart brings it back. The Safer Doses demo
scenario labels everything "Dummy profile (demo)" and History shows the blocked duplicate, the undo and the
stopped medicine. Each screen gets an axe pass.

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
TIME = r"\d{1,2}:\d\d\s[AP]M"
errs = []
results = []


def step(name, fn):
    try:
        fn(); results.append(f"PASS  {name}"); print(results[-1], flush=True)
    except Exception as e:
        try: pg.screenshot(path=f"{OUT}/s26-fail-{len(results)}.png", full_page=True)
        except Exception: pass
        results.append(f"FAIL  {name}: {str(e).splitlines()[0][:300]}"); print(results[-1], flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Los_Angeles", locale="en-US",
                        bypass_csp=True)  # only so axe can be injected, as a11y.py does

    def watch(page):
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" and "unsplash" not in m.text and "Failed to load resource" not in m.text else None)

    pg = ctx.new_page()
    pg.clock.set_system_time(TUESDAY)
    watch(pg)

    def go(path, page=None):
        page = page or pg
        # A hash-only change keeps the same document; load it fresh so the page reads the saved state again.
        page.goto("about:blank")
        page.goto(B + path)

    def axe(label, page=None):
        page = page or pg
        page.add_script_tag(path=AXE)
        v = page.evaluate(f"axe.run(document, {WCAG}).then(r => r.violations.map(v => v.impact + ' ' + v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(' | ')))")
        assert not v, f"{label} has accessibility problems: {v}"

    def targets(region, label):
        small = region.evaluate("""el => [...el.querySelectorAll('button, a, input, [role=switch]')]
            .filter(x => x.offsetParent !== null && x.type !== 'file')
            .map(x => [x.textContent.trim() || x.getAttribute('aria-label') || x.tagName, x.getBoundingClientRect()])
            .filter(([, r]) => r.height < 44 || r.width < 44).map(([n, r]) => `${n} ${Math.round(r.width)}x${Math.round(r.height)}`)""")
        assert not small, f"{label} has targets under 44 px: {small}"

    def signin(persona, page=None):
        page = page or pg
        go(f"/app/sign-in/{persona}", page)
        if persona == "elder":
            page.get_by_role("button", name="Sign in with Face ID").click()
        else:
            page.get_by_role("button", name="Continue").click()
            page.get_by_label("6-digit code").fill("482913")
            page.get_by_role("button", name="Sign in").click()
        page.wait_for_url(f"**/app/{persona}", timeout=5000)
        dlg = page.get_by_role("dialog", name="Getting started")
        try:
            dlg.wait_for(timeout=1500)
            dlg.get_by_role("button", name="Skip").click()
        except Exception:
            pass

    def demo(button):
        pg.get_by_role("button", name="Demo mode", exact=False).click()
        pg.get_by_role("button", name=button).click()
        pg.wait_for_timeout(500)

    def lis_row(page=None):
        page = page or pg
        return page.locator("[data-dose^='med-lisinopril@']")

    # ---------------- CC-244 ----------------

    def undo_mark():
        signin("guardian")
        demo("Simulate a missed dose")
        expect(pg.get_by_text("Lisinopril not confirmed")).to_be_visible()
        signin("elder")
        go("/app/elder/next")
        expect(pg.get_by_role("heading", name="Lisinopril")).to_be_visible()
        pg.get_by_role("button", name="I took it").click()
        pg.wait_for_url("**/app/elder", timeout=5000)
        banner = pg.get_by_role("region", name="Undo your last dose")
        expect(banner).to_contain_text("You marked Lisinopril as taken.")
        expect(banner).to_contain_text(re.compile(r"undo it for (10|9) more minutes"))
        targets(banner, "The Undo banner")
        axe("Elder Home with the Undo banner")
        pg.screenshot(path=f"{OUT}/s26-elder-undo.png", full_page=True)
        banner.get_by_role("button", name="Undo").click()
        expect(banner).to_have_count(0)
        # The dose is open again: back on her "next up" tile.
        expect(pg.get_by_role("link", name=re.compile(r"Lisinopril")).first).to_be_visible()
        signin("guardian")
        go("/app/guardian/alerts")
        note = pg.get_by_text(re.compile(rf"Correction: the {TIME} dose was marked by mistake and has been undone\. It isn't confirmed yet\."))
        expect(note).to_be_visible()
        expect(note).not_to_contain_text("Lisinopril")
        go("/app/guardian/feed")
        expect(pg.get_by_text(re.compile(r"Lisinopril .*Maggie undid a \"taken\" mark made by mistake"))).to_be_visible()

    step("CC-244 Maggie undoes a mistaken mark; Sarah gets one short note with no medicine name", undo_mark)

    def undo_window():
        signin("elder")
        go("/app/elder/next")
        pg.get_by_role("button", name="I took it").click()
        pg.wait_for_url("**/app/elder", timeout=5000)
        expect(pg.get_by_role("region", name="Undo your last dose")).to_be_visible()
        now = pg.evaluate("Date.now()")
        pg.clock.set_system_time(datetime.datetime.fromtimestamp(now / 1000 + 11 * 60, tz=PT))
        go("/app/elder")
        expect(pg.get_by_role("region", name="Undo your last dose")).to_have_count(0)

    step("CC-244 after 10 minutes the Undo is gone", undo_window)

    # ---------------- CC-243 ----------------

    def correct_this():
        signin("guardian")
        go("/app/guardian/meds")
        row = lis_row()
        expect(row).to_contain_text(re.compile(rf"Taken at {TIME} by Maggie"))
        expect(row.get_by_role("button", name=re.compile("^Undo"))).to_have_count(0)  # Sarah didn't mark it
        axe("Medicines with today's doses")
        row.get_by_role("button", name=re.compile(r"^Correct this: Lisinopril")).click()
        dlg = pg.get_by_role("dialog", name=re.compile(r"^Correct Lisinopril"))
        expect(dlg).to_contain_text("That first entry stays in the history.")
        dlg.get_by_role("button", name="Declined").click()
        dlg.get_by_label("Note (optional)").fill("She was asleep")
        axe("The Correct this sheet")
        dlg.get_by_role("button", name="Save correction").click()
        expect(row).to_contain_text(re.compile(rf"Declined at {TIME} by Maggie — “She was asleep” · corrected by Sarah"))
        go("/app/guardian/feed")
        expect(pg.get_by_text(re.compile(r"Sarah corrected Maggie's entry from taken to declined"))).to_be_visible()

    step("CC-243 Sarah uses 'Correct this'; the first entry stays in history", correct_this)

    def james_view():
        signin("family")
        go("/app/family/doses")
        expect(pg.get_by_role("heading", name="Today's doses", exact=True).first).to_be_visible()
        row = lis_row()
        expect(row).to_contain_text(re.compile(rf"Declined at {TIME} by Maggie"))
        expect(row.get_by_role("button")).to_have_count(0)  # no Taken, no Correct this
        axe("James's Today's doses")
        pg.screenshot(path=f"{OUT}/s26-family-doses.png", full_page=True)

    step("CC-243 James sees who recorded the dose and isn't offered 'Correct this'", james_view)

    def two_tabs():
        signin("guardian")
        demo("Simulate a missed dose")  # Lisinopril open again, 70 minutes late
        signin("elder")
        go("/app/elder/next")
        expect(pg.get_by_role("heading", name="Lisinopril")).to_be_visible()
        q = ctx.new_page(); watch(q)
        # James's tab runs a minute behind on purpose: Maggie's tap is the first one.
        q.clock.set_system_time(datetime.datetime.fromtimestamp(pg.evaluate("Date.now()") / 1000 + 60, tz=PT))
        signin("family", q)
        go("/app/family/doses", q)
        taken = lis_row(q).get_by_role("button", name=re.compile(r"^Taken: Lisinopril"))
        expect(taken).to_be_visible()
        pg.get_by_role("button", name="I took it").click()
        raced = True
        try:
            taken.click(timeout=1500)
        except Exception:
            raced = False  # Maggie's mark reached James's tab first, so his button was already gone
        row = lis_row(q)
        expect(row).to_contain_text(re.compile(rf"Taken at {TIME} by Maggie"), timeout=5000)
        expect(row.get_by_role("button", name=re.compile(r"^Taken: Lisinopril"))).to_have_count(0)
        if raced:
            expect(row).to_contain_text(re.compile(rf"Your tap at {TIME} wasn't saved: Maggie recorded it first\."), timeout=5000)
        print(f"      (two tabs: {'James tapped before he saw Maggie' if raced else 'James saw Maggie first'})")
        # One record on both tabs, and it's Maggie's: her Undo is still there.
        pg.wait_for_url("**/app/elder", timeout=5000)
        expect(pg.get_by_role("region", name="Undo your last dose")).to_contain_text("You marked Lisinopril as taken.", timeout=5000)
        expect(lis_row(q)).to_contain_text(re.compile(rf"Taken at {TIME} by Maggie"))
        q.close()

    step("CC-243 Maggie and James mark the same dose from two tabs: one record, James sees who was first", two_tabs)

    # ---------------- CC-246 ----------------

    def stopped_list():
        signin("guardian")
        go("/app/guardian/meds")
        card = pg.locator("article").filter(has=pg.get_by_role("heading", name="Metformin 500 mg"))
        card.get_by_role("button", name="Stop Metformin").click()
        dlg = pg.get_by_role("dialog", name="Stop Metformin?")
        dlg.get_by_label("Why (optional)").fill("Doctor stopped it")
        dlg.get_by_role("button", name="Stop Metformin").click()
        stopped = pg.get_by_role("region", name="Stopped medicines")
        expect(stopped).to_contain_text("Metformin 500 mg")
        expect(stopped).to_contain_text("Stopped on Dec 29 by Sarah · Doctor stopped it")
        expect(stopped).to_contain_text("No reminders.")
        expect(pg.locator("article").filter(has=pg.get_by_role("heading", name="Metformin 500 mg"))).to_have_count(0)
        axe("Medicines with a Stopped list")
        # Same name again: asked first.
        pg.get_by_role("button", name="Add medicine").click()
        pg.get_by_label("Name").fill("metformin")
        pg.get_by_label("Strength").fill("500 mg")
        pg.get_by_role("button", name="Add to schedule").click()
        again = pg.get_by_role("dialog", name="Add it again?")
        expect(again).to_contain_text("This was stopped on Dec 29 by Sarah. Add it again?")
        again.get_by_role("button", name="Don't add").click()
        expect(stopped.get_by_text("Metformin 500 mg")).to_have_count(1)
        # Off Maggie's screens.
        signin("elder")
        go("/app/elder/next")
        expect(pg.get_by_text("Metformin")).to_have_count(0)
        # Restart: back on the schedule, recorded as an approved change.
        signin("guardian")
        go("/app/guardian/meds")
        pg.get_by_role("button", name="Restart Metformin").click()
        pg.get_by_role("dialog", name="Restart Metformin?").get_by_role("button", name="Restart Metformin").click()
        expect(pg.get_by_role("region", name="Stopped medicines")).to_have_count(0)
        expect(pg.locator("article").filter(has=pg.get_by_role("heading", name="Metformin 500 mg"))).to_have_count(1)
        go("/app/guardian/feed")
        expect(pg.get_by_text("Approved: Restarted Metformin").first).to_be_visible()

    step("CC-246 Sarah stops Metformin: Stopped list, 'Add it again?', off Maggie's screens, Restart", stopped_list)

    # ---------------- CC-248 ----------------

    def scenario():
        signin("guardian")
        demo("Load the Safer Doses scenario")
        expect(pg.get_by_role("note").filter(has_text="Dummy profile (demo)").first).to_be_visible()
        go("/app/guardian/feed")
        expect(pg.get_by_role("note").filter(has_text="Dummy profile (demo)").first).to_be_visible()
        for text in [r"tried to mark it again\. Not saved, because \w+ already recorded it", r"Maggie undid a \"taken\" mark", r"Ibuprofen stopped"]:
            expect(pg.get_by_text(re.compile(text + r".*Dummy profile \(demo\)"))).to_be_visible()
        axe("History with the Safer Doses scenario")
        pg.screenshot(path=f"{OUT}/s26-scenario-history.png", full_page=True)
        go("/app/guardian/meds")
        expect(pg.get_by_role("region", name="Stopped medicines")).to_contain_text("Ibuprofen 200 mg")
        expect(pg.get_by_role("region", name="Stopped medicines")).to_contain_text("Dummy profile (demo)")

    step("CC-248 the Safer Doses scenario labels everything 'Dummy profile (demo)' and History shows it", scenario)

    b.close()

print()
for r in results: print(r)
if errs:
    print("\nPage errors:"); [print("  " + e) for e in errs[:10]]
sys.exit(1 if errs or any(r.startswith("FAIL") for r in results) else 0)
