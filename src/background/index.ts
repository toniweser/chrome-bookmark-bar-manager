import type { Message, MessageResponse } from "../shared/types";
import {
  getSets,
  createSet,
  switchSet,
  deleteSet,
  renameSet,
  getActiveSetId,
} from "./bookmarks";
import {
  isSyncing,
  reconcileBar,
  onBarBookmarkCreated,
  onBarBookmarkRemoved,
  onBarBookmarkChanged,
  onBarBookmarkMoved,
} from "./sync";

const BOOKMARKS_BAR_ID = "1";

// --- Message handling ---

chrome.runtime.onMessage.addListener(
  (
    message: Message,
    _sender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true; // keep message channel open for async response
  }
);

async function handleMessage(message: Message): Promise<MessageResponse> {
  switch (message.type) {
    case "GET_SETS": {
      // Reconcile bar on popup open
      const activeSetId = await getActiveSetId();
      if (activeSetId) {
        await reconcileBar(activeSetId);
      }
      return { success: true, data: await getSets() };
    }
    case "CREATE_SET":
      return { success: true, data: await createSet(message.name) };
    case "SWITCH_SET":
      return { success: true, data: await switchSet(message.setId) };
    case "DELETE_SET":
      return {
        success: true,
        data: await deleteSet(message.setId, message.mergeTargetId),
      };
    case "RENAME_SET":
      return {
        success: true,
        data: await renameSet(message.setId, message.name),
      };
  }
}

// --- Bookmark event listeners: sync bar edits → active set folder ---

function isInBar(parentId: string): boolean {
  return parentId === BOOKMARKS_BAR_ID;
}

chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (isSyncing()) return;
  if (!isInBar(bookmark.parentId!)) return;

  const activeSetId = await getActiveSetId();
  if (!activeSetId) return;

  await onBarBookmarkCreated(bookmark, activeSetId);
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  if (isSyncing()) return;
  if (!isInBar(removeInfo.parentId)) return;

  await onBarBookmarkRemoved(id);
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  if (isSyncing()) return;

  // Check if this bookmark is in the bar
  try {
    const [bookmark] = await chrome.bookmarks.get(id);
    if (!isInBar(bookmark.parentId!)) return;
  } catch {
    return; // Bookmark was deleted
  }

  await onBarBookmarkChanged(id, changeInfo);
});

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  if (isSyncing()) return;
  if (!isInBar(moveInfo.parentId) && !isInBar(moveInfo.oldParentId)) return;

  const activeSetId = await getActiveSetId();
  if (!activeSetId) return;

  await onBarBookmarkMoved(id, moveInfo, activeSetId);
});

// --- Startup reconciliation ---

async function startup() {
  const activeSetId = await getActiveSetId();
  if (activeSetId) {
    await reconcileBar(activeSetId);
  }
}

startup();
