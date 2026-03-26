# Indiana – Asia Pacific Trade & Investment Dashboard

Built for the Asia Pacific Business Association of Indiana. Displays Indiana export data by country and commodity alongside named Asia-Pacific investment events in Indiana.

## Data files

The dashboard reads CSV files from the `/data/` folder at the project root (same level as `index.html`):

| File | Source | Update frequency |
|---|---|---|
| `indiana_trade.csv` | U.S. Census Bureau, normalized via `normalize_trade.py` | Annual |
| `investment_events.csv` | APBAI Investment Tracker, via `consolidate_investments.py` | As investments are added |
| `presence_records.csv` | APBAI Investment Tracker — JETRO facility list | Annual |

To update data: replace files in `/data/` with new exports, then push to GitHub.

## Local preview

The dashboard loads CSVs via HTTP and cannot run from `file://` URLs directly. Start a local server first:

```bash
cd apbai-dashboard
python3 -m http.server 8080
```

Then open http://localhost:8080 in your browser.

Alternatively, use the VS Code Live Server extension — right-click `index.html` → "Open with Live Server."

## Deploy to GitHub Pages

1. Create a new public repository at github.com
2. From your local project folder:

```bash
git init
git add .
git commit -m "initial deploy"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

3. In the GitHub repo: **Settings → Pages → Source → Deploy from a branch → Branch: main → Folder: / (root) → Save**
4. Live at `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME` within ~60 seconds

## Updating data

```bash
git add data/
git commit -m "update trade data March 2026"
git push
```

GitHub Pages redeploys automatically on every push.
