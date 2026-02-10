import { useState } from "react";

interface Props {
  onCreateSet: (name: string) => Promise<void>;
}

export default function CreateSetForm({ onCreateSet }: Props) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    await onCreateSet(trimmed);
    setName("");
    setCreating(false);
  };

  return (
    <form className="create-form" onSubmit={handleSubmit}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New set name"
        disabled={creating}
      />
      <button type="submit" disabled={!name.trim() || creating}>
        Create set
      </button>
    </form>
  );
}
