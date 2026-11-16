"""Sprint 21: browser tests for resetting two-step sign-in after a lost phone (CC-235).

Runs against the production build, like e2e.py:
    npm run build && npx vite preview --port 4173 &
    python tests/e2e/sprint21.py

The preview server has no API, so this file answers /api with a small stand-in
that follows the real server's replies (server/mfaRecovery.ts, whose behaviour
is covered in server/__tests__/mfa-recovery.test.ts). It checks the screens:
the lost-phone panel at the code step, the two emailed links, the waiting and
ready states, the warning on a signed-in device, and an axe pass on each.

Exits with 1 if any scenario fails or the page throws, so CI can gate on it.
"""
import datetime
import json
import os
import sys

from playwright.sync_api import sync_playwright, expect

OUT = os.path.join(os.path.dirname(__file__), "out"); os.makedirs(OUT, exist_ok=True)
B = os.environ.get("E2E_BASE", "http://127.0.0.1:4173") + "/#"
AXE = os.path.join(os.path.dirname(__file__), "..", "..", "node_modules", "axe-core", "axe.min.js")
WCAG = "{runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']}}"
errs = []
results = []

# Monday Nov 16 2026, 9:00 AM Pacific. The wait ends 72 hours later: Thursday Nov 19, 9:00 AM.
NOW = datetime.datetime(2026, 11, 16, 17, 0, tzinfo=datetime.timezone.utc)
READY = (NOW + datetime.timedelta(hours=72)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
REPLY = "If two-step sign-in can be reset for this account, we've emailed it a link. Open it within 30 minutes to start the wait."

SARAH = {"id": "u-sarah", "role": "guardian", "loginEmail": "sarah@example.com", "firstName": "Sarah", "lastName": "Example",
         "phone": "", "email": "sarah@example.com", "ssnLast4": None, "hasPhoto": False, "profileStatus": "complete",
         "missing": [], "createdAt": "2026-11-01T00:00:00.000Z", "mfaEnrolled": True}

# What the stand-in server knows. "signed_in" is the device's session cookie, "fresh" is the re-enrol-only session.
S = {"signed_in": False, "fresh": False, "wait": None, "requested": 0, "cancelled_by": None, "completed": False}


def reset_state(**kw):
    S.update({"signed_in": False, "fresh": False, "wait": None, "requested": 0, "cancelled_by": None, "completed": False}); S.update(kw)


def answer(route):
    req = route.request
    path = req.url.split("/api", 1)[1].split("?")[0]
    body = json.loads(req.post_data or "{}") if req.method != "GET" else {}
    ok = lambda data: route.fulfill(status=200, content_type="application/json", body=json.dumps(data))
    err = lambda status, msg, code: route.fulfill(status=status, content_type="application/json", body=json.dumps({"error": msg, "code": code}))

    if path == "/config":
        return ok({"env": "test", "testData": True, "paymentProvider": "test", "achFeeCents": 0})
    if path == "/me" and req.method == "GET":
        if S["fresh"]:
            return err(403, "Set up two-step sign-in to continue.", "mfa_enrolment_required")
        return ok({"me": SARAH}) if S["signed_in"] else err(401, "Please sign in.", "signed_out")
    if path == "/auth/me":
        if S["fresh"]:
            return ok({"user": {"id": "u-sarah", "role": "guardian", "email": "sarah@example.com", "mfaEnrolled": False, "mfaRequired": True}})
        return err(401, "Please sign in.", "signed_out")
    if path == "/me/payment-methods":
        return ok({"bankAccount": None, "cards": [], "fees": {"achCents": 0, "note": ""}, "maxCards": 3})
    if path == "/me/activity":
        return ok({"events": []})
    if path == "/auth/signin":
        out = {"mfaRequired": True, "challenge": "ch-1", "expiresInSeconds": 300}
        if S["wait"]:
            out["recovery"] = S["wait"]
        return ok(out)
    if path == "/auth/mfa/recovery/request":
        if S["wait"]:
            return ok({"ok": True, "waiting": S["wait"]})
        S["requested"] += 1
        return ok({"ok": True, "message": REPLY})
    if path == "/auth/mfa/recovery/confirm":
        if body.get("token") != "confirm-token" or S["wait"]:
            return err(400, "This link has expired or was already used.", "recovery_link_invalid")
        S["wait"] = {"readyAt": READY, "ready": False}
        return ok({"ok": True, "readyAt": READY, "waitHours": 72})
    if path == "/auth/mfa/recovery/cancel":
        if body.get("token"):
            if body["token"] != "cancel-token" or not S["wait"]:
                return err(400, "This link has expired or was already used.", "recovery_link_invalid")
            S["wait"] = None; S["cancelled_by"] = "email_link"
            return ok({"ok": True, "cancelled": True})
        if not S["signed_in"]:
            return err(401, "Please sign in.", "signed_out")
        was = S["wait"] is not None
        S["wait"] = None; S["cancelled_by"] = "signed_in" if was else S["cancelled_by"]
        return ok({"ok": True, "cancelled": was})
    if path == "/auth/mfa/recovery" and req.method == "GET":
        return ok({"waiting": S["wait"]}) if S["signed_in"] else err(401, "Please sign in.", "signed_out")
    if path == "/auth/mfa/recovery/complete":
        if not S["wait"]:
            return err(409, "There's no confirmed reset for this account.", "recovery_not_started")
        if not S["wait"]["ready"]:
            return err(409, "The reset can be finished later.", "recovery_waiting")
        S["wait"] = None; S["completed"] = True; S["fresh"] = True; S["signed_in"] = False
        return ok({"user": {"id": "u-sarah", "role": "guardian"}, "mustSetUp": True, "sessionsEnded": 2})
    if path == "/auth/signout":
        S["signed_in"] = False; S["fresh"] = False
        return ok({"ok": True})
    return err(404, "Not here", "not_found")


def step(name, fn):
    try:
        fn(); results.append(f"PASS  {name}"); print(results[-1], flush=True)
    except Exception as e:
        try: pg.screenshot(path=f"{OUT}/s21-fail-{len(results)}.png", full_page=True)
        except Exception: pass
        results.append(f"FAIL  {name}: {str(e).splitlines()[0][:300]}"); print(results[-1], flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Los_Angeles", locale="en-US")
    ctx.route("**/api/**", answer)
    pg = ctx.new_page()
    pg.clock.set_system_time(NOW)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)

    def axe(label):
        pg.add_script_tag(path=AXE)
        v = pg.evaluate(f"axe.run(document, {WCAG}).then(r => r.violations.map(v => v.impact + ' ' + v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(' | ')))")
        assert not v, f"{label} has accessibility problems: {v}"

    def to_code_step():
        pg.goto(B + "/app/login")
        pg.get_by_label("Email").fill("sarah@example.com")
        pg.get_by_label("Password").fill("a long test password")
        pg.get_by_role("button", name="Sign in").click()
        expect(pg.get_by_role("heading", name="Enter your sign-in code")).to_be_visible()

    def ask_for_link():
        reset_state()
        to_code_step()
        pg.get_by_role("button", name="Lost your phone and your recovery codes?").click()
        expect(pg.get_by_role("heading", name="Reset two-step sign-in")).to_be_visible()
        expect(pg.get_by_text("We wait 72 hours.")).to_be_visible()
        axe("The lost-phone panel")
        pg.get_by_role("button", name="Email me a link").click()
        expect(pg.get_by_role("heading", name="Check your email")).to_be_visible()
        expect(pg.get_by_text(REPLY)).to_be_visible()
        assert S["requested"] == 1, S
        # Back to the code is one tap away.
        pg.get_by_role("button", name="Use a code instead").click()
        expect(pg.get_by_label("6-digit code")).to_be_visible()

    step("CC-235 At the code step, Sarah asks for a reset link after losing her phone and codes", ask_for_link)

    def confirm_link():
        pg.goto(B + "/app/recover-two-step?token=confirm-token")
        expect(pg.get_by_role("heading", name="Reset two-step sign-in?")).to_be_visible()
        # The token is read once and taken out of the address bar; opening the link alone changes nothing.
        assert "token" not in pg.url, pg.url
        assert S["wait"] is None, S
        axe("The confirm-link page")
        pg.get_by_role("button", name="Start the 72-hour wait").click()
        expect(pg.get_by_role("heading", name="The wait has started")).to_be_visible()
        expect(pg.get_by_text("Thursday, November 19")).to_be_visible()
        expect(pg.get_by_text("9:00 AM PST")).to_be_visible()

    step("CC-235 The emailed link starts a 72-hour wait only when she presses the button", confirm_link)

    def bad_links():
        pg.goto(B + "/app/recover-two-step?token=confirm-token")
        pg.get_by_role("button", name="Start the 72-hour wait").click()
        expect(pg.get_by_role("heading", name="This link doesn't work")).to_be_visible()
        pg.goto(B + "/app/recover-two-step")
        expect(pg.get_by_role("alert")).to_contain_text("expired or was already used")
        pg.goto(B + "/app/recover-two-step/cancel?token=wrong")
        pg.get_by_role("button", name="Cancel the reset").click()
        expect(pg.get_by_role("heading", name="This link doesn't work")).to_be_visible()
        axe("The expired-link page")

    step("CC-235 A used, missing or wrong link says it doesn't work", bad_links)

    def waiting_at_sign_in():
        to_code_step()
        # A waiting reset opens straight to its state, and Finish isn't offered yet.
        expect(pg.get_by_role("heading", name="Your reset is waiting")).to_be_visible()
        expect(pg.get_by_text("Thursday, November 19")).to_be_visible()
        expect(pg.get_by_role("button", name="Finish the reset")).to_have_count(0)
        axe("The waiting state")

    step("CC-235 Signing in during the wait shows when the reset can be finished", waiting_at_sign_in)

    def signed_in_device_cancels():
        S["signed_in"] = True
        pg.goto(B + "/app/account")
        warn = pg.get_by_role("alert").filter(has_text="Someone asked to reset two-step sign-in")
        expect(warn).to_be_visible()
        expect(warn).to_contain_text("Thursday, November 19")
        axe("My account with a waiting reset")
        warn.get_by_role("button", name="Cancel the reset").click()
        expect(pg.get_by_text("Reset cancelled. Your authenticator app and recovery codes still work.")).to_be_visible()
        expect(pg.get_by_role("alert").filter(has_text="Someone asked to reset")).to_have_count(0)
        assert S["wait"] is None and S["cancelled_by"] == "signed_in", S

    step("CC-235 A device that's still signed in warns about the reset and can cancel it", signed_in_device_cancels)

    def cancel_by_email():
        reset_state(wait={"readyAt": READY, "ready": False})
        pg.goto(B + "/app/recover-two-step/cancel?token=cancel-token")
        expect(pg.get_by_role("heading", name="Cancel the reset?")).to_be_visible()
        assert "token" not in pg.url, pg.url
        axe("The cancel-link page")
        pg.get_by_role("button", name="Cancel the reset").click()
        expect(pg.get_by_role("heading", name="Reset cancelled")).to_be_visible()
        assert S["wait"] is None and S["cancelled_by"] == "email_link", S

    step("CC-235 The cancel link in the email stops the reset without signing in", cancel_by_email)

    def finish_after_wait():
        reset_state(wait={"readyAt": READY, "ready": True})
        to_code_step()
        expect(pg.get_by_role("heading", name="Your reset is ready")).to_be_visible()
        axe("The ready state")
        pg.get_by_role("button", name="Finish the reset").click()
        pg.wait_for_url("**/app/two-step", timeout=5000)
        expect(pg.get_by_role("heading", name="Two-step sign-in")).to_be_visible()
        expect(pg.get_by_role("button", name="Set up two-step sign-in")).to_be_visible()
        expect(pg.get_by_text("2 devices were signed out")).to_be_visible()
        assert S["completed"], S

    step("CC-235 After the wait, she finishes the reset and goes straight to setting up her new phone", finish_after_wait)

    b.close()

print("\n".join(results))
print("errors:", errs[:10] if errs else "none")
sys.exit(1 if errs or any(r.startswith("FAIL") for r in results) else 0)
