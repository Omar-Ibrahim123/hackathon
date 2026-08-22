import { useState } from "react";

import { validateReceiptFile } from "../validation";
import CameraCapture from "./CameraCapture";

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
  const [cameraOpen, setCameraOpen] = useState(false);

  function applyFile(nextFile: File | null) {
    setFile(nextFile);
    setError(null);

    if (nextFile) {
      const result = validateReceiptFile(nextFile);
      if (!result.ok) setError(result.message);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    applyFile(event.target.files?.[0] ?? null);
  }

  function handleCameraCapture(capturedFile: File) {
    applyFile(capturedFile);
    setCameraOpen(false);
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
          <p className="eyebrow">Image scan</p>
          <h2>Upload a receipt or grocery item</h2>
        </div>
      </div>

      <button
        type="button"
        className="camera-button"
        disabled={disabled}
        onClick={() => setCameraOpen(true)}
      >
        <span className="camera-icon" aria-hidden="true">📷</span>
        Take a photo of a receipt or grocery item
      </button>

      <CameraCapture
        open={cameraOpen}
        onCapture={handleCameraCapture}
        onClose={() => setCameraOpen(false)}
      />

      <div className="upload-divider">or</div>

      <label className="upload-zone">
        <span className="upload-icon" aria-hidden="true">↥</span>
        <span className="upload-title">
          {file ? file.name : "Choose an image from your device"}
        </span>
        <span className="upload-hint">
          Keep the full receipt or grocery item visible · JPG, PNG or WebP · 10 MB max
        </span>
        <input
          aria-label="Receipt or grocery item image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onChange={handleFileChange}
        />
      </label>

      {error && <p className="field-error" role="alert">{error}</p>}

      {validFile && (
        <button className="primary-button" type="submit" disabled={disabled}>
          Calculate footprint
          <span aria-hidden="true">→</span>
        </button>
      )}
    </form>
  );
}
