import { useState } from "react";

import type { ManualGroceryItem } from "../types";
import { validateManualItem } from "../validation";

interface ManualEntryFormProps {
  disabled: boolean;
  onSubmit: (items: ManualGroceryItem[]) => void;
}

export default function ManualEntryForm({
  disabled,
  onSubmit,
}: ManualEntryFormProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [items, setItems] = useState<ManualGroceryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  function resetDraft() {
    setName("");
    setPrice("");
    setQuantity("");
    setError(null);
  }

  function addItem() {
    const item: ManualGroceryItem = {
      id: crypto.randomUUID(),
      type: "product",
      name: name.trim(),
      priceCad: Number(price),
      quantity: Number(quantity),
    };

    const validation = validateManualItem(item);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setItems((currentItems) => [...currentItems, item]);
    resetDraft();
  }

  function removeItem(id: string) {
    setItems((currentItems) =>
      currentItems.filter((currentItem) => currentItem.id !== id),
    );
  }

  return (
    <section className="input-card" aria-labelledby="manual-heading">
      <div className="section-heading">
        <span className="step-badge">02</span>
        <div>
          <p className="eyebrow">Manual entry</p>
          <h2 id="manual-heading">Add groceries yourself</h2>
        </div>
      </div>

      <div className="manual-fields">
        <label className="field field-wide">
          <span>Product name</span>
          <input
            type="text"
            value={name}
            placeholder="e.g. Granola bars"
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Price (CAD)</span>
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={price}
            placeholder="0.00"
            disabled={disabled}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Quantity</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={quantity}
            placeholder="1"
            disabled={disabled}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="secondary-button"
        disabled={disabled}
        onClick={addItem}
      >
        Add item
        <span aria-hidden="true">+</span>
      </button>

      {items.length > 0 ? (
        <div className="manual-review">
          <div className="review-heading">
            <h3>Your groceries</h3>
            <span>{items.length} {items.length === 1 ? "item" : "items"}</span>
          </div>
          <ul className="manual-list">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    ${item.priceCad.toFixed(2)} · Qty {item.quantity}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  disabled={disabled}
                  onClick={() => removeItem(item.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="primary-button"
            disabled={disabled || items.length === 0}
            onClick={() => onSubmit(items)}
          >
            Calculate manual groceries
            <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
