import os
from playwright.sync_api import sync_playwright, expect

OUT = os.path.join(os.path.dirname(__file__), "out"); os.makedirs(OUT, exist_ok=True)
B = "http://127.0.0.1:4173/#"
errs = []
results = []

def step(name, fn):
    try:
        fn(); results.append(f"PASS  {name}"); print(results[-1], flush=True)
    except Exception as e:
        try: pg.screenshot(path=f"{OUT}/fail-{len(results)}.png")
        except Exception: pass
        results.append(f"FAIL  {name}: {str(e).splitlines()[0][:300]}"); print(results[-1], flush=True)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/New_York")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "unsplash" not in m.text and "Failed to load resource" not in m.text else None)

    def tour(finish=False):
        dlg = pg.get_by_role("dialog", name="Getting started")
        try:
            dlg.wait_for(timeout=1500)
        except Exception:
            return False
        if finish:
            while dlg.get_by_role("button", name="Next").count():
                dlg.get_by_role("button", name="Next").click()
            dlg.get_by_role("button", name="I'd like a free setup call").click()
        else:
            dlg.get_by_role("button", name="Skip").click()
        return True

    def signin(persona, name):
        pg.goto(B + f"/app/sign-in/{persona}")
        if persona == "elder":
            pg.get_by_role("button", name="Sign in with Face ID").click()
        else:
            pg.get_by_role("button", name="Continue").click()
            pg.get_by_label("6-digit code").fill("482913")
            pg.get_by_role("button", name="Sign in").click()
        pg.wait_for_timeout(1200)

    # ---------- Marketing site ----------
    def site_nav():
        pg.goto(B + "/")
        pg.get_by_role("link", name="See how it works").first.click()
        expect(pg).to_have_url(B + "/how-it-works")
        expect(pg.get_by_role("heading", level=1)).to_be_visible()
        for path in ["/features", "/who-its-for", "/privacy", "/pilot"]:
            pg.goto(B + path)
            expect(pg.get_by_role("heading", level=1)).to_be_visible()
            assert pg.url.endswith(path), pg.url
        pg.goto(B + "/features")
        pg.get_by_role("button", name="For Ana").click()
        expect(pg.get_by_role("button", name="For Ana")).to_have_attribute("aria-pressed", "true")
        pg.goto(B + "/pilot")
        pg.get_by_label("Your name").fill("Test Person")
        pg.get_by_label("Email or phone").fill("test@example.com")
        pg.get_by_label("State").fill("Michigan")
        pg.locator("form.pilot-form input[type=checkbox]").check()
        pg.locator("form.pilot-form button[type=submit], form.pilot-form button").last.click()
        expect(pg.get_by_role("status")).to_be_visible()
    step("Website: every nav page resolves; pilot sign-up works", site_nav)

    def site_mobile_menu():
        pg.goto(B + "/")
        pg.get_by_role("button", name="Menu", exact=False).click()
        pg.get_by_role("link", name="Features").first.click()
        expect(pg).to_have_url(B + "/features")
    step("Website: mobile menu navigates", site_mobile_menu)

    def signin_guardian():
        pg.goto(B + "/app"); pg.get_by_role("button", name="Sarah").click()
        pg.get_by_role("button", name="Continue").click()
        pg.get_by_label("6-digit code").fill("482913")
        pg.get_by_role("button", name="Sign in").click()
        assert tour(finish=True), "tour did not show on first visit"
        expect(pg.get_by_text("Good morning, Sarah").or_(pg.get_by_text("Good afternoon, Sarah")).or_(pg.get_by_text("Good evening, Sarah"))).to_be_visible()
    step("Guardian sign-in with MFA", signin_guardian)

    def mfa_lockout():
        pg.goto(B + "/app/sign-in/caregiver"); pg.get_by_role("button", name="Continue").click()
        box = pg.get_by_label("6-digit code")
        for _ in range(5):
            box.fill("111111"); pg.get_by_role("button", name="Sign in").click()
        expect(pg.get_by_text("Account locked for 15 minutes")).to_be_visible()
    step("MFA lockout after 5 wrong codes", mfa_lockout)

    def elder_sos():
        pg.goto(B + "/app/sign-in/elder")
        pg.get_by_role("button", name="Sign in with Face ID").click()
        pg.wait_for_timeout(1200); tour()
        expect(pg.get_by_text("Call my person")).to_be_visible(timeout=5000)
        pg.goto(B + "/app/elder/sos")
        btn = pg.get_by_role("button", name="Press and hold for 2 seconds to send SOS")
        btn.hover(); pg.mouse.down(); pg.wait_for_timeout(2300); pg.mouse.up()
        expect(pg.get_by_text("Sending for help in")).to_be_visible()
        pg.get_by_role("button", name="Send now").click()
        expect(pg.get_by_text("Help is on the way")).to_be_visible()
    step("Elder holds SOS, countdown, sends", elder_sos)

    def guardian_responds():
        pg.goto(B + "/app/guardian")
        expect(pg.get_by_text("Maggie pressed SOS").first).to_be_visible()
        pg.goto(B + "/app/guardian/sos")
        pg.get_by_role("button", name="I'm on my way").click()
        pg.goto(B + "/app/elder/sos")
        expect(pg.get_by_text("Sarah is coming")).to_be_visible()
        pg.screenshot(path=f"{OUT}/e2e-elder-coming.png")
        pg.get_by_role("button", name="I'm OK now").click()
        expect(pg.get_by_text("Call my person")).to_be_visible()
    step("Guardian acknowledges SOS, elder sees responder, resolves", guardian_responds)

    def missed_dose():
        pg.goto(B + "/app/guardian")
        pg.get_by_role("button", name="Demo mode", exact=False).click()
        pg.get_by_role("button", name="Simulate a missed dose").click()
        pg.wait_for_timeout(500)
        expect(pg.get_by_text("Lisinopril not confirmed")).to_be_visible()
        pg.screenshot(path=f"{OUT}/e2e-guardian-missed.png", full_page=True)
        pg.goto(B + "/app/sign-in/caregiver")
        pg.get_by_role("button", name="Continue").click(); pg.get_by_label("6-digit code").fill("482913"); pg.get_by_role("button", name="Sign in").click()
        pg.wait_for_timeout(600); tour()
        if pg.get_by_role("button", name="Check in").count():
            pg.get_by_role("button", name="Check in").first.click(); pg.get_by_role("button", name="Check in — I'm here").click(); pg.wait_for_timeout(1200)
        row = pg.locator(".dose-row.open").first
        row.get_by_role("button", name="Given", exact=True).click()
        pg.goto(B + "/app/guardian")
        expect(pg.get_by_text("Lisinopril not confirmed")).to_have_count(0)
    step("Missed dose escalates to guardian, caregiver gives it, alert clears", missed_dose)

    def task_note():
        pg.goto(B + "/app/caregiver")
        pg.get_by_role("button", name="Add a note to", exact=False).first.click()
        pg.get_by_label("Note (optional)").fill("Walked 15 minutes, in good spirits")
        pg.get_by_role("button", name="Mark done").click()
        expect(pg.get_by_text("Walked 15 minutes, in good spirits")).to_be_visible()
        pg.goto(B + "/app/caregiver/notes")
        expect(pg.get_by_role("heading", name="Notes & documents")).to_be_visible()
    step("CC-45 task note; CC-19 notes open once on shift", task_note)

    def approval():
        pg.goto(B + "/app/guardian/approvals")
        pg.get_by_role("button", name="Approve").first.click()
        pg.goto(B + "/app/elder/decisions")
        expect(pg.get_by_text("New").first).to_be_visible()
        pg.get_by_role("button", name="OK, got it").first.click()
    step("Guardian approves request; elder sees decision", approval)

    def handoff():
        pg.goto(B + "/app/caregiver")
        pg.get_by_role("button", name="End shift").click()
        expect(pg.get_by_text("Drafted from your shift")).to_be_visible()
        val = pg.get_by_label("Summary").input_value()
        assert "Medicines:" in val and "Tasks:" in val, val
        pg.screenshot(path=f"{OUT}/e2e-handoff.png", full_page=True)
        pg.get_by_role("button", name="Send hand-off and check out").click()
        expect(pg.get_by_text("Checked out at")).to_be_visible()
    step("Smart hand-off draft and check-out", handoff)

    def caregiver_guard():
        pg.goto(B + "/app/caregiver/notes")
        expect(pg.get_by_text("Available during your shift")).to_be_visible()
    step("CC-19 caregiver off shift cannot open notes", caregiver_guard)

    def privacy_pause():
        pg.goto(B + "/app/elder/privacy")
        pg.get_by_role("switch", name="Pause sharing").check(force=True)
        pg.goto(B + "/app/caregiver")
        expect(pg.get_by_text("Maggie has paused sharing")).to_be_visible()
        pg.goto(B + "/app/elder/privacy")
        pg.get_by_role("switch", name="Pause sharing").uncheck(force=True)
    step("Elder pauses sharing; caregiver view is blocked", privacy_pause)

    def invite():
        pg.goto(B + "/app/guardian/circle")
        pg.get_by_role("button", name="Invite someone").click()
        pg.get_by_label("Name", exact=True).fill("Lena Park")
        pg.get_by_label("Mobile number or email").fill("+1 616 555 0100")
        pg.get_by_role("button", name="Send invite").click()
        expect(pg.locator(".list-title", has_text="Lena Park")).to_have_count(1)
    step("Guardian invites a new member", invite)

    def digest():
        pg.goto(B + "/app/guardian/digest")
        expect(pg.get_by_text("doses taken").first).to_be_visible()
    step("Weekly digest renders", digest)

    # ---------- New stories ----------
    PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d49444154789c6360f8cfc0f01f0005000201" "e221bc330000000049454e44ae426082")
    def doc_upload():
        pg.goto(B + "/app/guardian/notes")
        pg.get_by_label("Document type").select_option("Legal authority")
        pg.get_by_test_id("doc-upload").set_input_files(files=[{"name": "fake.pdf", "mimeType": "application/pdf", "buffer": b"MZ not really a pdf"}])
        expect(pg.get_by_role("alert")).to_contain_text("isn't a PDF, PNG or JPEG")
        pg.get_by_test_id("doc-upload").set_input_files(files=[{"name": "court-order.png", "mimeType": "image/png", "buffer": PNG}])
        expect(pg.get_by_text("court-order.png")).to_be_visible()
        pg.get_by_role("button", name="View court-order.png").click()
        expect(pg.locator(".watermark span").first).to_contain_text("Sarah")
        expect(pg.locator(".doc-view img")).to_be_visible()
        pg.keyboard.press("Escape")
    step("CC-67 upload checks file type, encrypts, watermarked viewer", doc_upload)

    def review():
        pg.goto(B + "/app/review")
        row = pg.locator(".list-row", has_text="court-order.png")
        row.get_by_role("button", name="Reject").click()
        pg.get_by_role("radio", name="It has expired").check()
        pg.get_by_role("button", name="Reject and notify").click()
        expect(row.get_by_text("Rejected: It has expired")).to_be_visible()
        pg.goto(B + "/app/guardian/notes")
        expect(pg.get_by_text("couldn't be verified: It has expired")).to_be_visible()
    step("CC-24 review team rejects with reason; guardian told to resubmit", review)

    def suspicious():
        pg.goto(B + "/app/guardian")
        pg.get_by_role("button", name="Demo mode", exact=False).click()
        pg.get_by_role("button", name="Simulate suspicious access").click()
        pg.wait_for_timeout(500)
        pg.goto(B + "/app/guardian/alerts")
        expect(pg.get_by_text("Unusual activity").first).to_be_visible()
    step("CC-35 suspicious access alerts the guardian", suspicious)

    def old_request():
        pg.goto(B + "/app/guardian")
        pg.get_by_role("button", name="Demo mode", exact=False).click()
        pg.get_by_role("button", name="Simulate a request waiting a day").click()
        pg.wait_for_timeout(500)
        pg.goto(B + "/app/guardian/alerts")
        expect(pg.get_by_text("waiting for your decision for over a day").first).to_be_visible()
    step("CC-64 24-hour approval reminder", old_request)

    def integrity_export():
        pg.goto(B + "/app/guardian/privacy")
        expect(pg.get_by_text("Access log is intact")).to_be_visible()
        pg.get_by_role("button", name="Download Maggie's data", exact=False).click()
        pg.get_by_role("button", name="Confirm with Face ID").click()
        pg.get_by_label("Passphrase (at least 8 characters)").fill("blue-harbor-42")
        pg.get_by_label("Type it again").fill("blue-harbor-42")
        with pg.expect_download() as d:
            pg.get_by_role("button", name="Download encrypted copy").click()
        path = os.path.join(OUT, "export.ccexport"); d.value.save_as(path)
        txt = open(path).read()
        assert "AES-256-GCM" in txt and "Lisinopril" not in txt, "export not encrypted"
        pg.get_by_role("button", name="Open a downloaded copy", exact=False).click()
        pg.get_by_label("Export file").set_input_files(path)
        pg.get_by_label("Passphrase", exact=True).fill("wrong-pass")
        pg.get_by_role("button", name="Unlock").click()
        expect(pg.get_by_role("alert")).to_contain_text("doesn't open")
        pg.get_by_label("Passphrase", exact=True).fill("blue-harbor-42")
        pg.get_by_role("button", name="Unlock").click()
        expect(pg.get_by_role("status").filter(has_text="medicines")).to_be_visible()
        pg.keyboard.press("Escape")
    step("CC-28 integrity check; CC-32 passphrase-encrypted export round-trip", integrity_export)

    def storage_encrypted():
        raw = pg.evaluate("localStorage.getItem('circle-care-demo')")
        assert raw.startswith("enc:v1:") and "Maggie" not in raw, raw[:60]
    step("CC-26 data at rest in the browser is encrypted", storage_encrypted)

    def consent_behalf():
        pg.goto(B + "/app/guardian/settings")
        pg.get_by_role("button", name="Agree on Maggie's behalf").click()
        pg.get_by_label("Why is Maggie unable to agree herself?").fill("Maggie is in hospital after surgery this week")
        pg.get_by_role("button", name="Agree as her guardian").click()
        expect(pg.get_by_text("Maggie is in hospital", exact=False)).to_be_visible()
    step("CC-22 guardian consents on the elder's behalf with a reason", consent_behalf)

    def elder_settings():
        pg.goto(B + "/app/elder/settings")
        pg.get_by_role("radio", name="After 5 minutes").click()
        expect(pg.get_by_role("radio", name="After 5 minutes")).to_have_attribute("aria-checked", "true")
        pg.get_by_label("Want a change? Tell Sarah.").fill("Call Ruth before James")
        pg.get_by_role("button", name="Send suggestion").click()
        pg.goto(B + "/app/guardian/alerts")
        expect(pg.get_by_text("Call Ruth before James").first).to_be_visible()
    step("CC-14 elder lock option; CC-48 elder suggests SOS-list change", elder_settings)

    def nps():
        pg.goto(B + "/app/guardian")
        pg.get_by_role("button", name="Demo mode", exact=False).click()
        pg.get_by_role("button", name="Show the feedback survey").click()
        pg.get_by_role("radio", name="9").click()
        pg.get_by_label("What's the main reason? (optional)").fill("Peace of mind. Her metformin dose is easier to track")
        pg.get_by_role("button", name="Send feedback").click()
        stored = pg.evaluate("localStorage.getItem('circle-care-nps')")
        assert "metformin" not in stored and "[removed]" in stored, stored
        pg.goto(B + "/app/pilot")
        pg.get_by_role("button", name="This device").click()
        expect(pg.get_by_text("Fewer than 5 — hidden").first).to_be_visible()
        pg.get_by_role("button", name="Sample cohort").click()
        expect(pg.get_by_text("Net Promoter Score")).to_be_visible()
    step("CC-76 NPS survey scrubs health words; CC-77 dashboard hides small groups", nps)

    # ---------- Health & Calendar (CC-84 – CC-98) ----------
    def health():
        pg.goto(B + "/app/guardian/health")
        expect(pg.get_by_text("unusual reading", exact=False).first).to_be_visible()
        expect(pg.get_by_text("Stand hours").first).to_be_visible()
        pg.get_by_role("button", name="Heart & oxygen").click()
        expect(pg.get_by_text("Heart rate high: 128 bpm").first).to_be_visible()
        expect(pg.get_by_text("Blood oxygen low: 89%").first).to_be_visible()
        pg.get_by_role("button", name="Show all readings as a table").click()
        expect(pg.locator(".data-table tbody tr").first).to_be_visible()
        assert pg.locator(".data-table tbody tr").count() >= 20
        pg.get_by_role("button", name="Previous day").click()
        expect(pg.get_by_text("Yesterday")).to_be_visible()
        pg.get_by_role("button", name="Activity").click()
        expect(pg.get_by_text("How Maggie spent", exact=False)).to_be_visible()
        expect(pg.get_by_text("Mental well-being", exact=False)).to_be_visible()
    step("CC-84/85/86/89-92 guardian Health: summary, vitals, table, activity", health)

    def health_alert():
        pg.goto(B + "/app/guardian/health")
        pg.get_by_role("button", name="Demo mode", exact=False).click()
        pg.get_by_role("button", name="Simulate a sudden heart-rate change").click()
        pg.wait_for_timeout(600)
        pg.goto(B + "/app/guardian/alerts")
        expect(pg.get_by_text("Heart rate high", exact=False).first).to_be_visible()
    step("CC-86 a sudden heart-rate change alerts the guardian", health_alert)

    def health_sharing():
        pg.goto(B + "/app/elder/privacy")
        pg.get_by_role("switch", name="Share health readings with Sarah").uncheck(force=True)
        pg.goto(B + "/app/guardian/health")
        expect(pg.get_by_text("Maggie isn't sharing health readings")).to_be_visible()
        pg.goto(B + "/app/elder/privacy")
        pg.get_by_role("switch", name="Share health readings with Sarah").check(force=True)
        pg.goto(B + "/app/guardian/health")
        expect(pg.get_by_role("heading", name="Health", exact=True)).to_be_visible()
    step("CC-87 Maggie controls whether Sarah sees health readings", health_sharing)

    def calendar():
        pg.goto(B + "/app/guardian/calendar")
        expect(pg.get_by_text("Up next", exact=False)).to_be_visible()
        expect(pg.locator(".cal-cell")).to_have_count(pg.locator(".cal-row:not(.cal-head)").count() * 7)
        pg.get_by_role("button", name="Next month").click()
        pg.get_by_role("button", name="Today", exact=True).click()
        pg.get_by_role("button", name="Add appointment").click()
        pg.get_by_label("What").fill("Blood pressure recheck")
        pg.get_by_label("With (doctor, lab or pharmacy)").fill("Dr. Hannah Brooks")
        pg.locator(".pill-check", has_text="Lisinopril").click()
        pg.get_by_role("button", name="Add to calendar").click()
        expect(pg.locator(".appt", has_text="Blood pressure recheck")).to_be_visible()
        pg.locator(".appt", has_text="Blood pressure recheck").get_by_role("button", name="Cancel").click()
        expect(pg.locator(".appt", has_text="Blood pressure recheck").get_by_text("Cancelled")).to_be_visible()
    step("CC-94/96/97 month calendar: next-up, navigation, add and cancel", calendar)

    def sign_out_all():
        pg.goto(B + "/app/guardian/privacy")
        pg.get_by_role("button", name="Sign out everywhere", exact=False).click()
        pg.goto(B + "/app/guardian")
        expect(pg).to_have_url(B + "/app/sign-in/guardian")
    step("CC-27 sign out everywhere", sign_out_all)

    def close_circle():
        signin("guardian", "Sarah"); tour()
        pg.goto(B + "/app/guardian/privacy")
        pg.get_by_role("button", name="Close this circle and delete its data").click()
        pg.get_by_label("Type DELETE to confirm").fill("delete")
        pg.get_by_role("button", name="Delete everything").click()
        pg.wait_for_timeout(800)
        expect(pg).to_have_url(B + "/")
        n = pg.evaluate("new Promise(r => { const q = indexedDB.open('circle-care-files'); q.onsuccess = () => { const c = q.result.transaction('files').objectStore('files').count(); c.onsuccess = () => r(c.result); }; })")
        assert n == 0, f"{n} files remain"
    step("CC-33 close circle deletes data and files", close_circle)

    b.close()

print("\n".join(results))
print("errors:", errs[:10] if errs else "none")
