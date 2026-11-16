"""Sprint 17: browser tests for asking for a hand, who did what, Coming Home and visit questions
(CC-211, CC-212, CC-213, CC-214, CC-217).

Runs against the production build, like e2e.py:
    npm run build && npx vite preview --port 4173 &
    python tests/e2e/sprint17.py

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
        try: pg.screenshot(path=f"{OUT}/s17-fail-{len(results)}.png", full_page=True)
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

    def maggie_asks():
        signin("elder")
        pg.get_by_role("link", name=re.compile("I could use a hand")).click()
        # The radios are drawn as big tiles; a tap lands on the tile, which is the radio's label.
        pg.locator(".ask-kinds label", has_text="Groceries").click()
        pg.locator(".ask-days label", has_text="Tomorrow").click()
        expect(pg.get_by_role("radio", name="Groceries")).to_be_checked()
        expect(pg.get_by_role("radio", name="Tomorrow")).to_be_checked()
        pg.screenshot(path=f"{OUT}/s17-elder-ask.png", full_page=True)
        pg.get_by_role("button", name="Send").click()
        pg.wait_for_url("**/app/elder", timeout=5000)
        expect(pg.get_by_role("region", name="Help you asked for")).to_contain_text("You asked for groceries Thu. No one has it yet.")
    step("CC-211 Maggie asks for groceries tomorrow from her home screen", maggie_asks)

    def james_takes_it():
        signin("family")
        groceries = card("Groceries").filter(has_text="asked by Maggie")
        expect(groceries).to_be_visible()
        expect(groceries).to_contain_text("Thu, Oct 22")
        groceries.get_by_role("button", name="I'll do it").click()
        expect(pg.get_by_text("You have this. Sarah has been told.")).to_be_visible()
        signin("elder")
        expect(pg.get_by_role("region", name="Help you asked for")).to_contain_text("James is bringing groceries Thu")
        pg.screenshot(path=f"{OUT}/s17-elder-home.png", full_page=True)
    step("CC-211 James takes it and Maggie's home says James is bringing groceries", james_takes_it)

    def maggie_thanks():
        signin("family")
        pg.goto(B + "/app/family")
        card("Groceries").filter(has_text="asked by Maggie").get_by_role("button", name="Mark done").click()
        signin("elder")
        pg.goto(B + "/app/elder/help")
        who = pg.get_by_role("region", name="Who helped you this week")
        expect(who).to_contain_text("James")
        expect(who).to_contain_text("help request")
        expect(who).to_contain_text("Nobody is ranked.")
        who.get_by_role("button", name="Thank James").click()
        expect(pg.get_by_text("Your thank-you is in the family chat")).to_be_visible()
        pg.goto(B + "/app/elder/chat")
        expect(pg.get_by_text("Thank you, James, for all your help this week.").first).to_be_visible()
    step("CC-212 Maggie sees who helped this week and thanks James in the family chat", maggie_thanks)

    def coming_home():
        signin("guardian")
        pg.goto(B + "/app/guardian/coming-home")
        pg.get_by_role("button", name="Maggie's coming home").click()
        pg.get_by_role("button", name="Save").click()
        expect(pg.get_by_text("Plan started")).to_be_visible()
        items = pg.get_by_role("list", name="Plan")
        for t in ["Pick up medicines", "Book a follow-up visit", "Get the home ready", "Stay the first night"]:
            expect(items.get_by_role("listitem", name=t)).to_be_visible()
        expect(pg.get_by_text("There's no place here for why Maggie was in hospital.", exact=False)).to_be_visible()
        meds = items.get_by_role("listitem", name="Pick up medicines")
        meds.get_by_label("Who has it").select_option(label="James")
        expect(meds).to_contain_text("Given to James, waiting for a yes")
        # CC-214: the Diabetes follow-up two days after counts as the first follow-up visit.
        expect(pg.get_by_role("region", name="First follow-up visit")).to_contain_text("Booked: Diabetes follow-up")
        pg.screenshot(path=f"{OUT}/s17-coming-home.png", full_page=True)
        signin("family")
        expect(card("Pick up medicines")).to_be_visible()
        expect(card("Get the home ready")).to_have_count(0)
    step("CC-213 CC-214 Sarah starts a Coming Home plan, gives an item to James and he sees only that", coming_home)

    def questions():
        signin("guardian")
        pg.goto(B + "/app/guardian/questions")
        pick_visit("Diabetes follow-up")
        ql = pg.get_by_role("list", name="Questions")
        expect(ql).to_contain_text("Bring the glucose log.")
        pg.get_by_label("Add a question or something you noticed").fill("Is the Metformin dose still right?")
        pg.get_by_role("button", name="Add", exact=True).click()
        expect(pg.get_by_role("dialog", name="This looks like a health detail")).to_be_visible()
        pg.get_by_role("button", name="Add anyway").click()
        expect(ql).to_contain_text("Is the Metformin dose still right?")
        signin("family")
        pg.goto(B + "/app/family/questions")
        pick_visit("Diabetes follow-up")
        pg.get_by_label("Add a question or something you noticed").fill("She mentioned feeling tired after lunch")
        pg.get_by_role("button", name="Add", exact=True).click()
        expect(pg.get_by_role("list", name="Questions")).to_contain_text("Added by you")
        signin("elder")
        pg.goto(B + "/app/elder/questions")
        pick_visit("Diabetes follow-up")
        item = pg.get_by_role("listitem", name="She mentioned feeling tired after lunch")
        expect(item).to_contain_text("Added by James")
        item.get_by_role("button", name="Hide").click()
        expect(item).to_contain_text("Only Maggie and Sarah see this")
        signin("family")
        pg.goto(B + "/app/family/questions")
        pick_visit("Diabetes follow-up")
        expect(pg.get_by_role("list", name="Questions")).to_contain_text("Bring the glucose log.")
        expect(pg.get_by_role("listitem", name="She mentioned feeling tired after lunch")).to_have_count(0)
        signin("guardian")
        pg.goto(B + "/app/guardian/questions")
        pick_visit("Diabetes follow-up")
        pg.get_by_role("button", name="Print").click()
        sheet = pg.get_by_role("article", name="Printable question list")
        expect(sheet).to_contain_text("Is the Metformin dose still right?")
        expect(sheet).not_to_contain_text("feeling tired")
        pg.get_by_role("switch", name="Include items Maggie hid").check()
        expect(sheet).to_contain_text("feeling tired")
        pg.screenshot(path=f"{OUT}/s17-print.png", full_page=True)
    step("CC-217 the circle adds questions, Maggie hides one, and Sarah prints the list", questions)

    def ana_page():
        signin("caregiver")
        pg.goto(B + "/app/caregiver/questions")
        expect(pg.get_by_role("heading", name="Questions for the doctor")).to_be_visible()
    step("CC-217 Ana's question page loads", ana_page)

    b.close()

print("\n".join(results))
print("errors:", errs[:10] if errs else "none")
sys.exit(1 if errs or any(r.startswith("FAIL") for r in results) else 0)
