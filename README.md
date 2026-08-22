# EcoReceipt

EcoReceipt analyzes grocery receipt photos and estimates the carbon footprint of each purchase.

The project supports Python 3.9 and newer.

## Architecture

1. `ocr.py` uses Gemini vision to turn a receipt photo into structured line items.
2. `matcher.py` and `emission_factors.csv` match known grocery items locally.
3. `api_client.py` queries Climatiq for items the local dataset does not recognize.
4. `engine.py` aggregates totals, categories, equivalencies, and line-item audit data.

There is no fabricated fallback estimate. Items that cannot be matched locally or through Climatiq remain `UNMATCHED`, and API/request problems are reported as `API_FAILED`.

`main.py` exposes the pipeline as a REST API. `app.py` provides a Streamlit demo UI.

## Implemented Features

- Gemini-vision OCR for receipt photos.
- Local fuzzy matching against a seeded emission-factors dataset.
- Climatiq search and estimate requests with explicit activity IDs and data versions.
- Unit-aware Climatiq parameters for Weight and Money factors.
- Receipt price support for Money factors through `price` or `price_usd`.
- Structured success, unmatched-item, and API-failure responses.
- Receipt-level carbon totals, category totals, and per-item breakdowns.
- Car-mile and one-year tree equivalencies.
- Eco-swap recommendations when local factor rows include swap IDs.
- FastAPI endpoints for image uploads and pre-parsed items.
- Streamlit interface with receipt upload and summary visualization.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Set the API keys required by the features you use:

```bash
export CLIMATIQ_API_KEY="your_climatiq_key"
export GEMINI_API_KEY="your_gemini_key"
```

## Run the Backend API

```bash
uvicorn main:app --reload
```

- `GET /health` - liveness check.
- `POST /api/receipts/scan` - multipart image upload (`file`).
- `POST /api/receipts/analyze` - JSON body `{"items": [{"raw_item": "...", "qty": 1}]}`.

## Run the Streamlit Demo

```bash
streamlit run app.py
```

The Streamlit app opens at `http://localhost:8501` unless that port is already in use. A valid `GEMINI_API_KEY` is required to scan an uploaded receipt. A valid `CLIMATIQ_API_KEY` is required for API estimates.

## Test the Backend

The unit tests mock external API responses:

```bash
python -m unittest -v test_backend_tests.py
```

To test a live Climatiq key without storing it in source code or chat:

```bash
read -r -s -p "Climatiq API key: " CLIMATIQ_API_KEY
echo
export CLIMATIQ_API_KEY
python - <<'PY'
import os
from api_client import ClimatiqAPIClient

result = ClimatiqAPIClient(os.environ["CLIMATIQ_API_KEY"]).fetch_item_footprint("bread")
print(result)
PY
unset CLIMATIQ_API_KEY
```
