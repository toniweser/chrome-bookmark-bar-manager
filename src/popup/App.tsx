import { useEffect, useState } from "react";
import type { BookmarkSet, Message, MessageResponse } from "../shared/types";
import SetList from "./components/SetList";
import CreateSetForm from "./components/CreateSetForm";

function sendMessage(message: Message): Promise<MessageResponse> {
  return chrome.runtime.sendMessage(message);
}

export default function App() {
  const [sets, setSets] = useState<BookmarkSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSets = async () => {
    const response = await sendMessage({ type: "GET_SETS" });
    if (response.success && response.data) {
      setSets(response.data);
    } else if (!response.success) {
      setError(response.error);
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
      setError(response.error);
    }
  };

  const handleSwitch = async (setId: string) => {
    setError(null);
    const response = await sendMessage({ type: "SWITCH_SET", setId });
    if (response.success && response.data) {
      setSets(response.data);
    } else if (!response.success) {
      setError(response.error);
    }
  };

  const handleDelete = async (setId: string) => {
    setError(null);
    const response = await sendMessage({ type: "DELETE_SET", setId });
    if (response.success && response.data) {
      setSets(response.data);
    } else if (!response.success) {
      setError(response.error);
    }
  };

  const handleRename = async (setId: string, name: string) => {
    setError(null);
    const response = await sendMessage({ type: "RENAME_SET", setId, name });
    if (response.success && response.data) {
      setSets(response.data);
    } else if (!response.success) {
      setError(response.error);
    }
  };

  if (loading) {
    return <div className="app"><p className="loading">Loading...</p></div>;
  }

  return (
    <div className="app">
      <h1>Bookmark Sets</h1>
      {error && <p className="error">{error}</p>}
      <CreateSetForm onCreateSet={handleCreate} hasSets={sets.length > 0} />
      <SetList
        sets={sets}
        onSwitch={handleSwitch}
        onDelete={handleDelete}
        onRename={handleRename}
      />
    </div>
  );
}
