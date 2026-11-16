import datetime
import os
import sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from totp_helper import Authenticator  # standard library only (CC-200)
B = os.environ.get("E2E_BASE", "http://127.0.0.1:4173") + "/#"
ACCOUNTS = os.environ.get("E2E_BASE") is not None  # account pages need the real server
AXE = os.path.join(os.path.dirname(__file__), "..", "..", "node_modules", "axe-core", "axe.min.js")
pages = ["/", "/how-it-works", "/features", "/who-its-for", "/privacy", "/pilot", "/app", "/app/elder", "/app/elder/next", "/app/elder/privacy", "/app/elder/settings", "/app/guardian", "/app/guardian/meds", "/app/guardian/approvals", "/app/guardian/privacy", "/app/guardian/notes", "/app/guardian/settings", "/app/guardian/circle", "/app/guardian/digest", "/app/guardian/health", "/app/guardian/calendar", "/app/caregiver", "/app/pilot", "/app/review",
         "/app/guardian/chat", "/app/elder/chat",  # CC-194: both chat sizes
         "/app/guardian/help", "/app/caregiver/help", "/app/family", "/app/elder/help",  # CC-209, CC-210: the Help board
         "/app/elder/ask", "/app/guardian/coming-home", "/app/guardian/questions", "/app/family/questions", "/app/elder/questions",  # Sprint 17
         "/app/guardian/calls", "/app/elder/calls", "/app/guardian/about-me", "/app/elder/about-me"]  # Sprint 19
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="America/New_York", bypass_csp=True)
    # CC-194: a Wednesday at 4:30 PM, so the shift and the recap look the same whenever the audit runs.
    T0 = datetime.datetime(2026, 10, 21, 16, 30, tzinfo=datetime.timezone(datetime.timedelta(hours=-4)))
    def new_page():
        q = ctx.new_page(); q.clock.set_system_time(T0); return q
    pg = new_page()
    pg.goto(B + "/app"); pg.wait_for_timeout(500)
    # sign in all three via UI
    for who in ["guardian", "caregiver", "family"]:
        pg.goto(B + f"/app/sign-in/{who}"); pg.get_by_role("button", name="Continue").click(); pg.get_by_label("6-digit code").fill("482913"); pg.get_by_role("button", name="Sign in").click(); pg.wait_for_timeout(800)
        d = pg.get_by_role("dialog", name="Getting started")
        if d.count(): d.get_by_role("button", name="Skip").click()
    pg.goto(B + "/app/sign-in/elder"); pg.get_by_role("button", name="Sign in with Face ID").click(); pg.wait_for_timeout(1500)
    d = pg.get_by_role("dialog", name="Getting started")
    if d.count(): d.get_by_role("button", name="Skip").click()
    out = []
    WCAG = "{runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}}"
    def audit(page, label):
        page.add_script_tag(path=AXE)
        r = page.evaluate(f"axe.run(document, {WCAG}).then(r => r.violations.map(v => v.impact + ' ' + v.id + ' (' + v.nodes.length + '): ' + v.nodes.map(n => n.target.join(' ')).join(' | ')))")
        out.append(f"{label}: {'OK' if not r else ''}")
        out.extend("   " + x for x in r)
    POST = """([url, body]) => fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Requested-With': 'circle-care'}, body: JSON.stringify(body)})
        .then(async r => ({status: r.status, body: await r.json().catch(() => null)}))"""
    extra = 0
    if ACCOUNTS:
        import time
        stamp = int(time.time())
        pages += ["/app/join", "/app/join/guardian", "/app/login", "/app/forgot-password", "/app/reset-password"]
        pg.evaluate(POST, ["/api/auth/signup", {"role": "guardian", "firstName": "Sarah", "lastName": "Lee", "phone": "4155550142", "email": f"a11y.{stamp}@example.com", "password": "blue-heron-sunrise-42", "acceptTerms": True}])
        # CC-200: a guardian sets up an authenticator app before the account page opens.
        setup = pg.evaluate(POST, ["/api/auth/mfa/enrol/start", {}])
        done = pg.evaluate(POST, ["/api/auth/mfa/enrol/confirm", {"code": Authenticator(setup["body"]["secret"]).code()}])
        if done["status"] != 200: out.append(f"/app/account: ERR two-step set-up answered {done['status']}")
        pages += ["/app/account", "/app/two-step"]
        # The set-up screens themselves, with a caregiver who hasn't set it up yet, then the code step at sign-in.
        try:
            c2 = b.new_context(viewport={"width": 390, "height": 844}, bypass_csp=True); q = c2.new_page()
            q.goto(B + "/app/login"); q.wait_for_timeout(300)
            email = f"a11y.cg.{stamp}@example.com"
            q.evaluate(POST, ["/api/auth/signup", {"role": "caregiver", "firstName": "Ana", "lastName": "Reyes", "phone": "4155550190", "email": email, "password": "kettle-and-compass-9", "acceptTerms": True}])
            q.goto(B + "/app/two-step"); q.get_by_role("button", name="Set up two-step sign-in").wait_for(); audit(q, "/app/two-step (start)")
            q.get_by_role("button", name="Set up two-step sign-in").click(); q.locator(".key-groups").wait_for(); audit(q, "/app/two-step (key)")
            app = Authenticator("".join(q.locator(".key-groups span").all_inner_texts()))
            q.get_by_label("6-digit code").fill(app.wrong_code()); q.get_by_role("button", name="Turn on two-step sign-in").click()
            q.locator("#mfa-setup-code-err").wait_for(); audit(q, "/app/two-step (wrong code)")
            q.get_by_label("6-digit code").fill(app.code()); q.get_by_role("button", name="Turn on two-step sign-in").click()
            q.get_by_role("list", name="Recovery codes").wait_for(); audit(q, "/app/two-step (recovery codes)")
            c2.close()
            c3 = b.new_context(viewport={"width": 390, "height": 844}, bypass_csp=True); q = c3.new_page()
            q.goto(B + "/app/login"); q.get_by_label("Email").fill(email); q.get_by_label("Password").fill("kettle-and-compass-9")
            q.get_by_role("button", name="Sign in").click(); q.get_by_label("6-digit code").wait_for(); audit(q, "/app/login (code step)")
            q.get_by_role("button", name="Use a recovery code instead").click(); q.get_by_label("Recovery code").wait_for(); audit(q, "/app/login (recovery code)")
            c3.close()
        except Exception as e:
            out.append(f"two-step screens: ERR {str(e).splitlines()[0][:120]}")
        extra = 6
    pg.close()
    for path in pages:
        pg = new_page()
        pg.goto(B + path); pg.wait_for_timeout(900)
        if path == "/app/account":
            pg.get_by_role("button", name="Add a card").click(); pg.wait_for_timeout(200)
            pg.get_by_role("button", name="Change password").click(); pg.wait_for_timeout(200)  # CC-201
        try:
            pg.add_script_tag(path=AXE)
        except Exception as e:
            out.append(f"{path}: ERR {str(e)[:80]}"); pg.close(); continue
        r = pg.evaluate("axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}}).then(r => r.violations.map(v => v.impact + ' ' + v.id + ' (' + v.nodes.length + '): ' + v.nodes.map(n => n.target.join(' ') + ' => ' + (n.any[0] && n.any[0].data ? n.any[0].data.fgColor + '/' + n.any[0].data.bgColor + ' ' + n.any[0].data.contrastRatio : '')).join(' | ')))")
        out.append(f"{path}: {'OK' if not r else ''}")
        out += ["   " + x for x in r]
        pg.close()
    # CC-194: the evening recap card on Sarah's Home, after the demo's Skip to 7 PM.
    pg = new_page()
    try:
        pg.goto(B + "/app/guardian"); pg.wait_for_timeout(900)
        pg.get_by_role("button", name="Demo mode", exact=False).click()
        pg.get_by_role("button", name="Skip to 7 PM for the evening recap").click()
        pg.goto(B + "/app/guardian"); pg.locator("#recap").wait_for(timeout=5000); pg.wait_for_timeout(600)
        pg.add_script_tag(path=AXE)
        r = pg.evaluate("axe.run('#recap', {runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}}).then(r => r.violations.map(v => v.impact + ' ' + v.id + ' (' + v.nodes.length + '): ' + v.nodes.map(n => n.target.join(' ')).join(' | ')))")
        out.append(f"/app/guardian (evening recap card): {'OK' if not r else ''}")
        out += ["   " + x for x in r]
    except Exception as e:
        out.append(f"/app/guardian (evening recap card): ERR {str(e).splitlines()[0][:120]}")
    pg.close()
    # CC-218: the after-visit notes screen, opened from the newest past visit (its address carries the visit's id).
    pg = new_page()
    try:
        pg.goto(B + "/app/guardian/questions"); pg.wait_for_timeout(900)
        pg.get_by_role("link", name="Notes for", exact=False).first.click(); pg.wait_for_url("**/visit-notes/**", timeout=5000); pg.wait_for_timeout(600)
        pg.add_script_tag(path=AXE)
        r = pg.evaluate("axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}}).then(r => r.violations.map(v => v.impact + ' ' + v.id + ' (' + v.nodes.length + '): ' + v.nodes.map(n => n.target.join(' ')).join(' | ')))")
        out.append(f"/app/guardian/visit-notes (after-visit notes): {'OK' if not r else ''}")
        out += ["   " + x for x in r]
    except Exception as e:
        out.append(f"/app/guardian/visit-notes (after-visit notes): ERR {str(e).splitlines()[0][:120]}")
    pg.close()
    print("\n".join(out))
    b.close()
    bad = [x for x in out if x.startswith("   ") or ": ERR" in x]
    print(f"\n{len(pages) + 2 + extra} screens audited, {len(bad)} problem line(s)")
    sys.exit(1 if bad else 0)
