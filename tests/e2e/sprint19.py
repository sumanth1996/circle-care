"""Sprint 19: browser tests for the call log (CC-226 to CC-228) and What matters to me (CC-219).

Runs against the production build, like e2e.py:
    npm run build && npx vite preview --port 4173 &
    python tests/e2e/sprint19.py

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

ORG = "Golden Gate Home Care"
STEP = "Confirm the Saturday aide"
OUTCOME = "They will send a new aide on Saturdays starting next week."


def step(name, fn):
    try:
        fn(); results.append(f"PASS  {name}"); print(results[-1], flush=True)
    except Exception as e:
        try: pg.screenshot(path=f"{OUT}/s19-fail-{len(results)}.png", full_page=True)
        except Exception: pass
        results.append(f"FAIL  {name}: {str(e).splitlines()[0][:300]}"); print(results[-1], flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Los_Angeles")
    pg = ctx.new_page()
    # A Wednesday at 12:00 PM Pacific, so Ana is on her 8 AM to 2 PM shift.
    pg.clock.set_system_time(datetime.datetime(2026, 10, 21, 12, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=-7))))
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

    def toggle(sw, on):
        # A toast can sit over a switch near the bottom of a phone screen, so a click may land on the toast.
        # Space on the focused switch is what a keyboard user does, and nothing can cover it.
        if sw.is_checked() != on:
            sw.focus()
            sw.press("Space")
        expect(sw).to_be_checked() if on else expect(sw).not_to_be_checked()

    def call_item(org):
        return pg.get_by_role("list", name="Calls").get_by_role("listitem", name=re.compile("^" + re.escape(org) + ","))

    def sarah_logs():
        signin("guardian")
        pg.goto(B + "/app/guardian/calls")
        expect(pg.get_by_role("heading", name="Call log")).to_be_visible()
        expect(call_item("Bayside Health Plan")).to_have_count(2)
        pg.get_by_role("button", name="Log a call").click()
        dlg = pg.get_by_role("dialog", name="Log a call")
        dlg.get_by_label("Organization", exact=True).fill(ORG)
        dlg.get_by_label("Spoke with", exact=True).fill("Dana, scheduling")
        dlg.get_by_label("What they agreed", exact=True).fill(OUTCOME)
        dlg.get_by_label("Reference number", exact=True).fill("GGHC-55102")
        dlg.get_by_label("Next step", exact=True).fill(STEP)
        dlg.get_by_label("Who", exact=True).select_option(label="James")
        dlg.get_by_label("By when", exact=True).fill("2026-10-23")
        dlg.get_by_role("button", name="Save call").click()
        hint = pg.get_by_role("dialog", name="This looks like a health detail")
        if hint.count() > 0:
            hint.get_by_role("button", name="Save anyway").click()
        item = call_item(ORG)
        expect(item).to_contain_text(OUTCOME)
        expect(item).to_contain_text("5102")
        expect(item).not_to_contain_text("GGHC-55102")
        expect(item.get_by_label(f"Next step: {STEP}")).to_contain_text("James")
        item.get_by_role("button", name=f"Show reference for {ORG}").click()
        expect(item).to_contain_text("GGHC-55102")
        pg.screenshot(path=f"{OUT}/s19-calls.png", full_page=True)
    step("CC-226 Sarah logs a call; the reference shows its last 4 until she asks to see it", sarah_logs)

    def filter_calls():
        box = pg.get_by_label("Filter by organization")
        box.fill("Sunset Pharmacy")
        expect(pg.get_by_text("No calls with this organization yet")).to_be_visible()
        box.fill("")
        pg.get_by_role("group", name="Organizations").get_by_role("button", name="Bayside Health Plan").click()
        expect(pg.get_by_role("list", name="Calls").get_by_role("listitem")).to_have_count(2)
        expect(call_item(ORG)).to_have_count(0)
    step("CC-228 Sarah filters the log by organization", filter_calls)

    def james_step():
        signin("family")
        mine = pg.get_by_role("region", name="Your next steps")
        expect(mine).to_contain_text(f"{ORG}: {STEP}")
        mine.get_by_role("link", name="From the call log").first.click()
        pg.wait_for_url("**/app/family/calls", timeout=5000)
        item = call_item(ORG)
        expect(item).to_contain_text("What was said is private to Maggie and Sarah.")
        expect(item).not_to_contain_text("Saturdays starting")
        expect(item).not_to_contain_text("5102")
        expect(pg.get_by_role("button", name="Log a call")).to_have_count(0)
    step("CC-227 James gets the next step as his task and sees only who was called, when, and the step", james_step)

    def ana_off_admin():
        signin("caregiver")
        pg.goto(B + "/app/caregiver/calls")
        item = call_item(ORG)
        expect(item).to_contain_text(STEP)
        expect(item).not_to_contain_text("Dana")
    step("CC-226 Ana on shift sees the call but not what was said", ana_off_admin)

    def maggie_shares_admin():
        signin("elder")
        pg.goto(B + "/app/elder/privacy")
        toggle(pg.get_by_role("switch", name="James sees insurance and admin details"), True)
        expect(pg.get_by_role("switch", name="James sees insurance and admin details")).to_be_checked()
        signin("family")
        pg.goto(B + "/app/family/calls")
        item = call_item(ORG)
        expect(item).to_contain_text(OUTCOME)
        expect(item).to_contain_text("5102")
        expect(item.get_by_role("button", name=f"Show reference for {ORG}")).to_have_count(0)
    step("CC-226 Maggie lets James see insurance and admin details; he still can't see full reference numbers", maggie_shares_admin)

    AVOID = "Please don't rearrange my kitchen."

    def maggie_writes():
        signin("elder")
        pg.goto(B + "/app/elder/about-me")
        expect(pg.get_by_role("heading", name="What matters to me", exact=True)).to_be_visible()
        pg.get_by_role("button", name="Write Things I don't want").click()
        pg.get_by_role("textbox", name="Things I don't want", exact=True).fill(AVOID)
        pg.get_by_role("button", name="Save", exact=True).click()
        sec = pg.get_by_role("region", name="Things I don't want")
        expect(sec).to_contain_text(AVOID)
        expect(sec).to_contain_text("Only Maggie sees this")
        toggle(sec.get_by_role("switch", name="Ana sees Things I don't want"), True)
        expect(sec).to_contain_text("Shared with Ana")
        pg.screenshot(path=f"{OUT}/s19-about-me.png", full_page=True)
    step("CC-219 Maggie writes Things I don't want and shares it with Ana only", maggie_writes)

    def ana_on_shift():
        signin("caregiver")
        box = pg.get_by_role("region", name="What matters to Maggie")
        expect(box).to_contain_text("How to help me")
        expect(box).to_contain_text(AVOID)
        expect(box).not_to_contain_text("Oatmeal")
    step("CC-219 Ana sees the parts shared with her on her shift screen, and not the others", ana_on_shift)

    NEW_DAY = "I wake up around 7:30 now and like my tea first."

    def sarah_edits():
        signin("guardian")
        pg.goto(B + "/app/guardian/about-me")
        expect(pg.get_by_role("heading", name="What matters to Maggie", exact=True)).to_be_visible()
        expect(pg.get_by_role("region", name="Things I don't want")).to_have_count(0)
        pg.get_by_role("button", name="Change My day").click()
        pg.get_by_role("textbox", name="My day", exact=True).fill(NEW_DAY)
        pg.get_by_role("button", name="Save", exact=True).click()
        expect(pg.get_by_role("region", name="My day")).to_contain_text(NEW_DAY)
    step("CC-219 Sarah helps write My day; she can't see a part Maggie didn't share with her", sarah_edits)

    def maggie_sees_change():
        signin("elder")
        pg.goto(B + "/app/elder/about-me")
        ch = pg.get_by_role("region", name="Changes since you last looked")
        expect(ch).to_contain_text("Sarah")
        expect(ch).to_contain_text("My day")
        expect(ch).to_contain_text(NEW_DAY)
        toggle(pg.get_by_role("switch", name="Sarah can help write this"), False)
        signin("guardian")
        pg.goto(B + "/app/guardian/about-me")
        expect(pg.get_by_role("region", name="My day")).to_contain_text(NEW_DAY)
        expect(pg.get_by_role("button", name="Change My day")).to_have_count(0)
    step("CC-219 Maggie sees what Sarah changed and turns off Sarah's editing", maggie_sees_change)

    b.close()

print("\n".join(results))
print("errors:", errs[:10] if errs else "none")
sys.exit(1 if errs or any(r.startswith("FAIL") for r in results) else 0)
