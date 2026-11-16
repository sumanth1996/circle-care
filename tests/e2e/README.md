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
