# Frontend - Fraud & AML Risk Console

React 19 + TypeScript dashboard built with Vite and Recharts. It uploads an `.xlsx` file to the backend and visualises the fraud and AML predictions.

For the backend and full project setup, see the [root README](../README.md).

## Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | 20 or newer | `node -v` |
| npm | 10 or newer (ships with Node.js) | `npm -v` |
| Backend | running on `http://localhost:8000` | open `http://localhost:8000/health` |

## Setup

```powershell
cd frontend
npm install
```

## Run in development

```powershell
npm run dev
```

Open <http://localhost:5173>. The page reloads automatically when you edit files in `src/`.

The header shows the backend status:

| Status | Meaning |
| --- | --- |
| **Models ready** | Backend is up and both models are loaded |
| **Models loading** | Backend is up but a model is not loaded yet |
| **API offline** | Frontend cannot reach the backend; start it first |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload on port 5173 |
| `npm run build` | Type-check with `tsc`, then build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally to test the production build |

## Backend connection

The browser calls `/api/...`; the Vite dev server forwards it to the backend and strips the `/api` prefix (see [vite.config.ts](vite.config.ts)):

| Frontend calls | Backend receives |
| --- | --- |
| `GET /api/health` | `GET /health` |
| `POST /api/predict` | `POST /predict` |

If the backend runs on another host or port, change `target` in [vite.config.ts](vite.config.ts) and restart `npm run dev`. This proxy only applies to the dev and preview servers. For a production deployment, make your web server route `/api/*` to the backend (removing the prefix), or serve both from the same origin.

## Project structure

```
frontend/
  index.html
  vite.config.ts            dev server port and /api proxy
  src/
    main.tsx                entry point
    App.tsx                 page shell, tabs, upload state
    api.ts                  fetch calls (/health, /predict)
    types.ts                response and row types
    analytics.ts            merges fraud + AML results, builds chart data, CSV export
    styles.css              all styling
    components/
      UploadPanel.tsx       drag-and-drop upload and health indicator
      Overview.tsx          summary cards, donuts, score scatter plot, top risks
      FraudView.tsx         fraud charts
      AmlView.tsx           AML charts
      TransactionsTable.tsx filterable, sortable, paged table
      DetailDrawer.tsx      single-transaction panel
      charts.tsx            shared chart components
      TopRisk.tsx           compact top-risk table
      ui.tsx                cards, badges, probability bars, colours
```

## Using the app

1. Drop an `.xlsx` file on the upload box (max 50 MB) or click to browse.
2. Review the **Overview**, **Fraud**, **AML** and **Transactions** tabs.
3. Click any row to open its detail panel; press `Esc` to close it.
4. **Export CSV** downloads every row with its predictions. **New analysis** returns to the upload screen.

The file must contain all columns required by both models; see "Required columns" in the [root README](../README.md#required-columns).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing script: "dev"` | Run the command from inside `frontend/`, not the repository root. |
| Status shows **API offline** | Start the backend and check <http://localhost:8000/health>. |
| Upload fails with a 500 or proxy error | The backend is down or still loading models; check its terminal. |
| Upload fails with `Missing required columns` | Add the missing columns to the Excel file (names are case-sensitive). |
| Port 5173 already in use | Stop the other process, or run `npm run dev -- --port 5174`. |
| Very large file is slow or the tab freezes | Upload a smaller sample; all rows are returned as JSON and charted in the browser. |
| `npm install` fails behind a proxy | Configure npm with `npm config set proxy` / `https-proxy`, or use your internal registry. |
