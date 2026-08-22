import csv
import difflib
import re
from typing import Optional

# Receipt strings are full of size/quantity/unit noise ("1LB", "12OZ", "2PK")
# that hurts fuzzy matching against clean item names, so it gets stripped
# before comparison.
_NOISE_PATTERN = re.compile(
    r"\b\d+(\.\d+)?\s?(LB|LBS|OZ|CT|PK|PACK|KG|G|ML|L|GAL|QT|EA)\b"
)
_NON_ALPHA_PATTERN = re.compile(r"[^A-Z\s]")
_WHITESPACE_PATTERN = re.compile(r"\s+")

# Receipt-scanning OCR occasionally extracts non-merchandise lines (totals,
# tax, payment method, transaction metadata) as if they were purchased
# items despite being told not to. A line counts as boilerplate only when
# EVERY one of its words is in this set, never on a single shared word, so
# a real product that happens to contain one of these words (e.g. "Total
# Cereal", "Balance Bar") is never mistaken for one.
_BOILERPLATE_WORDS = {
    "SUBTOTAL", "SUB", "TOTAL", "TOTALS", "TAX", "TAXES", "HST", "GST", "PST", "QST", "VAT",
    "DEBIT", "CREDIT", "CASH", "CHANGE", "TENDER", "TENDERED", "BALANCE", "DUE", "AMOUNT",
    "VISA", "MASTERCARD", "AMEX", "DISCOVER", "INTERAC", "CARD", "NUMBER", "TYPE", "PURCHASE",
    "ACCT", "ACCOUNT", "REFERENCE", "REF", "INVOICE", "AUTH", "AUTHOR", "AUTHORIZATION",
    "APPROVAL", "APPROVED", "TRANSACTION", "RECORD", "DATE", "TIME", "THANK", "YOU",
    "CUSTOMER", "MERCHANT", "COPY", "SIGNATURE", "TERMINAL", "ID", "NO", "REGISTER", "CASHIER",
}


def is_boilerplate_line(raw_item: str) -> bool:
    """True when raw_item is receipt metadata (subtotal/tax/total/payment/
    transaction info) rather than a purchased product, based on every
    normalized word being a known boilerplate term."""
    words = ReceiptMatcher.normalize(raw_item).split()
    return bool(words) and all(word in _BOILERPLATE_WORDS for word in words)


class ReceiptMatcher:
    """Fuzzy-matches raw OCR/receipt item strings against a local CSV of
    known emission factors, entirely offline (no external API calls)."""

    def __init__(self, csv_path: str, match_threshold: float = 0.55):
        self.match_threshold = match_threshold
        self.items = self._load(csv_path)

    def _load(self, csv_path: str) -> list:
        items = []
        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                items.append(
                    {
                        "id": row["id"],
                        "item_name": row["item_name"],
                        "category": row["category"],
                        "co2e_per_kg": float(row["co2e_per_kg"]),
                        "default_unit_weight_kg": float(row["default_unit_weight_kg"]),
                        "eco_swap_id": row.get("eco_swap_id") or None,
                        "keywords": [
                            k.strip().upper()
                            for k in row.get("keywords", "").split(";")
                            if k.strip()
                        ],
                    }
                )
        return items

    @staticmethod
    def normalize(raw_item: str) -> str:
        text = raw_item.upper()
        text = _NOISE_PATTERN.sub(" ", text)
        text = _NON_ALPHA_PATTERN.sub(" ", text)
        text = _WHITESPACE_PATTERN.sub(" ", text).strip()
        return text

    # Below this raw character-similarity ratio, a match is only trusted if
    # it's also backed by whole-word evidence (see _score). Short, generic
    # strings like "PAPER TOWELS" and "POTATOES" can otherwise share enough
    # letters to clear match_threshold on character overlap alone despite
    # being unrelated products.
    _STRONG_RATIO_THRESHOLD = 0.75

    def _score(self, normalized: str, candidate: str) -> tuple:
        ratio = difflib.SequenceMatcher(None, normalized, candidate).ratio()

        # Word-overlap F1 rewards abbreviations ("CHKN BRST" vs. "CHICKEN
        # BREAST") that SequenceMatcher alone underscores, while an F1 (not
        # plain containment) keeps a single generic shared word like "MILK"
        # from outscoring a more specific multi-word candidate.
        has_word_overlap = False
        candidate_words = candidate.split()
        text_words = normalized.split()
        if candidate_words and text_words:
            text_word_set = set(text_words)
            overlap = sum(1 for w in candidate_words if w in text_word_set)
            if overlap:
                has_word_overlap = True
                recall = overlap / len(candidate_words)
                precision = overlap / len(text_word_set)
                f1 = 2 * precision * recall / (precision + recall)
                ratio = max(ratio, f1)

        return ratio, has_word_overlap

    def match_item(self, raw_item: str) -> dict:
        normalized = self.normalize(raw_item)
        best_score = 0.0
        best: Optional[dict] = None
        best_has_word_overlap = False

        for item in self.items:
            candidates = [item["item_name"].upper()] + item["keywords"]
            item_score, item_has_word_overlap = max(
                (self._score(normalized, c) for c in candidates),
                key=lambda pair: pair[0],
            )
            if item_score > best_score:
                best_score = item_score
                best = item
                best_has_word_overlap = item_has_word_overlap

        confidence = round(best_score, 2)

        # Accept only if there's real token/keyword evidence behind the
        # match, or the raw similarity is strong enough to stand on its own
        # (e.g. a typo/pluralization of an otherwise unmatched word).
        is_reliable_match = best_has_word_overlap or best_score >= self._STRONG_RATIO_THRESHOLD

        if best is None or best_score < self.match_threshold or not is_reliable_match:
            return {
                "status": "UNMATCHED",
                "matched_item": None,
                "category": "Uncategorized",
                "co2e_per_kg": 0.0,
                "default_unit_weight_kg": 0.0,
                "eco_swap_id": None,
                "confidence_score": confidence,
                "id": None,
            }

        return {
            "status": "MATCHED",
            "matched_item": best["item_name"],
            "category": best["category"],
            "co2e_per_kg": best["co2e_per_kg"],
            "default_unit_weight_kg": best["default_unit_weight_kg"],
            "eco_swap_id": best["eco_swap_id"],
            "confidence_score": confidence,
            "id": best["id"],
        }


# --- Example Usage ---
if __name__ == "__main__":
    matcher = ReceiptMatcher("emission_factors.csv")
    for sample in [
        "BNDL GROUND BEEF 1LB",
        "OATLY BARISTA OAT MILK",
        "UNKNOWN DRAGONFRUIT SNACK",
        # Negative cases: unrelated products that share enough letters to
        # inflate character-similarity ratio but have no real word/keyword
        # overlap, and must stay UNMATCHED.
        "PAPER TOWELS",
        "DISH SOAP",
    ]:
        print(sample, "->", matcher.match_item(sample))
