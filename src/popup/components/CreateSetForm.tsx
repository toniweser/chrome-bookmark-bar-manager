import { useState } from "react";
import { Plus } from "lucide-react";

interface Props {
  onCreateSet: (name: string) => Promise<void>;
  existingNames: string[];
}

export default function CreateSetForm({ onCreateSet, existingNames }: Props) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError("Please enter a name.");
      return;
    }

    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setError("A set with this name already exists.");
      return;
    }

    setError(null);
    setCreating(true);
    await onCreateSet(trimmed);
    setName("");
    setCreating(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <form className="flex gap-2" onSubmit={handleSubmit}>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="New set name"
          disabled={creating}
          className="flex-1 rounded-md border border-input bg-secondary px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50 disabled:cursor-default cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Create
        </button>
      </form>
      {error && (
        <p className="text-xs text-destructive px-1">{error}</p>
      )}
    </div>
  );
}
