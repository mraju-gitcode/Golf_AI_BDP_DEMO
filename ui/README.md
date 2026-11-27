# GolfPM Assist UI

Rain Bird-themed React UI for the GolfPM email agent demo, designed in Google AI Studio.
It calls the FastAPI backend in the repo root; no mock data.

```bash
npm install
npm run build        # outputs ui/dist, which the backend serves at http://localhost:8000
npm run dev          # hot-reload UI on http://localhost:3000, proxies /api to :8000
```
