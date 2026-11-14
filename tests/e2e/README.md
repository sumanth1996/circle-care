# End-to-end and accessibility tests

Python + Playwright scripts that drive the production build like a person would.

```bash
npm run build && npx vite preview --port 4173 &
pip install playwright && python -m playwright install chromium
python tests/e2e/e2e.py        # 29 scenarios across the website and all three personas
python tests/e2e/everyday.py   # CC-194: family chat and evening recap (7 scenarios)
python tests/e2e/a11y.py       # axe-core WCAG 2.1 A/AA audit of 26 screens plus the evening recap card
```

Each script exits with 1 when a scenario fails or the audit finds a violation.

**CI.** `.github/workflows/browser-tests.yml` runs the unit tests and these three scripts on every pull request to `main`, on GitHub's Ubuntu runners. Screenshots are kept as the `browser-test-screenshots` artifact for 7 days.

Set `CHROMIUM_PATH` to use a specific Chromium binary. Screenshots of failures and the test export file go to `tests/e2e/out/` (git-ignored). `accounts.py` needs the real accounts server (`npm start` with `E2E_BASE` set) and isn't part of CI yet.
