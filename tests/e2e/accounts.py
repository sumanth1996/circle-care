"""End-to-end tests for Sprint 11 — Accounts, Identity & Payments (CC-172 – CC-190).

Runs against the real server (API + PostgreSQL/PGlite), not the static preview:

    npm run build && APP_ENV=test PORT=4180 npx tsx server/index.ts &   # test env: in-memory DB, no rate limits
    E2E_BASE=http://127.0.0.1:4180 python3 tests/e2e/accounts.py

Set SHOTS=1 to also save wiki screenshots.
"""
import io, os, re, time
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright, expect

ROOT = os.environ.get("E2E_BASE", "http://127.0.0.1:4180")
B = ROOT + "/#"
OUT = os.path.join(os.path.dirname(__file__), "out"); os.makedirs(OUT, exist_ok=True)
SHOTS = os.environ.get("SHOTS") == "1"
SHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "wiki", "assets", "screens")
RUN = str(int(time.time()))[-6:]
import random
def test_ssn():  # unique per run: SSNs can't be reused across accounts
    return f"9{random.randint(10, 99)}-{random.randint(10, 99)}-{random.randint(1000, 9999)}"
G_SSN, E_SSN = test_ssn(), test_ssn()
errs, results = [], []

def step(name, fn):
    try:
        fn(); results.append(f"PASS  {name}"); print(results[-1], flush=True)
    except Exception as e:
        try: pg.screenshot(path=f"{OUT}/acct-fail-{len(results)}.png", full_page=True)
        except Exception: pass
        results.append(f"FAIL  {name}: {str(e).splitlines()[0][:300]}"); print(results[-1], flush=True)

def shot(name):
    if not SHOTS: return
    png = pg.screenshot(full_page=True)
    Image.open(io.BytesIO(png)).convert("RGB").save(os.path.join(SHOT_DIR, f"{name}.webp"), "WEBP", quality=82)

def photo_file():
    path = os.path.join(OUT, "portrait.png")
    im = Image.new("RGB", (900, 700), (238, 226, 214))
    d = ImageDraw.Draw(im)
    d.ellipse((300, 140, 600, 440), fill=(196, 150, 120)); d.rectangle((250, 470, 650, 700), fill=(90, 110, 170))
    im.save(path)
    return path

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH") or None)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, timezone_id="America/Los_Angeles")
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "unsplash" not in m.text and "Failed to load resource" not in m.text else None)

    guardian = {"first": "Sarah", "last": "Lee", "phone": "(415) 555-0142", "email": f"sarah.{RUN}@example.com", "pw": "blue-heron-sunrise-42"}

    def no_horizontal_scroll():
        w = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert w <= 1, f"page scrolls sideways by {w}px"

    # CC-172
    def role_picker():
        pg.goto(B + "/")
        pg.get_by_role("link", name="Get started").first.click()
        expect(pg).to_have_url(re.compile(r"/app/join$"))
        for name in ["I'm the elder", "I'm a caregiver", "I'm the legal guardian"]:
            expect(pg.get_by_role("button", name=re.compile(name))).to_be_visible()
        expect(pg.get_by_role("link", name="Sign in")).to_be_visible()
        expect(pg.get_by_role("link", name="Explore the demo instead")).to_be_visible()
        no_horizontal_scroll()
        shot("account-role-picker")
        pg.get_by_role("button", name=re.compile("I'm a caregiver")).click()
        expect(pg.get_by_role("heading", name="Create your account")).to_be_visible()
        pg.get_by_label("First name").fill("Sarah")
        pg.get_by_role("link", name="Change role").click()
        pg.get_by_role("button", name=re.compile("I'm the legal guardian")).click()
        expect(pg.get_by_label("First name")).to_have_value("Sarah")
        expect(pg.get_by_role("list", name=re.compile("Step 1 of 4"))).to_be_visible()

    # CC-173
    def account_step_validation():
        pg.get_by_label("Last name").fill(guardian["last"])
        pg.get_by_label("Contact number").fill("555-01")
        pg.get_by_label("Email").fill(guardian["email"])
        pg.get_by_label("Password", exact=True).fill("password1234")
        pg.get_by_label("Confirm password").fill("password1234")
        pg.get_by_role("button", name="Create account").click()
        expect(pg.get_by_text("Enter a 10-digit US phone number")).to_be_visible()
        expect(pg.get_by_label("Contact number")).to_be_focused()
        expect(pg.locator(".pw-rules li").filter(has_text="Isn't a common password")).not_to_have_class("ok")
        expect(pg.get_by_text("Please agree to the Terms and Privacy Notice to continue")).to_be_visible()

    def account_step_success():
        pg.get_by_label("Contact number").fill(guardian["phone"])
        pg.get_by_label("Password", exact=True).fill(guardian["pw"])
        pg.get_by_label("Confirm password").fill(guardian["pw"])
        expect(pg.locator(".pw-rules li.ok")).to_have_count(3)
        pg.get_by_role("checkbox").check()
        shot("account-create")
        pg.get_by_role("button", name="Create account").click()
        expect(pg.get_by_role("heading", name="Verify your identity")).to_be_visible()

    # CC-180 / CC-182
    def identity_step():
        expect(pg.get_by_text("Test environment — use test data only.")).to_be_visible()
        ssn = pg.get_by_label("Social Security number", exact=True)
        expect(ssn).to_have_attribute("type", "password")
        ssn.fill("212551234")
        expect(ssn).to_have_value("212-55-1234")
        pg.get_by_role("button", name="Continue").click()
        expect(pg.get_by_text(re.compile("This is a test environment. Use a test SSN that starts with 9"))).to_be_visible()
        ssn.fill(G_SSN)
        pg.get_by_role("button", name="Show Social Security number").click()
        expect(ssn).to_have_attribute("type", "text")
        shot("account-identity")
        pg.get_by_role("button", name="Continue").click()
        expect(pg.get_by_role("heading", name="Add a photo")).to_be_visible()
        assert G_SSN not in pg.content() and G_SSN.replace("-", "") not in pg.content()

    # CC-179
    def photo_step():
        pg.locator('input[type="file"]').set_input_files(photo_file())
        expect(pg.get_by_role("img", name="Preview of your new photo")).to_be_visible()
        shot("account-photo")
        pg.get_by_role("button", name="Save photo").click()
        expect(pg.get_by_role("heading", name="Add your bank account")).to_be_visible()

    # CC-186
    def bank_step():
        pg.get_by_label("Bank name").fill("Bank of America")
        pg.get_by_label("Routing number").fill("021000021")
        pg.get_by_label("Account number", exact=True).fill("000123456789")
        pg.get_by_label("Confirm account number").fill("000123456789")
        pg.get_by_role("button", name="Save and finish").click()
        expect(pg.get_by_text(re.compile("Use the test routing number 110000000"))).to_be_visible()
        pg.get_by_label("Routing number").fill("110000000")
        pg.get_by_label("Confirm account number").fill("000123456780")
        pg.get_by_role("button", name="Save and finish").click()
        expect(pg.get_by_text("Account numbers don't match")).to_be_visible()
        pg.get_by_label("Confirm account number").fill("000123456789")
        shot("account-bank")
        pg.get_by_role("button", name="Save and finish").click()
        expect(pg).to_have_url(re.compile(r"/app/account$"))

    # CC-176 – CC-178, CC-181
    def my_account():
        expect(pg.get_by_role("heading", name="Sarah Lee", level=1)).to_be_visible()
        expect(pg.get_by_text("Profile complete")).to_be_visible()
        expect(pg.get_by_role("img", name="Sarah Lee").first).to_be_visible()
        expect(pg.get_by_label("Social Security number ending in " + " ".join(G_SSN[-4:]))).to_have_text("•••-••-" + G_SSN[-4:])
        bank = pg.locator(".pm-card").filter(has_text="Bank of America")
        expect(bank).to_contain_text("•••• 6789")
        expect(bank).to_contain_text("No platform fee")
        assert "000123456789" not in pg.content()
        no_horizontal_scroll()

    # CC-187 / CC-188
    def cards():
        pg.get_by_role("button", name="Add a card").click()
        pg.get_by_label("Card number").fill("4111 1111 1111 1111")
        pg.get_by_label("Expiry (MM/YY)").fill("1230")
        pg.get_by_label("Security code").fill("123")
        pg.get_by_label("Billing ZIP").fill("94114")
        pg.get_by_role("button", name="Add card").click()
        expect(pg.get_by_text(re.compile("Use one of the test cards"))).to_be_visible()
        pg.get_by_label("Card number").fill("4242424242424242")
        expect(pg.get_by_label("Card number")).to_have_value("4242 4242 4242 4242")
        pg.get_by_role("button", name="Add card").click()
        expect(pg.locator(".pm-card").filter(has_text="•••• 4242")).to_contain_text("Primary")
        pg.get_by_role("button", name="Add a card").click()
        pg.get_by_label("Card number").fill("5200828282828210")
        pg.get_by_label("Expiry (MM/YY)").fill("0929")
        pg.get_by_label("Security code").fill("321")
        pg.get_by_label("Billing ZIP").fill("94110")
        pg.get_by_label("Make this my primary payment method").check()
        pg.get_by_role("button", name="Add card").click()
        mc = pg.locator(".pm-card").filter(has_text="•••• 8210")
        expect(mc).to_contain_text("Primary")
        expect(mc).to_contain_text("debit")
        expect(pg.locator(".pm-card").filter(has_text="•••• 4242")).not_to_contain_text("Primary")
        shot("account-payments")
        pg.get_by_role("button", name="Remove Mastercard ending 8210").click()
        pg.get_by_role("button", name="Remove", exact=True).click()
        expect(pg.get_by_text(re.compile("Visa •••• 4242 is now primary"))).to_be_visible()
        expect(pg.locator(".pm-card").filter(has_text="•••• 4242")).to_contain_text("Primary")

    # CC-185
    def activity():
        pg.reload()
        act = pg.locator(".activity")
        expect(act).to_contain_text("Bank account ending 6789 added")
        expect(act).to_contain_text(f"Social Security number ending {G_SSN[-4:]} added")
        expect(act).to_contain_text("Visa ending 4242 added")
        expect(act).to_contain_text("Profile photo updated")
        shot("account-overview")

    # CC-176 edit profile
    def edit_profile():
        pg.get_by_label("First name").fill("Sara")
        pg.get_by_role("button", name="Save changes").click()
        expect(pg.get_by_role("heading", name="Sara Lee", level=1)).to_be_visible()
        pg.get_by_label("First name").fill("Sarah")
        pg.get_by_role("button", name="Save changes").click()
        expect(pg.get_by_role("heading", name="Sarah Lee", level=1)).to_be_visible()

    # CC-174 / CC-175
    def sign_out_in():
        pg.get_by_role("button", name="Sign out").click()
        expect(pg).to_have_url(B + "/")
        pg.goto(B + "/app/login")
        pg.get_by_label("Email").fill(guardian["email"])
        pg.get_by_label("Password").fill("not-my-password-1")
        pg.get_by_role("button", name="Sign in").click()
        expect(pg.get_by_text("Email or password is incorrect.")).to_be_visible()
        shot("account-signin")
        pg.get_by_label("Password").fill(guardian["pw"])
        pg.get_by_role("button", name="Sign in").click()
        expect(pg).to_have_url(re.compile(r"/app/account$"))
        expect(pg.get_by_role("link", name="My account")).to_have_count(0)  # account page has its own header

    def lockout():
        c2 = b.new_context(viewport={"width": 390, "height": 844}); p2 = c2.new_page()
        p2.goto(B + "/app/login")
        for _ in range(5):
            p2.get_by_label("Email").fill(guardian["email"])
            p2.get_by_label("Password").fill("wrong-password-123")
            p2.get_by_role("button", name="Sign in").click()
            p2.wait_for_timeout(250)
        expect(p2.get_by_text("Too many attempts. Try again in 15 minutes.")).to_be_visible()
        c2.close()

    # Elder: three steps, skip photo, no payments
    def elder_flow():
        c3 = b.new_context(viewport={"width": 390, "height": 844}); p3 = c3.new_page()
        p3.goto(B + "/app/join/elder")
        expect(p3.get_by_role("list", name=re.compile("Step 1 of 3"))).to_be_visible()
        p3.get_by_label("First name").fill("Margaret")
        p3.get_by_label("Last name").fill("Lee")
        p3.get_by_label("Contact number").fill("4155550117")
        p3.get_by_label("Email").fill(f"margaret.{RUN}@example.com")
        p3.get_by_label("Password", exact=True).fill("garden-roses-in-june")
        p3.get_by_label("Confirm password").fill("garden-roses-in-june")
        p3.get_by_role("checkbox").check()
        p3.get_by_role("button", name="Create account").click()
        p3.get_by_label("Social Security number", exact=True).fill(E_SSN)
        p3.get_by_role("button", name="Continue").click()
        p3.get_by_role("button", name="Skip for now").click()
        expect(p3).to_have_url(re.compile(r"/app/account$"))
        expect(p3.get_by_text("Profile complete")).to_be_visible()
        expect(p3.get_by_role("heading", name="Payments")).to_have_count(0)
        expect(p3.get_by_role("img", name="Margaret Lee").first).to_have_text("ML")
        c3.close()

    # Duplicate email: generic message
    def duplicate_email():
        c4 = b.new_context(); p4 = c4.new_page()
        p4.goto(B + "/app/join/caregiver")
        p4.get_by_label("First name").fill("Ana"); p4.get_by_label("Last name").fill("Reyes")
        p4.get_by_label("Contact number").fill("4155550190"); p4.get_by_label("Email").fill(guardian["email"])
        p4.get_by_label("Password", exact=True).fill("kettle-and-compass-9"); p4.get_by_label("Confirm password").fill("kettle-and-compass-9")
        p4.get_by_role("checkbox").check(); p4.get_by_role("button", name="Create account").click()
        expect(p4.get_by_text("We couldn't create an account with these details. If you already have one, sign in.")).to_be_visible()
        c4.close()

    def welcome_links():
        pg.goto(B + "/app")
        expect(pg.get_by_role("link", name="Go to my account")).to_be_visible()

    for name, fn in [
        ("CC-172 role picker, change role keeps details", role_picker),
        ("CC-173 account step validation and focus", account_step_validation),
        ("CC-173 create guardian account", account_step_success),
        ("CC-180/182 identity: real SSN blocked, test SSN saved, never in page", identity_step),
        ("CC-179 photo upload with preview", photo_step),
        ("CC-186 bank: real routing blocked, mismatch caught, saved", bank_step),
        ("CC-176-178/181 my account: complete, masked SSN, bank last four", my_account),
        ("CC-187/188 cards: test-only, primary, auto-promote on remove", cards),
        ("CC-185 recent activity", activity),
        ("CC-176 edit profile", edit_profile),
        ("CC-174 sign out, wrong password, sign in", sign_out_in),
        ("CC-175 lockout after 5 failures", lockout),
        ("CC-172/177 elder: 3 steps, skip photo, no payments", elder_flow),
        ("CC-173 duplicate email gives a generic message", duplicate_email),
        ("Welcome page links to my account", welcome_links),
    ]:
        step(name, fn)

    b.close()

fails = [r for r in results if r.startswith("FAIL")]
print(f"\n{len(results) - len(fails)}/{len(results)} passed")
if errs: print("Console errors:", *errs[:10], sep="\n  ")
raise SystemExit(1 if fails or errs else 0)
