import os
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:4173/#"
AXE = os.path.join(os.path.dirname(__file__), "..", "..", "node_modules", "axe-core", "axe.min.js")
pages = ["/", "/how-it-works", "/features", "/who-its-for", "/privacy", "/pilot", "/app", "/app/elder", "/app/elder/next", "/app/elder/privacy", "/app/elder/settings", "/app/guardian", "/app/guardian/meds", "/app/guardian/approvals", "/app/guardian/privacy", "/app/guardian/notes", "/app/guardian/settings", "/app/guardian/circle", "/app/guardian/digest", "/app/guardian/health", "/app/guardian/calendar", "/app/caregiver", "/app/pilot", "/app/review"]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, timezone_id="America/New_York", bypass_csp=True)
    pg = ctx.new_page()
    pg.goto(B + "/app"); pg.wait_for_timeout(500)
    # sign in all three via UI
    for who in ["guardian", "caregiver"]:
        pg.goto(B + f"/app/sign-in/{who}"); pg.get_by_role("button", name="Continue").click(); pg.get_by_label("6-digit code").fill("482913"); pg.get_by_role("button", name="Sign in").click(); pg.wait_for_timeout(800)
        d = pg.get_by_role("dialog", name="Getting started")
        if d.count(): d.get_by_role("button", name="Skip").click()
    pg.goto(B + "/app/sign-in/elder"); pg.get_by_role("button", name="Sign in with Face ID").click(); pg.wait_for_timeout(1500)
    d = pg.get_by_role("dialog", name="Getting started")
    if d.count(): d.get_by_role("button", name="Skip").click()
    out = []
    pg.close()
    for path in pages:
        pg = ctx.new_page()
        pg.goto(B + path); pg.wait_for_timeout(900)
        try:
            pg.add_script_tag(path=AXE)
        except Exception as e:
            out.append(f"{path}: ERR {str(e)[:80]}"); pg.close(); continue
        r = pg.evaluate("axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}}).then(r => r.violations.map(v => v.impact + ' ' + v.id + ' (' + v.nodes.length + '): ' + v.nodes.map(n => n.target.join(' ') + ' => ' + (n.any[0] && n.any[0].data ? n.any[0].data.fgColor + '/' + n.any[0].data.bgColor + ' ' + n.any[0].data.contrastRatio : '')).join(' | ')))")
        out.append(f"{path}: {'OK' if not r else ''}")
        out += ["   " + x for x in r]
        pg.close()
    print("\n".join(out))
    b.close()
