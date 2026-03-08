import { useState } from "react";
import type { BookmarkSet } from "../../shared/types";
import { AlertTriangle, Merge } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="bg-card rounded-lg border border-border p-5 w-[320px] shadow-xl animate-scale-in flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-sm font-semibold">Delete "{set.name}"</h2>
          {isLastSet ? (
            <p className="text-xs text-muted-foreground pt-1">
              Your bookmarks will stay in the bookmark bar.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground pt-1">
              What should happen to the bookmarks in this set?
            </p>
          )}
        </div>

        {!isLastSet && (
          <div className="flex flex-col gap-2">
            <button
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-left transition-colors cursor-pointer",
                mode === "merge"
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50 text-muted-foreground"
              )}
              onClick={() => setMode("merge")}
            >
              <Merge className="h-4 w-4 flex-shrink-0" />
              <div className="flex-1">
                <span>Merge bookmarks into</span>
                <select
                  value={mergeTargetId}
                  onChange={(e) => {
                    setMergeTargetId(e.target.value);
                    setMode("merge");
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="ml-1.5 rounded border border-input bg-secondary px-1.5 py-0.5 text-xs text-foreground outline-none"
                >
                  {otherSets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </button>

            <button
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-left transition-colors cursor-pointer",
                mode === "delete"
                  ? "bg-destructive/15 text-destructive"
                  : "hover:bg-accent/50 text-muted-foreground"
              )}
              onClick={() => setMode("delete")}
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <div>
                <span>Delete all bookmarks</span>
                {mode === "delete" && (
                  <p className="text-xs opacity-70 mt-0.5">
                    This cannot be undone.
                  </p>
                )}
              </div>
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <button
            className="flex-1 rounded-md px-3 py-2 text-sm bg-secondary text-secondary-foreground hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer",
              mode === "delete" || isLastSet
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/80"
                : "bg-primary text-primary-foreground hover:bg-primary/80"
            )}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? "Deleting..." : mode === "merge" && !isLastSet ? "Merge & delete" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
