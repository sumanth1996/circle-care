"""CC-194: browser tests for the family chat (CC-164, CC-165) and the evening recap (CC-191).

Runs against the production build, like e2e.py:
    npm run build && npx vite preview --port 4173 &
    python tests/e2e/everyday.py

Exits with 1 if any scenario fails or the page throws, so CI can gate on it.
"""
import datetime
import json
import os
import re
import sys

from playwright.sync_api import sync_playwright, expect

OUT = os.path.join(os.path.dirname(__file__), "out"); os.makedirs(OUT, exist_ok=True)
B = os.environ.get("E2E_BASE", "http://127.0.0.1:4173") + "/#"
errs = []
results = []

DINNER = "Dinner at 6 on Sunday?"
HEALTH = "Did Mom take her Lisinopril this morning?"
SPOKEN = "Sounds lovely, see you on Sunday"

# Maggie's microphone, simulated: the page's speech recognition "hears" SPOKEN once and stops.
# Real recognition needs a microphone and a network service, neither of which CI has.
FAKE_SPEECH = """
(() => {
  class FakeRecognition {
    constructor() { this.lang = ""; this.interimResults = false; this.continuous = false; this.onresult = null; this.onerror = null; this.onend = null; }
    start() { setTimeout(() => { this.onresult && this.onresult({ results: [[{ transcript: %s }]] }); this.onend && this.onend(); }, 300); }
    stop() { this.onend && this.onend(); }
    abort() {}
  }
  Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition, configurable: true, writable: true });
  Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeRecognition, configurable: true, writable: true });
})();
""" % json.dumps(SPOKEN)


def step(name, fn):
    try:
        fn(); results.append(f"PASS  {name}"); print(results[-1], flush=True)
    except Exception as e:
        try: pg.screenshot(path=f"{OUT}/everyday-fail-{len(results)}.png", full_page=True)
        except Exception: pass
        results.append(f"FAIL  {name}: {str(e).splitlines()[0][:300]}"); print(results[-1], flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/New_York")
    ctx.add_init_script(FAKE_SPEECH)
    pg = ctx.new_page()
    # A Wednesday at 4:30 PM: before the 6 PM recap card, so "hidden before 6 PM" holds whenever CI runs.
    pg.clock.set_system_time(datetime.datetime(2026, 10, 21, 16, 30, tzinfo=datetime.timezone(datetime.timedelta(hours=-4))))
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

    log = lambda: pg.get_by_role("log", name="Messages")
    recap = lambda: pg.locator("#recap")

    def flip(name, on):
        """Turn a settings switch on or off the way a person would.

        The switch is brought to the middle of the screen first: a forced click lets Playwright scroll it to the
        bottom edge, under the fixed tab bar, and the tap then lands on the tab bar instead (first CI run).
        Without force, Playwright also checks that the switch itself receives the tap.
        """
        sw = pg.get_by_role("switch", name=name)
        sw.evaluate("e => e.scrollIntoView({ block: 'center' })")
        sw.set_checked(on)
        expect(sw).to_be_checked(checked=on)

    # ---------- Family chat ----------
    def sarah_sends():
        signin("guardian")
        pg.goto(B + "/app/guardian/chat")
        expect(pg.get_by_role("heading", name="Family", exact=True)).to_be_visible()
        expect(pg.get_by_text("Only Maggie, Sarah and James can read this", exact=False)).to_be_visible()
        pg.get_by_label("Message", exact=True).fill(DINNER)
        pg.get_by_role("button", name="Send", exact=True).click()
        mine = log().locator(".bubble-row.mine").last
        expect(mine).to_contain_text(DINNER)
        expect(pg.get_by_label("Message", exact=True)).to_have_value("")
        pg.screenshot(path=f"{OUT}/everyday-sarah-chat.png")
    step("CC-164 Sarah sends a message to the Family conversation", sarah_sends)

    def health_hint():
        pg.goto(B + "/app/guardian/chat")
        pg.get_by_label("Message", exact=True).fill(HEALTH)
        pg.get_by_role("button", name="Send", exact=True).click()
        sheet = pg.get_by_role("dialog", name="This looks like a health detail")
        expect(sheet).to_be_visible()
        expect(sheet.locator(".hint-quote")).to_have_text(HEALTH)
        expect(log()).not_to_contain_text("Lisinopril")
        sheet.get_by_role("button", name="Save as a note").click()
        expect(sheet).to_have_count(0)
        expect(pg.get_by_text("Saved to Notes, not the chat")).to_be_visible()
        expect(log()).not_to_contain_text("Lisinopril")
        pg.goto(B + "/app/guardian/notes")
        expect(pg.get_by_text(HEALTH).first).to_be_visible()
    step("CC-164 a medicine name brings up the health-detail sheet; Save as a note keeps it out of the chat", health_hint)

    def maggie_chat():
        signin("elder")
        # Someone else in the chat gets Sarah's message as unread (James has no app view in the demo, so Maggie's tile stands in).
        tile = pg.locator("section.chat-tile")
        expect(tile).to_be_visible()
        expect(tile).to_have_attribute("aria-label", re.compile(r"^Family chat\. \d+ new messages?$"))
        expect(tile).to_contain_text(f"Sarah: {DINNER}")
        tile.get_by_role("link", name="Open chat").click()
        expect(pg).to_have_url(B + "/app/elder/chat")
        expect(pg.locator(".page.chat.chat-large")).to_be_visible()
        size = float(log().locator(".bubble").first.evaluate("e => parseFloat(getComputedStyle(e).fontSize)"))
        assert size >= 22, f"chat bubbles are {size}px, expected at least 22px"
        # Voice reply: the words show in a You said card, and nothing is sent until Maggie taps Send.
        pg.locator(".elder-compose").get_by_role("button", name="Tap to talk").click()
        sheet = pg.get_by_role("dialog", name="Talk to your family")
        expect(sheet.get_by_text("You said")).to_be_visible()
        expect(sheet.locator(".you-said p")).to_have_text(SPOKEN)
        pg.wait_for_timeout(500)
        expect(log()).not_to_contain_text(SPOKEN)
        sheet.get_by_role("button", name="Send", exact=True).click()
        expect(sheet).to_have_count(0)
        mine = log().locator(".bubble-row.mine").last
        expect(mine).to_contain_text(SPOKEN)
        expect(mine).to_contain_text("By voice")
        pg.screenshot(path=f"{OUT}/everyday-maggie-chat.png")
        # Show chat on my home hides and shows the tile; the chat stays under Family.
        pg.goto(B + "/app/elder/settings")
        flip("Show chat on my home", False)
        pg.goto(B + "/app/elder")
        expect(pg.locator("section.chat-tile")).to_have_count(0)
        expect(pg.get_by_role("link", name="Family", exact=True)).to_be_visible()
        pg.goto(B + "/app/elder/settings")
        flip("Show chat on my home", True)
        pg.goto(B + "/app/elder")
        expect(pg.locator("section.chat-tile")).to_be_visible()
    step("CC-165 Maggie's large-text chat: unread tile, voice reply read back before sending, home tile switch", maggie_chat)

    def ana_not_added():
        signin("caregiver")
        expect(pg.locator("nav").get_by_role("link", name="Chat")).to_have_count(0)
        pg.goto(B + "/app/caregiver/chat")
        expect(pg.get_by_role("heading", name="The family chat is for Maggie's family")).to_be_visible()
        expect(pg.get_by_role("log", name="Messages")).to_have_count(0)
        expect(pg.get_by_text(DINNER)).to_have_count(0)
        expect(pg.get_by_text(SPOKEN)).to_have_count(0)
    step("CC-164 a caregiver who wasn't added sees no chat messages", ana_not_added)

    # ---------- Evening recap ----------
    def recap_after_six():
        signin("guardian")
        expect(pg.get_by_text("Good afternoon, Sarah")).to_be_visible()
        expect(recap()).to_have_count(0)
        pg.get_by_role("button", name="Demo mode", exact=False).click()
        pg.get_by_role("button", name="Skip to 7 PM for the evening recap").click()
        pg.goto(B + "/app/guardian")
        r = recap()
        expect(r).to_be_visible()
        expect(r.get_by_text("Evening recap")).to_be_visible()
        headline = r.locator("#recap-h").inner_text().strip()
        assert headline, "recap has no headline"
        for k in ["Medicines", "Check-in", "Visits", "Her day", "Tomorrow"]:
            expect(r.locator(".recap-cell .k", has_text=k)).to_have_count(1)
        expect(r.get_by_role("link", name="See the week")).to_be_visible()
        pg.screenshot(path=f"{OUT}/everyday-recap.png", full_page=True)
    step("CC-191 no recap card before 6 PM; after Skip to 7 PM it shows a headline and all five lines", recap_after_six)

    def recap_private():
        # While Maggie shares, Her day shows her counts, so "Private" below can only come from turning sharing off.
        signin("guardian")
        cell = recap().locator(".recap-cell", has_text="Her day")
        expect(cell.locator(".v")).not_to_have_text("Private")
        expect(cell).to_contain_text("of 3 meals")
        signin("elder")
        pg.goto(B + "/app/elder/privacy")
        flip("Share daily check-ins with Sarah", False)
        signin("guardian")
        expect(cell.locator(".v")).to_have_text("Private")
        expect(cell).to_contain_text("Maggie isn't sharing today")
        expect(cell).not_to_contain_text("glass")
        expect(cell).not_to_contain_text("meals")
        signin("elder")
        pg.goto(B + "/app/elder/privacy")
        flip("Share daily check-ins with Sarah", True)
        signin("guardian")
        expect(cell).to_contain_text("of 3 meals")
    step("CC-191 Her day shows as private, with no counts, while Maggie isn't sharing", recap_private)

    def recap_switch():
        signin("guardian")
        pg.goto(B + "/app/guardian/settings")
        expect(pg.get_by_role("switch", name="Evening recap update")).to_be_checked()
        flip("Evening recap update", False)
        # CC-195: the change is saved as soon as it's made, so reloading straight away keeps it.
        pg.reload()
        expect(pg.get_by_role("switch", name="Evening recap update")).not_to_be_checked()
        pg.goto(B + "/app/guardian")
        expect(recap()).to_contain_text("The 7 PM update is off")
        pg.goto(B + "/app/guardian/settings")
        flip("Evening recap update", True)
        # CC-195: nothing is lost when the page is hidden (switching apps on a phone) and then reloaded. The change save
        # has usually already started, so this checks that the hide handler does no harm, not that it alone saves.
        pg.evaluate("() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }")
        pg.reload()
        expect(pg.get_by_role("switch", name="Evening recap update")).to_be_checked()
    step("CC-191 and CC-195 Update at 7 PM keeps its setting when the page reloads straight away, and nothing is lost when it is hidden first", recap_switch)

    b.close()

print("\n".join(results))
print("errors:", errs[:10] if errs else "none")
sys.exit(1 if errs or any(r.startswith("FAIL") for r in results) else 0)
