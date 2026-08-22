# EcoReceipt

EcoReceipt analyzes grocery receipt photos and estimates the carbon footprint of each purchase.

## Architecture

Each item on a receipt is resolved through a fallback chain:

1. **Climatiq API** (`api_client.py`) — queried for every item so footprints reflect Climatiq's dataset rather than the local CSV.
2. **Local dataset match** (`matcher.py` + `emission_factors.csv`) — offline fuzzy matching against ~40 common grocery items; used when Climatiq can't identify the item (or `CLIMATIQ_API_KEY` isn't set), and always used to power eco-swap recommendations.
3. **Claude estimate** (`fallback.py`) — used as a last resort for anything still unmatched; degrades to a fixed average grocery factor if `ANTHROPIC_API_KEY` isn't set, so the pipeline never blocks.

Receipt photos are turned into structured line items by `ocr.py`, which uses Claude's vision model (no separate OCR engine/binary required). `engine.py`'s `CarbonEngine` orchestrates the whole pipeline, and `calculator.py` does the local dataset matching + eco-swap recommendation math.

`main.py` exposes this as a REST API (FastAPI). `app.py` is a Streamlit demo UI for local testing.

## Implemented Features

- Claude-vision OCR that turns a receipt photo directly into structured line items.
- Local, offline fuzzy matching against a seeded emission-factors dataset (`matcher.py`, `emission_factors.csv`).
- Climatiq API integration as the primary item match, with the local dataset as a fallback.
- Claude-based carbon estimate as a final fallback for unrecognized items, with a safe default when no API key is configured.
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
export CLIMATIQ_API_KEY="your_climatiq_key"     # second-tier item matching
export ANTHROPIC_API_KEY="your_anthropic_key"   # receipt OCR + last-resort estimation
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

Falls back to a sample receipt if `ANTHROPIC_API_KEY` isn't set, so the UI is demoable without live OCR.
