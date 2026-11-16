"""Sprint 16: browser tests for calm alerts (CC-206, CC-207).

Runs against the production build, like e2e.py:
    npm run build && npx vite preview --port 4173 &
    python tests/e2e/calm.py

Exits with 1 if any scenario fails or the page throws, so CI can gate on it.
"""
import datetime
import os
import re
import sys

from playwright.sync_api import sync_playwright, expect

OUT = os.path.join(os.path.dirname(__file__), "out"); os.makedirs(OUT, exist_ok=True)
B = os.environ.get("E2E_BASE", "http://127.0.0.1:4173") + "/#"
errs = []
results = []


def step(name, fn):
    try:
        fn(); results.append(f"PASS  {name}"); print(results[-1], flush=True)
    except Exception as e:
        try: pg.screenshot(path=f"{OUT}/calm-fail-{len(results)}.png", full_page=True)
        except Exception: pass
        results.append(f"FAIL  {name}: {str(e).splitlines()[0][:300]}"); print(results[-1], flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/New_York")
    pg = ctx.new_page()
    # A Wednesday at 12:35 PM: Vitamin D (12:30) is due and its first reminder has gone out.
    pg.clock.set_system_time(datetime.datetime(2026, 10, 21, 12, 35, tzinfo=datetime.timezone(datetime.timedelta(hours=-4))))
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "unsplash" not in m.text and "Failed to load resource" not in m.text else None)

    def skip_tour():
        dlg = pg.get_by_role("dialog", name="Getting started")
        try:
            dlg.wait_for(timeout=1500)
        except Exception:
            return
        dlg.get_by_role("button", name="Skip").click()

    def signin(persona):
        pg.goto(B + f"/app/sign-in/{persona}")
        if persona == "elder":
            pg.get_by_role("button", name="Sign in with Face ID").click()
        else:
            pg.get_by_role("button", name="Continue").click()
            pg.get_by_label("6-digit code").fill("482913")
            pg.get_by_role("button", name="Sign in").click()
        pg.wait_for_url(f"**/app/{persona}", timeout=5000)
        skip_tour()

    def snooze():
        signin("elder")
        pg.goto(B + "/app/elder/next")
        expect(pg.get_by_role("heading", name="Vitamin D3")).to_be_visible()
        expect(pg.get_by_text("Reminder 1 of 3", exact=False)).to_be_visible()
        pg.get_by_role("button", name="Remind me in 15 minutes").click()
        pg.wait_for_url("**/app/elder", timeout=5000)
        pg.goto(B + "/app/elder/next")
        expect(pg.get_by_text("Next reminder in 15 minutes", exact=False)).to_be_visible()
        expect(pg.get_by_role("button", name="Remind me in 15 minutes")).to_have_count(0)
        pg.screenshot(path=f"{OUT}/calm-elder-snoozed.png", full_page=True)
    step("CC-207 Maggie sees which reminder this is and snoozes it for 15 minutes", snooze)

    def repeats_setting():
        signin("guardian")
        pg.goto(B + "/app/guardian/settings")
        sel = pg.get_by_label("Reminder repeats")
        sel.evaluate("e => e.scrollIntoView({ block: 'center' })")
        expect(sel).to_have_value("3")
        sel.select_option("5")
        pg.reload()
        expect(pg.get_by_label("Reminder repeats")).to_have_value("5")
        expect(pg.get_by_text("SOS, falls and high-priority medicines still come at once", exact=False)).to_be_visible()
        pg.get_by_label("Reminder repeats").select_option("3")
    step("CC-207 Sarah sets how many reminders Maggie gets, and it is kept", repeats_setting)

    def all_clear():
        signin("guardian")
        pg.get_by_role("button", name="Demo mode", exact=False).click()
        pg.get_by_role("button", name="Simulate a missed dose").click()
        pg.wait_for_timeout(500)
        expect(pg.get_by_text("Lisinopril not confirmed")).to_be_visible()
        signin("elder")
        pg.goto(B + "/app/elder/next")
        expect(pg.get_by_role("heading", name="Lisinopril")).to_be_visible()
        pg.get_by_role("button", name="I took it").click()
        pg.wait_for_url("**/app/elder", timeout=5000)
        signin("guardian")
        pg.goto(B + "/app/guardian/alerts")
        clear = pg.get_by_text(re.compile(r"All clear: the \d{1,2}:\d\d\s[AP]M dose was taken at \d{1,2}:\d\d\s[AP]M\."))
        expect(clear).to_be_visible()
        expect(clear).not_to_contain_text("Lisinopril")
        expect(pg.get_by_text(re.compile(r"^Resolved: marked taken at .* by Maggie\.$")).first).to_be_visible()
        pg.screenshot(path=f"{OUT}/calm-guardian-all-clear.png", full_page=True)
    step("CC-206 Sarah gets an all-clear naming no medicine once Maggie takes a missed dose", all_clear)

    b.close()

print("\n".join(results))
print("errors:", errs[:10] if errs else "none")
sys.exit(1 if errs or any(r.startswith("FAIL") for r in results) else 0)
