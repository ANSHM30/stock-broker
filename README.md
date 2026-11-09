# Alvest brokerage dashboard

The active dashboard is a Next.js app. The FastAPI backend provides a server-side advisory proxy and a separate, in-memory paper-trading API. The dashboard is read-only: it does not display simulated orders or account balances, and no broker is connected.

The root `advisory-demo.html` is retained as a legacy design reference. `server.cjs` has been removed; the advisory proxy now lives in FastAPI.

## Requirements

- Node.js 20.9 or newer
- Python 3.10 or newer

## Configure the backend

Copy `.env.example` to `.env` in the repository root and set `APPBACKEND_URL` and `BROKER_ADVISORY_API_KEY`. The key stays on the backend and is never sent to the browser.

In PowerShell:

```powershell
cd D:\stock-broker\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend exposes `/health`, `/api/advisories`, and the separately namespaced `/api/paper/orders` and `/api/paper/portfolio` simulator endpoints. Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

Paper endpoints are not wired into the dashboard. They maintain only in-memory, per-process simulated state, reset when the backend restarts, and never send real orders. They are demonstration-only and are not suitable for production or multi-user use.

## Run the dashboard

In a second PowerShell terminal:

```powershell
cd D:\stock-broker\frontend
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The default frontend API URL is `http://127.0.0.1:8000`; override it in `frontend/.env.local` when needed. FastAPI CORS allows the two localhost origins by default. Set `FRONTEND_ORIGINS` to a comma-separated list for other frontend origins.

## Tests and production build

```powershell
cd D:\stock-broker\backend
pytest
```

```powershell
cd D:\stock-broker\frontend
npm run typecheck
npm run build
```
