"""Sprint 27 "Circle Messages": browser tests for CC-249 to CC-256.

Runs against the production build, like e2e.py:
    npm run build && npx vite preview --port 4173 &
    python tests/e2e/sprint27.py

Everyone here is a fictional demo profile. Sarah edits a message and takes another back within 5 minutes; after
5 minutes Edit and Take back are gone. Sarah pins a note: it shows at the top with "Seen by", which fills in as
James and Maggie open the chat, and shows "Maggie: not shared" once Maggie turns that off in her Privacy Center.
Sarah mutes the chat until tomorrow morning and unmutes it. Maggie hears what's new read aloud with big Read and
Next buttons, and can choose "Names only". Sarah searches the chat and jumps to a result. Sarah schedules a
message for tomorrow at 8 AM: only she sees it, and it reaches James in the morning. The Circle Messages demo
scenario labels its week of chat "Dummy profile (demo)". Each screen gets an axe pass.

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
        try: pg.screenshot(path=f"{OUT}/s27-fail-{len(results)}.png", full_page=True)
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

    def chat(persona):
        go(f"/app/{persona}/chat")
        expect(pg.get_by_role("heading", name="Family", exact=True)).to_be_visible()

    def log():
        return pg.get_by_role("log", name="Messages")

    def send(text):
        pg.get_by_label("Message", exact=True).fill(text)
        pg.get_by_role("button", name="Send", exact=True).click()
        expect(log().locator(".bubble-row.mine").last).to_contain_text(text)

    def options_for_last_mine():
        log().locator(".bubble-row.mine").last.get_by_role("button", name=re.compile(r"^Options for your message")).click()
        return pg.get_by_role("dialog", name="Message")

    def shift(minutes):
        now = pg.evaluate("Date.now()")
        pg.clock.set_system_time(datetime.datetime.fromtimestamp(now / 1000 + minutes * 60, tz=PT))

    # ---------------- CC-251 ----------------

    def edit_and_take_back():
        signin("guardian")
        chat("guardian")
        send("Family dinner is Sunday at 5 PM")
        dlg = options_for_last_mine()
        expect(dlg).to_contain_text(re.compile(r"You can edit or take it back for [45] more minutes"))
        axe("The message options sheet")
        dlg.get_by_role("button", name="Edit").click()
        edit = pg.get_by_role("dialog", name="Edit message")
        edit.get_by_label("Message").fill("Family dinner is Sunday at 6 PM")
        edit.get_by_role("button", name="Save").click()
        mine = log().locator(".bubble-row.mine").last
        expect(mine).to_contain_text("Family dinner is Sunday at 6 PM")
        expect(mine).to_contain_text("edited")
        expect(log()).not_to_contain_text("Sunday at 5 PM")
        send("Oops, wrong chat")
        dlg = options_for_last_mine()
        dlg.get_by_role("button", name="Take back").click()
        sure = pg.get_by_role("dialog", name="Take back this message?")
        expect(sure).to_contain_text("The words aren't kept anywhere")
        sure.get_by_role("button", name="Take back").click()
        expect(log()).to_contain_text("Message removed by Sarah")
        expect(log()).not_to_contain_text("Oops, wrong chat")
        pg.screenshot(path=f"{OUT}/s27-edit-take-back.png", full_page=True)

    step("CC-251 Sarah edits one message and takes another back; the old words are gone", edit_and_take_back)

    def five_minutes():
        shift(6)
        chat("guardian")
        row = log().locator(".bubble-row.mine").filter(has_text="Sunday at 6 PM")
        row.get_by_role("button", name=re.compile(r"^Options for your message")).click()
        dlg = pg.get_by_role("dialog", name="Message")
        expect(dlg.get_by_role("button", name="Pin for everyone")).to_be_visible()  # Sarah can still pin it
        expect(dlg.get_by_role("button", name="Edit")).to_have_count(0)
        expect(dlg.get_by_role("button", name="Take back")).to_have_count(0)
        pg.keyboard.press("Escape")

    step("CC-251 after 5 minutes Edit and Take back are gone", five_minutes)

    # ---------------- CC-249, CC-250 ----------------

    def pin_and_seen():
        chat("guardian")
        row = log().locator(".bubble-row.mine").filter(has_text="Sunday at 6 PM")
        row.get_by_role("button", name=re.compile(r"^Options for your message")).click()
        pg.get_by_role("dialog", name="Message").get_by_role("button", name="Pin for everyone").click()
        pinned = pg.get_by_role("region", name="Pinned notes")
        expect(pinned).to_contain_text("Family dinner is Sunday at 6 PM")
        expect(pinned).to_contain_text("pinned by you")
        expect(pinned).to_contain_text("Not seen yet")
        axe("The chat with a pinned note")
        # James opens the chat; he can't pin.
        signin("family")
        chat("family")
        expect(pg.get_by_role("region", name="Pinned notes")).to_contain_text("Family dinner is Sunday at 6 PM")
        expect(pg.get_by_role("region", name="Pinned notes").get_by_role("button", name="Unpin")).to_have_count(0)
        signin("guardian")
        chat("guardian")
        expect(pg.get_by_role("region", name="Pinned notes")).to_contain_text("Seen by James. Not yet: Maggie")
        pg.screenshot(path=f"{OUT}/s27-pinned-seen.png", full_page=True)

    step("CC-249 CC-250 Sarah pins a note; 'Seen by' fills in as James opens the chat", pin_and_seen)

    def not_shared():
        signin("elder")
        go("/app/elder/privacy")
        sw = pg.get_by_role("switch", name="Show when I've read")
        expect(sw).to_be_checked()
        sw.click()
        expect(sw).not_to_be_checked()
        axe("Maggie's Privacy Center")
        chat("elder")
        expect(pg.get_by_role("region", name="Pinned notes")).to_contain_text("Family dinner is Sunday at 6 PM")
        signin("guardian")
        go("/app/guardian/privacy")
        expect(pg.get_by_text("Not shared", exact=True).first).to_be_visible()
        chat("guardian")
        expect(pg.get_by_role("region", name="Pinned notes")).to_contain_text("Seen by James. Maggie: not shared")

    step("CC-250 Maggie turns off 'Show when I've read' and shows as 'not shared'", not_shared)

    # ---------------- CC-254 ----------------

    def read_aloud():
        signin("guardian")
        chat("guardian")
        send("Tea at my place on Friday")
        signin("elder")
        chat("elder")
        panel = pg.get_by_role("region", name="Read messages aloud")
        expect(panel).to_contain_text(re.compile(r"\d+ new messages?"))
        expect(panel.get_by_role("button", name="Read to me")).to_be_visible()
        expect(panel.get_by_role("button", name="Next")).to_be_visible()
        targets(panel, "The read-aloud panel")
        targets(pg.get_by_role("region", name="Pinned notes"), "Maggie's pinned notes")
        axe("Maggie's chat with the read-aloud panel")
        pg.screenshot(path=f"{OUT}/s27-elder-read-aloud.png", full_page=True)
        go("/app/elder/settings")
        group = pg.get_by_role("radiogroup", name="Reading the family chat aloud")
        group.get_by_role("radio", name=re.compile("^Names only")).click()
        expect(group.get_by_role("radio", name=re.compile("^Names only"))).to_have_attribute("aria-checked", "true")
        axe("Maggie's settings")

    step("CC-254 Maggie gets what's new read aloud with big buttons, and can choose 'Names only'", read_aloud)

    # ---------------- CC-253 ----------------

    def mute():
        signin("guardian")
        chat("guardian")
        pg.get_by_role("button", name="Mute", exact=True).click()
        dlg = pg.get_by_role("dialog", name="Mute the family chat")
        expect(dlg).to_contain_text("Safety alerts, like a missed check-in or an SOS, always reach you.")
        dlg.get_by_role("button", name="Until tomorrow morning").click()
        banner = pg.get_by_role("status").filter(has_text="Chat muted until")
        expect(banner).to_contain_text("Chat muted until tomorrow at 8:00 AM")
        axe("The chat while muted")
        banner.get_by_role("button", name="Unmute").click()
        expect(pg.get_by_text("Chat muted until")).to_have_count(0)
        expect(pg.get_by_role("button", name="Mute", exact=True)).to_be_visible()

    step("CC-253 Sarah mutes the chat until tomorrow morning, then unmutes it", mute)

    # ---------------- CC-255 ----------------

    def search():
        chat("guardian")
        pg.get_by_role("button", name="Search", exact=True).click()
        pg.get_by_label("Search messages").fill("tea")
        hit = pg.get_by_role("button", name=re.compile(r"Tea at my place on Friday"))
        expect(hit).to_be_visible()
        axe("Chat search results")
        hit.click()
        expect(pg.locator(".msg-flash")).to_contain_text("Tea at my place on Friday")
        pg.get_by_role("button", name="Search", exact=True).click()
        pg.get_by_label("Search messages").fill("wrong chat")
        expect(pg.get_by_text('No messages with "wrong chat".')).to_be_visible()  # taken back, so never found

    step("CC-255 Sarah searches the chat and jumps to the message; taken-back words aren't found", search)

    # ---------------- CC-252 ----------------

    def send_later():
        chat("guardian")
        pg.get_by_label("Message", exact=True).fill("Good morning, the plan for today is pinned")
        pg.get_by_role("button", name="Send later").click()
        dlg = pg.get_by_role("dialog", name="Send later")
        expect(dlg.get_by_label("Message to send later")).to_have_value("Good morning, the plan for today is pinned")
        axe("The Send later sheet")
        dlg.get_by_role("button", name="Schedule").click()
        sched = pg.get_by_role("region", name="Your scheduled messages")
        expect(sched).to_contain_text("Scheduled for tomorrow at 8:00 AM")
        expect(log()).not_to_contain_text("the plan for today is pinned")
        signin("family")
        chat("family")
        expect(pg.get_by_text("the plan for today is pinned")).to_have_count(0)
        expect(pg.get_by_role("region", name="Your scheduled messages")).to_have_count(0)
        # Tomorrow at 8:05 AM it's in the chat, sent by Sarah.
        pg.clock.set_system_time(TUESDAY + datetime.timedelta(hours=21, minutes=5))
        chat("family")
        expect(log().locator(".bubble-row").filter(has_text="Good morning, the plan for today is pinned")).to_contain_text("Sarah")

    step("CC-252 Sarah schedules a message for 8 AM; only she sees it until it reaches James", send_later)

    # ---------------- CC-256 ----------------

    def scenario():
        signin("guardian")
        demo("Load the Circle Messages scenario")
        expect(pg.get_by_role("note").filter(has_text="Circle Messages scenario").first).to_be_visible()
        chat("guardian")
        expect(pg.get_by_role("region", name="Pinned notes")).to_contain_text("Family dinner moved to Sunday at 5 PM")
        expect(log()).to_contain_text("Message removed by James")
        expect(log()).to_contain_text("Dummy profile (demo)")
        expect(pg.get_by_role("region", name="Your scheduled messages")).to_contain_text("Good morning, everyone.")
        axe("The chat with the Circle Messages scenario")
        pg.screenshot(path=f"{OUT}/s27-scenario.png", full_page=True)

    step("CC-256 the Circle Messages scenario labels its chat 'Dummy profile (demo)'", scenario)

    b.close()

print()
for r in results: print(r)
if errs:
    print("\nPage errors:"); [print("  " + e) for e in errs[:10]]
sys.exit(1 if errs or any(r.startswith("FAIL") for r in results) else 0)
