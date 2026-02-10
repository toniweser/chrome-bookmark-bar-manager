import { useState } from "react";
import type { BookmarkSet } from "../../shared/types";

interface Props {
  set: BookmarkSet;
  otherSets: BookmarkSet[];
  onMerge: (setId: string, targetId: string) => Promise<void>;
  onDelete: (setId: string) => Promise<void>;
  onCancel: () => void;
}

export default function DeleteSetDialog({
  set,
  otherSets,
  onMerge,
  onDelete,
  onCancel,
}: Props) {
  const isLastSet = otherSets.length === 0;
  const [mode, setMode] = useState<"merge" | "delete">(
    otherSets.length > 0 ? "merge" : "delete"
  );
  const [mergeTargetId, setMergeTargetId] = useState(
    otherSets.length > 0 ? otherSets[0].id : ""
  );
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    if (isLastSet) {
      await onDelete(set.id);
    } else if (mode === "merge") {
      await onMerge(set.id, mergeTargetId);
    } else {
      await onDelete(set.id);
    }
    setBusy(false);
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Delete "{set.name}"</h2>

        {isLastSet ? (
          <p className="dialog-text">
            Your bookmarks will stay in the bookmark bar.
          </p>
        ) : (
          <div className="dialog-options">
            {otherSets.length > 0 && (
              <label className="dialog-option">
                <input
                  type="radio"
                  name="deleteMode"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                />
                <span>
                  Merge bookmarks into{" "}
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    onClick={() => setMode("merge")}
                  >
                    {otherSets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            )}
            <label className="dialog-option">
              <input
                type="radio"
                name="deleteMode"
                checked={mode === "delete"}
                onChange={() => setMode("delete")}
              />
              <span>Delete all bookmarks</span>
            </label>
            {mode === "delete" && (
              <p className="dialog-warning">This cannot be undone.</p>
            )}
          </div>
        )}

        <div className="dialog-actions">
          <button
            className="btn-dialog-cancel"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="btn-dialog-confirm"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? "Deleting..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
