import { useState } from "react";

import { validateReceiptFile } from "../validation";

interface ReceiptInputProps {
  disabled: boolean;
  onSubmit: (file: File) => void;
}

export default function ReceiptInput({
  disabled,
  onSubmit,
}: ReceiptInputProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setError(null);

    if (nextFile) {
      const result = validateReceiptFile(nextFile);
      if (!result.ok) setError(result.message);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;

    const result = validateReceiptFile(file);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSubmit(file);
  }

  const validFile = file ? validateReceiptFile(file).ok : false;

  return (
    <form className="input-card" onSubmit={handleSubmit}>
      <div className="section-heading">
        <span className="step-badge">01</span>
        <div>
          <p className="eyebrow">Receipt scan</p>
          <h2>Upload your grocery receipt</h2>
        </div>
      </div>

      <label className="upload-zone">
        <span className="upload-icon" aria-hidden="true">↥</span>
        <span className="upload-title">
          {file ? file.name : "Take a photo or choose an image"}
        </span>
        <span className="upload-hint">
          Keep the full receipt visible · JPG, PNG or WebP · 10 MB max
        </span>
        <input
          aria-label="Receipt image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={disabled}
          onChange={handleFileChange}
        />
      </label>

      {error && <p className="field-error" role="alert">{error}</p>}

      {validFile && (
        <button className="primary-button" type="submit" disabled={disabled}>
          Calculate receipt
          <span aria-hidden="true">→</span>
        </button>
      )}
    </form>
  );
}
