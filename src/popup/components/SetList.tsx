import { useState } from "react";
import type { BookmarkSet } from "../../shared/types";

interface Props {
  sets: BookmarkSet[];
  onSwitch: (setId: string) => Promise<void>;
  onDelete: (setId: string) => Promise<void>;
  onRename: (setId: string, name: string) => Promise<void>;
}

export default function SetList({ sets, onSwitch, onDelete, onRename }: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (sets.length === 0) {
    return <p className="empty">No sets yet. Save your current bookmark bar as a set to get started.</p>;
  }

  const startRename = (set: BookmarkSet) => {
    setRenamingId(set.id);
    setRenameValue(set.name);
  };

  const submitRename = async (setId: string) => {
    if (renameValue.trim()) {
      await onRename(setId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const handleDelete = async (setId: string) => {
    await onDelete(setId);
    setConfirmDeleteId(null);
  };

  return (
    <ul className="set-list">
      {sets.map((set) => (
        <li
          key={set.id}
          className={`set-item ${set.isActive ? "active" : ""}`}
        >
          {renamingId === set.id ? (
            <form
              className="rename-form"
              onSubmit={(e) => {
                e.preventDefault();
                submitRename(set.id);
              }}
            >
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                onBlur={() => setRenamingId(null)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRenamingId(null);
                }}
              />
            </form>
          ) : (
            <>
              <button
                className="set-name"
                onClick={() => !set.isActive && onSwitch(set.id)}
                title={set.isActive ? "Currently active" : `Switch to "${set.name}"`}
              >
                <span className="set-label">
                  {set.isActive && <span className="active-dot" />}
                  {set.name}
                </span>
              </button>
              <div className="set-actions">
                <button
                  className="btn-icon"
                  onClick={() => startRename(set)}
                  title="Rename"
                >
                  ✏
                </button>
                {confirmDeleteId === set.id ? (
                  <span className="confirm-delete">
                    <button
                      className="btn-confirm"
                      onClick={() => handleDelete(set.id)}
                    >
                      Yes
                    </button>
                    <button
                      className="btn-cancel"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    className="btn-icon btn-delete"
                    onClick={() => setConfirmDeleteId(set.id)}
                    title="Delete"
                  >
                    ✕
                  </button>
                )}
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
