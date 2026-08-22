import { useEffect, useRef, useState } from "react";

interface CameraCaptureProps {
  open: boolean;
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function CameraCapture({
  open,
  onCapture,
  onClose,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Couldn't access the camera. Check permissions and try again.",
          );
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  function handleCapture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      onCapture(new File([blob], `receipt-${Date.now()}.jpg`, {
        type: "image/jpeg",
      }));
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="dialog-backdrop" onKeyDown={(event) => {
      if (event.key === "Escape") onClose();
    }}>
      <div
        className="camera-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Take a photo of a receipt or grocery item"
      >
        {error ? (
          <p className="field-error" role="alert">{error}</p>
        ) : (
          <video
            className="camera-preview"
            ref={videoRef}
            autoPlay
            playsInline
            muted
          />
        )}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          {!error && (
            <button
              type="button"
              className="primary-button"
              style={{ margin: 0, width: "auto" }}
              onClick={handleCapture}
            >
              Capture
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
