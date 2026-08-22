# EcoReceipt

EcoReceipt analyzes grocery receipt items and estimates their carbon footprint.

## Implemented Features

- Climatiq API integration that searches emission factors and requests CO2e estimates.
- Quantity-aware handling for weight-based and money-based Climatiq factors.
- Structured success, unmatched-item, and API-failure responses.
- Receipt-level carbon calculations with total footprint and per-item breakdowns.
- Local fuzzy matching and emission-factor calculations through `calculator.py`.
- Eco-swap recommendations ranked by potential carbon savings.
- Streamlit interface with receipt image upload, summary metrics, a receipt breakdown table, and a footprint-by-category chart.
- Environment-based API authentication through `CLIMATIQ_API_KEY`.

## Run the Streamlit App

Install the runtime dependencies and set your Climatiq API key:

```bash
export CLIMATIQ_API_KEY="your_api_key"
streamlit run app.py
```

The current interface uses sample OCR output after an image is uploaded. OCR integration is the next step.
