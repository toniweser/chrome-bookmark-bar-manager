export interface BookmarkSet {
  id: string;
  name: string;
  isActive: boolean;
}

// Message types for popup ↔ background communication
export type Message =
  | { type: "GET_SETS" }
  | { type: "CREATE_SET"; name: string }
  | { type: "SWITCH_SET"; setId: string }
  | { type: "DELETE_SET"; setId: string; mergeTargetId?: string }
  | { type: "RENAME_SET"; setId: string; name: string };

export type MessageResponse =
  | { success: true; data?: BookmarkSet[] }
  | { success: false; error: string };
