import { useState } from "react";

import type { ManualGroceryItem } from "../types";
import { validateManualItem } from "../validation";

interface ManualEntryFormProps {
  disabled: boolean;
  onSubmit: (items: ManualGroceryItem[]) => void;
}
type ItemType = ManualGroceryItem["type"];

const CATEGORIES = [
  "Meat and seafood",
  "Dairy and eggs",
  "Pantry and grains",
  "Snacks and sweets",
  "Beverages",
  "Frozen and prepared",
  "Other",
] as const;

export default function ManualEntryForm({
  disabled,
  onSubmit,
}: ManualEntryFormProps) {
  const [itemType, setItemType] = useState<ItemType>("packaged");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [items, setItems] = useState<ManualGroceryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  function resetDraft() {
    setName("");
    setCategory("");
    setPrice("");
    setQuantity("");
    setError(null);
  }

  function changeItemType(nextType: ItemType) {
    setItemType(nextType);
    resetDraft();
  }

  function addItem() {
    const id = crypto.randomUUID();
    const item: ManualGroceryItem =
      itemType === "packaged"
        ? {
            id,
            type: "packaged",
            name: name.trim(),
            category,
            priceCad: Number(price),
            quantity: Number(quantity),
          }
        : {
            id,
            type: "produce",
            name: name.trim(),
            priceCad: Number(price),
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

      <fieldset className="type-picker" disabled={disabled}>
        <legend>Grocery type</legend>
        <label className={itemType === "packaged" ? "type-option selected" : "type-option"}>
          <input
            type="radio"
            name="grocery-type"
            value="packaged"
            checked={itemType === "packaged"}
            onChange={() => changeItemType("packaged")}
          />
          Packaged product
        </label>
        <label className={itemType === "produce" ? "type-option selected" : "type-option"}>
          <input
            type="radio"
            name="grocery-type"
            value="produce"
            checked={itemType === "produce"}
            onChange={() => changeItemType("produce")}
          />
          Produce
        </label>
      </fieldset>

      <div className="manual-fields">
        <label className="field field-wide">
          <span>{itemType === "packaged" ? "Product name" : "Produce name"}</span>
          <input
            type="text"
            value={name}
            placeholder={itemType === "packaged" ? "e.g. Granola bars" : "e.g. Apples"}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        {itemType === "packaged" ? (
          <label className="field field-wide">
            <span>Grocery category</span>
            <select
              value={category}
              disabled={disabled}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Choose a category</option>
              {CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}

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

        {itemType === "packaged" ? (
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
        ) : null}
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
                    ${item.priceCad.toFixed(2)}
                    {item.type === "packaged" ? ` · Qty ${item.quantity}` : ""}
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
