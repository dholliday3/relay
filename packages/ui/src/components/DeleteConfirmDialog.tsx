import type { TicketbookConfig } from "../types";

export function DeleteConfirmDialog({
  itemTitle,
  itemType,
  config,
  onConfirm,
  onCancel,
}: {
  itemTitle: string;
  itemType: "ticket" | "plan";
  config: TicketbookConfig;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <p className="dialog-title">
          {config.deleteMode === "archive" ? "Archive" : "Delete"} {itemType}?
        </p>
        <p className="dialog-message">
          {config.deleteMode === "archive"
            ? `"${itemTitle}" will be moved to the archive and can be restored later.`
            : `"${itemTitle}" will be permanently deleted. This cannot be undone.`}
        </p>
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`dialog-btn ${config.deleteMode === "hard" ? "dialog-btn-danger" : "dialog-btn-primary"}`}
            onClick={onConfirm}
          >
            {config.deleteMode === "archive" ? "Archive" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
