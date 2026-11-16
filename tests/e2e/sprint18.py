"""Sprint 18: browser tests for after-visit notes and next steps (CC-218).

Runs against the production build, like e2e.py:
    npm run build && npx vite preview --port 4173 &
    python tests/e2e/sprint18.py

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
        try: pg.screenshot(path=f"{OUT}/s18-fail-{len(results)}.png", full_page=True)
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

    def pick_visit(title):
        sel = pg.get_by_label("Visit")
        sel.select_option(sel.locator("option", has_text=title).first.get_attribute("value"))

    notes_url = {}

    def sarah_writes():
        signin("guardian")
        pg.goto(B + "/app/guardian/questions")
        pg.get_by_role("link", name=re.compile(r"^Notes for Blood pressure check")).click()
        pg.wait_for_url("**/visit-notes/**", timeout=5000)
        notes_url["path"] = pg.url.split("#", 1)[1].replace("/app/guardian/", "")
        expect(pg.get_by_role("heading", name="Blood pressure check")).to_be_visible()
        expect(pg.get_by_text("You went with Maggie", exact=False)).to_be_visible()
        pg.get_by_label("Anything else the doctor said").fill("Blood pressure is steady. Come back in three months.")
        pg.get_by_role("button", name="Save notes").click()
        expect(pg.get_by_role("region", name="Visit notes")).to_contain_text("Come back in three months.")
        pg.screenshot(path=f"{OUT}/s18-notes.png", full_page=True)
    step("CC-218 Sarah opens the visit she went to and writes what the doctor said", sarah_writes)

    def next_steps():
        steps = pg.get_by_role("region", name="Next steps", exact=True)
        pg.get_by_label("Next step", exact=True).fill("Book the eye exam")
        pg.get_by_label("Who", exact=True).select_option(label="James")
        pg.get_by_role("button", name="Add step").click()
        expect(pg.get_by_role("list", name="Next steps list")).to_contain_text("Book the eye exam")
        expect(pg.get_by_role("list", name="Next steps list")).to_contain_text("James")
        pg.get_by_label("Next step", exact=True).fill("Ask about the Metformin dose")
        pg.get_by_label("Who", exact=True).select_option(label="You")
        pg.get_by_role("button", name="Add step").click()
        expect(pg.get_by_role("dialog", name="This looks like a health detail")).to_be_visible()
        pg.get_by_role("button", name="Save anyway").click()
        expect(pg.get_by_role("list", name="Next steps list")).to_contain_text("Ask about the Metformin dose")
        expect(steps).to_be_visible()
        pg.goto(B + "/app/guardian")
        expect(pg.get_by_role("region", name="Your next steps")).to_contain_text("Ask about the Metformin dose")
    step("CC-218 Sarah adds next steps; one that names a medicine gets the health-detail hint first", next_steps)

    def james_does_it():
        signin("family")
        mine = pg.get_by_role("region", name="Your next steps")
        item = mine.get_by_role("listitem", name="Book the eye exam")
        expect(item).to_contain_text("Today")
        expect(mine).not_to_contain_text("Metformin")
        item.get_by_role("button", name="Done").click()
        expect(item).to_contain_text("Done")
        item.get_by_role("link", name="From the visit notes").click()
        expect(pg.get_by_role("region", name="Visit notes")).to_contain_text("Come back in three months.")
        expect(pg.get_by_role("button", name="Save notes")).to_have_count(0)
        expect(pg.get_by_role("button", name="Change notes")).to_have_count(0)
        expect(pg.get_by_label("Next step", exact=True)).to_have_count(0)
    step("CC-218 James sees his step, marks it done, and can read but not change the notes", james_does_it)

    def ana_reads():
        signin("caregiver")
        pg.goto(B + "/app/caregiver/" + notes_url["path"])
        expect(pg.get_by_role("region", name="Visit notes")).to_contain_text("Blood pressure is steady.")
        expect(pg.get_by_role("button", name="Change notes")).to_have_count(0)
    step("CC-218 Ana didn't go, so she reads the notes but can't change them", ana_reads)

    def maggie_reads():
        signin("elder")
        pg.goto(B + "/app/elder/" + notes_url["path"])
        expect(pg.get_by_role("region", name="Visit notes")).to_contain_text("Come back in three months.")
        expect(pg.get_by_role("button", name="Change notes")).to_be_visible()
    step("CC-218 Maggie can read and change the notes from her visit", maggie_reads)

    b.close()

print("\n".join(results))
print("errors:", errs[:10] if errs else "none")
sys.exit(1 if errs or any(r.startswith("FAIL") for r in results) else 0)
