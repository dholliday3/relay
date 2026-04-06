import { useState } from "react";
import type { TicketbookConfig, DebriefStyle } from "../types";

export function SettingsDialog({
  config,
  onSave,
  onClose,
}: {
  config: TicketbookConfig;
  onSave: (patch: Partial<TicketbookConfig>) => Promise<void>;
  onClose: () => void;
}) {
  const [prefix, setPrefix] = useState(config.prefix);
  const [deleteMode, setDeleteMode] = useState(config.deleteMode);
  const [debriefStyle, setDebriefStyle] = useState<DebriefStyle>(config.debriefStyle ?? "very-concise");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ prefix, deleteMode, debriefStyle });
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaving(false);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog settings-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="dialog-title">Settings</p>
        <div className="settings-field">
          <label className="settings-label" htmlFor="settings-prefix">
            Ticket ID prefix
          </label>
          <input
            id="settings-prefix"
            className="settings-input"
            type="text"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="e.g. TKT, ART"
          />
          <span className="settings-hint">
            New tickets will be created as {prefix || "TKT"}-001, {prefix || "TKT"}-002, etc.
          </span>
        </div>
        <div className="settings-field">
          <label className="settings-label">Delete behavior</label>
          <div className="settings-toggle-group">
            <button
              className={`settings-toggle-btn ${deleteMode === "archive" ? "settings-toggle-active" : ""}`}
              onClick={() => setDeleteMode("archive")}
            >
              Archive
            </button>
            <button
              className={`settings-toggle-btn ${deleteMode === "hard" ? "settings-toggle-active" : ""}`}
              onClick={() => setDeleteMode("hard")}
            >
              Hard delete
            </button>
          </div>
          <span className="settings-hint">
            {deleteMode === "archive"
              ? "Deleted tickets are moved to an archive and can be restored."
              : "Deleted tickets are permanently removed from disk."}
          </span>
        </div>
        <div className="settings-field">
          <label className="settings-label">Agent debrief style</label>
          <div className="settings-toggle-group">
            {(["very-concise", "concise", "detailed", "lengthy"] as const).map((style) => (
              <button
                key={style}
                className={`settings-toggle-btn ${debriefStyle === style ? "settings-toggle-active" : ""}`}
                onClick={() => setDebriefStyle(style)}
              >
                {style === "very-concise" ? "Very concise" : style.charAt(0).toUpperCase() + style.slice(1)}
              </button>
            ))}
          </div>
          <span className="settings-hint">
            Controls how detailed agent debriefs are when writing to agent notes.
          </span>
        </div>
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="dialog-btn dialog-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
