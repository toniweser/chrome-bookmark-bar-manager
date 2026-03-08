import { useEffect, useState } from "react";
import type { BookmarkSet, Message, MessageResponse } from "../shared/types";
import SetList from "./components/SetList";
import CreateSetForm from "./components/CreateSetForm";
import DeleteSetDialog from "./components/DeleteSetDialog";

function sendMessage(message: Message): Promise<MessageResponse> {
  return chrome.runtime.sendMessage(message);
}

export default function App() {
  const [sets, setSets] = useState<BookmarkSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingSet, setDeletingSet] = useState<BookmarkSet | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const refreshSets = async () => {
    const response = await sendMessage({ type: "GET_SETS" });
    if (response.success && response.data) {
      setSets(response.data);
    } else if (!response.success) {
      setError(response.error ?? "Unknown error");
    }
  };

  useEffect(() => {
    refreshSets().finally(() => setLoading(false));
  }, []);

  const handleCreate = async (name: string) => {
    setError(null);
    const response = await sendMessage({ type: "CREATE_SET", name });
    if (response.success && response.data) {
      setSets(response.data);
    } else if (!response.success) {
      setError(response.error ?? "Unknown error");
    }
  };

  const handleSwitch = async (setId: string) => {
    setError(null);
    setSwitchingId(setId);
    const response = await sendMessage({ type: "SWITCH_SET", setId });
    if (response.success && response.data) {
      setSets(response.data);
    } else if (!response.success) {
      setError(response.error ?? "Unknown error");
    }
    setSwitchingId(null);
  };

  const handleDeleteRequest = (set: BookmarkSet) => {
    setDeletingSet(set);
  };

  const handleDeleteConfirm = async (setId: string) => {
    setError(null);
    const response = await sendMessage({ type: "DELETE_SET", setId });
    if (response.success && response.data) {
      setSets(response.data);
    } else if (!response.success) {
      setError(response.error ?? "Unknown error");
    }
    setDeletingSet(null);
  };

  const handleMergeConfirm = async (setId: string, mergeTargetId: string) => {
    setError(null);
    const response = await sendMessage({
      type: "DELETE_SET",
      setId,
      mergeTargetId,
    });
    if (response.success && response.data) {
      setSets(response.data);
    } else if (!response.success) {
      setError(response.error ?? "Unknown error");
    }
    setDeletingSet(null);
  };

  const handleRename = async (setId: string, name: string) => {
    setError(null);
    const response = await sendMessage({ type: "RENAME_SET", setId, name });
    if (response.success && response.data) {
      setSets(response.data);
    } else if (!response.success) {
      setError(response.error ?? "Unknown error");
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground text-center py-5 text-sm">
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-3">

      <div className="flex items-center gap-2 pb-3">
        <img src="./icons/icon48.png" alt="" className="h-5 w-5" />
        <h1 className="text-base font-semibold">Bookmark Bar Manager</h1>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <CreateSetForm onCreateSet={handleCreate} existingNames={sets.map((s) => s.name)} />

      <SetList
        sets={sets}
        switchingId={switchingId}
        onSwitch={handleSwitch}
        onDelete={handleDeleteRequest}
        onRename={handleRename}
      />

      {deletingSet && (
        <DeleteSetDialog
          set={deletingSet}
          otherSets={sets.filter((s) => s.id !== deletingSet.id)}
          onMerge={handleMergeConfirm}
          onDelete={handleDeleteConfirm}
          onCancel={() => setDeletingSet(null)}
        />
      )}
    </div>
  );
}
