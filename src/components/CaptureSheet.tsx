import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { fromLocalInputValue, toLocalInputValue } from "../lib/format";
import { ensureNotificationPermission } from "../lib/notify";
import { CameraIcon } from "./Icons";

export function CaptureSheet({
  autoCamera,
  onClose,
}: {
  /** Jump straight to the camera (action-button / ?a=snap flow). */
  autoCamera: boolean;
  onClose: () => void;
}) {
  const { addEntry, settings } = useStore();
  const [mode, setMode] = useState<"photo" | "text">("photo");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [when, setWhen] = useState(() => toLocalInputValue(Date.now()));
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const triedAuto = useRef(false);

  useEffect(() => {
    // Best effort: browsers may require a user gesture to open the camera,
    // in which case the big button below is one tap away.
    if (autoCamera && !triedAuto.current) {
      triedAuto.current = true;
      setTimeout(() => fileRef.current?.click(), 60);
    }
  }, [autoCamera]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onPick(f: File | null) {
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
    // Snapping happens right after eating far more often than 30 min later —
    // refresh the timestamp to "now" when the photo lands.
    setWhen(toLocalInputValue(Date.now()));
  }

  const canSave =
    !saving && ((mode === "photo" && !!photo) || (mode === "text" && text.trim().length > 0));

  async function save() {
    const eatenAt = fromLocalInputValue(when) ?? Date.now();
    setSaving(true);
    try {
      await addEntry({
        photo: mode === "photo" ? (photo ?? undefined) : undefined,
        text: text.trim() || undefined,
        eatenAt,
      });
      // First save is the natural moment to ask for notification permission.
      void ensureNotificationPermission();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        <h2>Log food or drink</h2>
        <p className="screen-sub" style={{ margin: "0 0 6px" }}>
          You'll get a check-in nudge {settings.checkinDelayMin} min later.
        </p>

        <div className="seg" style={{ marginTop: 10 }}>
          <button
            className={mode === "photo" ? "active" : ""}
            onClick={() => setMode("photo")}
          >
            📷 Photo
          </button>
          <button
            className={mode === "text" ? "active" : ""}
            onClick={() => setMode("text")}
          >
            ✏️ Describe it
          </button>
        </div>

        {mode === "photo" && (
          <div className="field">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
            {preview ? (
              <img
                src={preview}
                alt="Your food"
                className="detail-photo"
                style={{ maxHeight: 220 }}
                onClick={() => fileRef.current?.click()}
              />
            ) : (
              <button
                className="btn primary block"
                style={{ padding: "18px 20px", fontSize: 16 }}
                onClick={() => fileRef.current?.click()}
              >
                <CameraIcon size={22} /> Open camera
              </button>
            )}
            {preview && (
              <div className="field-hint">Tap the photo to retake.</div>
            )}
          </div>
        )}

        <div className="field">
          <label>{mode === "photo" ? "Anything the photo doesn't show? (optional)" : "What did you have?"}</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mode === "photo"
                ? "e.g. cooked in butter, oat milk in the coffee"
                : "e.g. cappuccino with oat milk and a croissant"
            }
          />
        </div>

        <div className="field">
          <label>When did you have it?</label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
          <div className="field-hint">
            Backdate this if you're logging something from earlier.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" style={{ flex: 1 }} disabled={!canSave} onClick={save}>
            {saving ? "Saving…" : "Save & analyze"}
          </button>
        </div>
      </div>
    </div>
  );
}
