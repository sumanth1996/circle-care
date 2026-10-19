# End-to-end and accessibility tests

Python + Playwright scripts that drive the production build like a person would.

```bash
npm run build && npx vite preview --port 4173 &
pip install playwright && python -m playwright install chromium
python tests/e2e/e2e.py    # 29 scenarios across the website and all three personas
python tests/e2e/a11y.py   # axe-core WCAG 2.1 A/AA audit of 24 screens
```

Set `CHROMIUM_PATH` to use a specific Chromium binary. Screenshots of failures and the test export file go to `tests/e2e/out/` (git-ignored).
