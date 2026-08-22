# EcoReceipt

EcoReceipt analyzes grocery receipt photos and estimates the carbon footprint of each purchase.

## Architecture

Each item on a receipt is resolved through a fallback chain, cheapest/most-reliable first:

1. **Local dataset match** (`matcher.py` + `emission_factors.csv`) — offline fuzzy matching against ~40 common grocery items, free and instant.
2. **Climatiq API** (`api_client.py`) — queried for items the local dataset doesn't recognize.
3. **Gemini estimate** (`fallback.py`) — used as a last resort for anything still unmatched; degrades to a fixed average grocery factor if `GEMINI_API_KEY` isn't set, so the pipeline never blocks.

Receipt photos are turned into structured line items by `ocr.py`, which uses Gemini's vision model (no separate OCR engine/binary required). `engine.py`'s `CarbonEngine` orchestrates the whole pipeline, and `calculator.py` does the local dataset matching + eco-swap recommendation math.

`main.py` exposes this as a REST API (FastAPI). `app.py` is a Streamlit demo UI for local testing.

## Implemented Features

- Gemini-vision OCR that turns a receipt photo directly into structured line items.
- Local, offline fuzzy matching against a seeded emission-factors dataset (`matcher.py`, `emission_factors.csv`).
- Climatiq API integration as a second-tier match for items missing from the local dataset.
- Gemini-based carbon estimate as a final fallback for unrecognized items, with a safe default when no API key is configured.
- Receipt-level carbon calculations with total footprint, per-item breakdown, and confidence scores.
- Eco-swap recommendations ranked by potential carbon savings.
- FastAPI backend (`main.py`) with `/api/receipts/scan` (image upload) and `/api/receipts/analyze` (pre-parsed items) endpoints, CORS-enabled for a separate frontend/mobile client.
- Streamlit interface (`app.py`) with receipt image upload, summary metrics, a receipt breakdown table, and a footprint-by-category chart.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Environment variables (both optional — the pipeline degrades gracefully without them):

```bash
export CLIMATIQ_API_KEY="your_climatiq_key"   # second-tier item matching
export GEMINI_API_KEY="your_gemini_key"       # receipt OCR + last-resort estimation
```

## Run the Backend API

```bash
uvicorn main:app --reload
```

- `GET /health` — liveness check.
- `POST /api/receipts/scan` — multipart image upload (`file`), runs OCR + full carbon analysis.
- `POST /api/receipts/analyze` — JSON body `{"items": [{"raw_item": "...", "qty": 1}]}`, skips OCR.

## Run the Streamlit Demo

```bash
streamlit run app.py
```

Falls back to a sample receipt if `GEMINI_API_KEY` isn't set, so the UI is demoable without live OCR.

## Run the Frontend

Install frontend dependencies:

```bash
npm install
```

Mock mode is the default and does not require the backend:

```bash
npm run dev
```

For live mode, start FastAPI in one terminal:

```bash
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

Then start Vite in another terminal with the live API settings:

```bash
VITE_API_MODE=live VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

Manual grocery calculations work without external API keys for locally matched items. Receipt photo scanning requires `GEMINI_API_KEY`; without it, the API returns a service-unavailable error that the frontend displays without substituting mock data.

## Frontend History and Progress

The frontend includes one-time welcome onboarding, saved-trip History,
read-only Trip Details, and six-month Progress & Insights.

- Successful receipt calculations save automatically.
- Manual results enter History only after **Save to history** is selected.
- Saved trips currently remain in the same browser through `localStorage`.
- Clearing site data removes local History and Progress data.

Pages access saved trips through the asynchronous `TripRepository` contract.
When backend history endpoints are available, an HTTP repository can replace
the local adapter without rewriting the pages or progress calculations.
