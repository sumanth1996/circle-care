"""Sprint 20: browser tests for away mode (CC-229 to CC-231).

Runs against the production build, like e2e.py:
    npm run build && npx vite preview --port 4173 &
    python tests/e2e/sprint20.py

Exits with 1 if any scenario fails or the page throws, so CI can gate on it.
"""
import datetime
import os
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
        try: pg.screenshot(path=f"{OUT}/s20-fail-{len(results)}.png", full_page=True)
        except Exception: pass
        results.append(f"FAIL  {name}: {str(e).splitlines()[0][:300]}"); print(results[-1], flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Los_Angeles")
    pg = ctx.new_page()
    # A Wednesday at 12:00 PM Pacific. Sarah is away from today until Friday.
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

    def sarah_sets_dates():
        signin("guardian")
        pg.goto(B + "/app/guardian/away")
        expect(pg.get_by_role("heading", name="When you're away")).to_be_visible()
        pg.get_by_label("First day away", exact=True).fill("2026-10-21")
        pg.get_by_label("Last day away", exact=True).fill("2026-10-23")
        # Only family can cover: James is offered, Ana is not.
        expect(pg.get_by_role("radio", name="James")).to_be_checked()
        expect(pg.get_by_role("radio", name="Ana")).to_have_count(0)
        pg.get_by_role("button", name="Ask James to cover").click()
        expect(pg.get_by_role("region", name="Your away dates")).to_contain_text("Waiting for James to answer")

    step("CC-229 Sarah sets her away dates and asks James to cover; only family is offered", sarah_sets_dates)

    def james_accepts():
        signin("family")
        card = pg.get_by_role("link", name="Sarah asked you to cover")
        expect(card).to_be_visible()
        card.click()
        pg.wait_for_url("**/app/family/away")
        pg.get_by_role("button", name="I'll cover").click()
        expect(pg.get_by_text("You're covering until Friday.")).to_be_visible()
        pg.goto(B + "/app/family")
        expect(pg.locator("a.away-banner")).to_contain_text("Covering for Sarah until Friday")

    step("CC-229 James accepts and his home shows he's covering until Friday", james_accepts)

    def maggie_sees_cover():
        signin("elder")
        region = pg.get_by_role("region", name="Who is covering")
        expect(region).to_contain_text("James is covering for Sarah until Friday.")
        pg.goto(B + "/app/elder/call")
        first = pg.locator(".call-card").first
        expect(first).to_have_attribute("aria-label", "Call James")
        expect(first).to_contain_text("Covering for Sarah")
        pg.goto(B + "/app/elder")
        region = pg.get_by_role("region", name="Who is covering")
        region.get_by_role("button", name="Change").click()
        expect(region.get_by_role("status")).to_have_text("Sarah has been asked to pick someone else.")

    step("CC-231 Maggie sees who covers and until when, calls James first, and asks for someone else", maggie_sees_cover)

    def sarah_back():
        signin("guardian")
        expect(pg.get_by_role("region", name="Away mode")).to_contain_text("James is covering until Friday")
        pg.goto(B + "/app/guardian/away")
        expect(pg.get_by_role("region", name="Your away dates").get_by_role("status")).to_contain_text("Maggie would like someone other than James to cover")
        pg.get_by_role("button", name="I'm back").click()
        pg.goto(B + "/app/guardian")
        summary = pg.get_by_role("region", name="While you were away")
        expect(summary).to_contain_text("James covered from")
        expect(summary).to_contain_text("until you came back early")
        summary.get_by_role("button", name="Got it").click()
        expect(pg.get_by_role("region", name="While you were away")).to_have_count(0)

    step("CC-230 Sarah taps I'm back, sees one summary of the time away, and clears it", sarah_back)

    def james_thanked():
        signin("family")
        pg.goto(B + "/app/family/away")
        expect(pg.get_by_text("Thank you for covering. Sarah is back.")).to_be_visible()
        pg.goto(B + "/app/family")
        expect(pg.locator("a.away-banner")).to_have_count(0)

    step("CC-230 James is thanked with a short summary once Sarah is back", james_thanked)

    def maggie_after():
        signin("elder")
        expect(pg.get_by_role("region", name="Who is covering")).to_have_count(0)
        pg.goto(B + "/app/elder/call")
        expect(pg.locator(".call-card").first).to_have_attribute("aria-label", "Call Sarah")

    step("CC-231 After Sarah is back, Maggie's call shows Sarah first again", maggie_after)

    b.close()

print("\n".join(results))
print("errors:", errs[:10] if errs else "none")
sys.exit(1 if errs or any(r.startswith("FAIL") for r in results) else 0)
