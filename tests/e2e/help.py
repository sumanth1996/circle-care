"""Sprint 16: browser tests for the Help board (CC-209, CC-210).

Runs against the production build, like e2e.py:
    npm run build && npx vite preview --port 4173 &
    python tests/e2e/help.py

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
        try: pg.screenshot(path=f"{OUT}/help-fail-{len(results)}.png", full_page=True)
        except Exception: pass
        results.append(f"FAIL  {name}: {str(e).splitlines()[0][:300]}"); print(results[-1], flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Los_Angeles")
    pg = ctx.new_page()
    # A Wednesday at 12:00 PM Pacific.
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

    def card(name):
        return pg.get_by_role("article", name=name, exact=True)

    def health_hint():
        signin("guardian")
        pg.goto(B + "/app/guardian/help")
        pg.get_by_role("button", name="New request").click()
        pg.get_by_text("Something else", exact=True).click()
        pg.get_by_label("Note").fill("Pick up her Metformin on the way")
        pg.get_by_role("button", name="Post", exact=True).click()
        expect(pg.get_by_role("dialog", name="This looks like a health detail")).to_be_visible()
        expect(pg.get_by_role("button", name="Post anyway")).to_be_visible()
        pg.get_by_role("button", name="Edit").click()
        pg.get_by_label("Note").fill("Water the plants on the porch")
        pg.keyboard.press("Escape")
        expect(pg.get_by_role("dialog", name="New request")).to_have_count(0)
    step("CC-209 a note that names a medicine gets the health-detail hint before it's posted", health_hint)

    def post():
        signin("guardian")
        pg.goto(B + "/app/guardian/help")
        pg.get_by_role("button", name="New request").click()
        pg.get_by_text("A visit", exact=True).click()
        pg.get_by_label("Note").fill("Stop by for a coffee and a chat.")
        pg.get_by_role("group", name="Who can see it").get_by_role("button", name="Family only").click()
        expect(pg.get_by_text("James will see it, and Maggie.")).to_be_visible()
        pg.get_by_role("button", name="Post", exact=True).click()
        expect(pg.get_by_text("Request posted")).to_be_visible()
        visit = card("Visit")
        expect(visit).to_be_visible()
        expect(visit).to_contain_text("Who can see it: James, and Maggie")
        pg.screenshot(path=f"{OUT}/help-guardian-board.png", full_page=True)
    step("CC-209 Sarah posts a visit for family only and it shows on the board", post)

    def james_claims():
        signin("family")
        expect(pg.get_by_role("heading", name="Help board")).to_be_visible()
        expect(card("Visit")).to_be_visible()
        pg.goto(B + "/app/family/alerts")
        expect(pg.get_by_text("New help request in Circle Care").first).to_be_visible()
        pg.goto(B + "/app/family")
        visit = card("Visit")
        visit.get_by_role("button", name="I'll do it").click()
        expect(pg.get_by_text("You have this. Sarah has been told.")).to_be_visible()
        expect(card("Visit")).to_contain_text("You have this")
        card("Visit").get_by_role("button", name="Mark done").click()
        expect(pg.get_by_text("Marked done. Thank you")).to_be_visible()
        week = pg.get_by_role("region", name="Who helped this week")
        expect(week).to_contain_text("James")
        expect(pg.get_by_text("Nobody is ranked.", exact=False)).to_be_visible()
        pg.screenshot(path=f"{OUT}/help-family-board.png", full_page=True)
    step("CC-210 James gets the alert, takes the visit and marks it done", james_claims)

    def sarah_told():
        signin("guardian")
        pg.goto(B + "/app/guardian/alerts")
        expect(pg.get_by_text(re.compile(r"^James has this: Visit, ")).first).to_be_visible()
        expect(pg.get_by_text(re.compile(r"^James finished: Visit, ")).first).to_be_visible()
    step("CC-210 Sarah is told when James takes it and when it's done", sarah_told)

    def ana_masked():
        signin("caregiver")
        pg.goto(B + "/app/caregiver/help")
        ride = card("Ride to an appointment")
        expect(ride).to_be_visible()
        expect(ride).not_to_contain_text("Cholesterol")
        expect(card("Visit")).to_have_count(0)  # family only
        ride.get_by_role("button", name="I'll do it").click()
        expect(card("Ride to an appointment")).to_contain_text("You have this")
        card("Ride to an appointment").get_by_role("button", name="Can't anymore").click()
        pg.get_by_role("button", name="Yes, open it again").click()
        expect(pg.get_by_text("It's open again")).to_be_visible()
        expect(card("Ride to an appointment").get_by_role("button", name="I'll do it")).to_be_visible()
        pg.screenshot(path=f"{OUT}/help-caregiver-board.png", full_page=True)
    step("CC-209 CC-210 Ana sees the ride as an appointment only, takes it and gives it back", ana_masked)

    b.close()

print("\n".join(results))
print("errors:", errs[:10] if errs else "none")
sys.exit(1 if errs or any(r.startswith("FAIL") for r in results) else 0)
