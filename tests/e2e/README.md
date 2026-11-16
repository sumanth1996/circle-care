# End-to-end and accessibility tests

Python + Playwright scripts that drive the production build like a person would.

```bash
npm run build && npx vite preview --port 4173 &
pip install playwright==1.49.1 && python -m playwright install chromium
python tests/e2e/e2e.py        # 29 scenarios across the website and all three personas
python tests/e2e/everyday.py   # CC-194: family chat and evening recap (7 scenarios)
python tests/e2e/calm.py       # Sprint 16: reminder count and snooze, reminder setting, all-clear (3 scenarios)
python tests/e2e/help.py       # Sprint 16: Help board post, claim, done, masked appointment, health hint (5 scenarios)
python tests/e2e/a11y.py       # axe-core WCAG 2.1 A/AA audit of 30 screens plus the evening recap card
```

Each script exits with 1 when a scenario fails or the audit finds a violation. `e2e.py` and `everyday.py` also exit with 1 when the page throws or logs a console error.

**CI.** `.github/workflows/browser-tests.yml` runs the unit tests and these five scripts on every pull request to `main`, on every push to `main` and on demand, on GitHub's Ubuntu runners with Playwright 1.49.1. If the preview server doesn't start, the browser steps are skipped and its log is printed. Screenshots are kept as the `browser-test-screenshots` artifact for 7 days.

Set `CHROMIUM_PATH` to use a specific Chromium binary. Screenshots of failures and the test export file go to `tests/e2e/out/` (git-ignored). `accounts.py` needs the real accounts server (`npm start` with `E2E_BASE` set) and isn't part of CI yet.

**Against the real accounts server.** Start it in the test environment (embedded database, rate limits off), then point the scripts at it:

```bash
npm run build && APP_ENV=test PORT=4180 npx tsx server/index.ts &
E2E_BASE=http://127.0.0.1:4180 python3 tests/e2e/accounts.py   # sign-up, two-step sign-in, sessions, profile, payments (20 scenarios)
E2E_BASE=http://127.0.0.1:4180 python3 tests/e2e/a11y.py       # adds the account, sign-in, two-step and password pages
```

Guardians and caregivers must set up two-step sign-in before the server lets them use their account (CC-200), so both scripts act as the authenticator app: `totp_helper.py` reads the setup key from the page or the API and makes the 6-digit codes with Python's standard library (RFC 6238, SHA-1, 30-second steps). Run `python3 tests/e2e/totp_helper.py` to check it against the RFC test vectors. The server accepts each 30-second step once, so a script that signs in several times in a row may wait up to 30 seconds for a fresh code. A password-reset email goes to the server's in-memory outbox, which the scripts can't read, so `accounts.py` checks the reset request and a bad link but not a completed reset; the API tests in `server/__tests__/sessions.test.ts` cover that.
