import { useState } from "react";
import type { BookmarkSet } from "../../shared/types";
import { Check, Pencil, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  sets: BookmarkSet[];
  switchingId: string | null;
  onSwitch: (setId: string) => Promise<void>;
  onDelete: (set: BookmarkSet) => void;
  onRename: (setId: string, name: string) => Promise<void>;
}

export default function SetList({
  sets,
  switchingId,
  onSwitch,
  onDelete,
  onRename,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  if (sets.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-4">
        No sets yet. Create one to get started.
      </p>
    );
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

  return (
    <div className="max-h-[300px] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-sm">
      {sets.map((set) => {
        const isSwitching = switchingId === set.id;

        if (renamingId === set.id) {
          return (
            <form
              key={set.id}
              className="px-1.5 py-1"
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
                onBlur={() => submitRename(set.id)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setRenamingId(null);
                }}
                className="w-full rounded-lg border border-ring bg-secondary px-2 py-0.5 text-sm text-foreground outline-none"
              />
            </form>
          );
        }

        return (
          <div
            key={set.id}
            className={cn(
              "group relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm outline-none select-none transition-colors",
              set.isActive
                ? "text-accent-foreground font-medium"
                : "hover:bg-accent hover:text-accent-foreground cursor-pointer",
              isSwitching && "opacity-50"
            )}
            onClick={() => !set.isActive && !isSwitching && onSwitch(set.id)}
          >
            <span className="flex items-center justify-center w-4 h-4 flex-shrink-0">
              {isSwitching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : set.isActive ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : null}
            </span>

            <span className="flex-1 truncate">{set.name}</span>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  startRename(set);
                }}
                title="Rename"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(set);
                }}
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
