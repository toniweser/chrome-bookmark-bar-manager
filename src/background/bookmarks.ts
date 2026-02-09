import type { BookmarkSet } from "../shared/types";

const ROOT_FOLDER_NAME = "_BookmarkBarSets";
const BOOKMARKS_BAR_ID = "1";
const OTHER_BOOKMARKS_ID = "2";

async function ensureRootFolder(): Promise<chrome.bookmarks.BookmarkTreeNode> {
  const otherChildren = await chrome.bookmarks.getChildren(OTHER_BOOKMARKS_ID);
  const existing = otherChildren.find((n) => n.title === ROOT_FOLDER_NAME);
  if (existing) return existing;
  return chrome.bookmarks.create({
    parentId: OTHER_BOOKMARKS_ID,
    title: ROOT_FOLDER_NAME,
  });
}

async function getActiveSetId(): Promise<string | null> {
  const result = await chrome.storage.local.get("activeSetId");
  return result.activeSetId ?? null;
}

async function setActiveSetId(id: string | null): Promise<void> {
  if (id === null) {
    await chrome.storage.local.remove("activeSetId");
  } else {
    await chrome.storage.local.set({ activeSetId: id });
  }
}

export async function getSets(): Promise<BookmarkSet[]> {
  const root = await ensureRootFolder();
  const children = await chrome.bookmarks.getChildren(root.id);
  let activeSetId = await getActiveSetId();

  // Recovery: if activeSetId is set but doesn't match any folder, find the empty one
  if (activeSetId && !children.some((c) => c.id === activeSetId)) {
    activeSetId = null;
    await setActiveSetId(null);
  }

  // If no activeSetId, try to recover by finding the empty set folder
  if (!activeSetId && children.length > 0) {
    for (const child of children) {
      const contents = await chrome.bookmarks.getChildren(child.id);
      if (contents.length === 0) {
        activeSetId = child.id;
        await setActiveSetId(child.id);
        break;
      }
    }
  }

  return children
    .filter((c) => !c.url) // only folders
    .map((c) => ({
      id: c.id,
      name: c.title,
      isActive: c.id === activeSetId,
    }));
}

export async function createSet(name: string): Promise<BookmarkSet[]> {
  const root = await ensureRootFolder();
  const barChildren = await chrome.bookmarks.getChildren(BOOKMARKS_BAR_ID);
  const activeSetId = await getActiveSetId();

  // If there's already an active set, save current bar back to it first
  if (activeSetId) {
    await moveChildren(BOOKMARKS_BAR_ID, activeSetId);
  }

  // Create the new set folder
  const newFolder = await chrome.bookmarks.create({
    parentId: root.id,
    title: name,
  });

  // Move current bar contents (which we may have just cleared) into new set
  // Actually, we want to save the original bar contents as the new set.
  // If we had an active set, we moved bar→activeSet above, so bar is empty now.
  // We need a different approach: move from the old active set to the new one.
  if (activeSetId) {
    // The bar contents are now in the old active set. Move them to the new set.
    await moveChildren(activeSetId, newFolder.id);
  } else {
    // No previous active set — move current bar contents to new set
    // Re-fetch bar children since they haven't been moved
    const currentBar = await chrome.bookmarks.getChildren(BOOKMARKS_BAR_ID);
    for (const child of currentBar) {
      await chrome.bookmarks.move(child.id, { parentId: newFolder.id });
    }
  }

  // Move new set's contents into bar (making it active)
  await moveChildren(newFolder.id, BOOKMARKS_BAR_ID);
  await setActiveSetId(newFolder.id);

  return getSets();
}

export async function switchSet(targetId: string): Promise<BookmarkSet[]> {
  const activeSetId = await getActiveSetId();
  if (activeSetId === targetId) return getSets();

  // Move current bar contents into active set's folder
  if (activeSetId) {
    await moveChildren(BOOKMARKS_BAR_ID, activeSetId);
  }

  // Move target set's contents into bar
  await moveChildren(targetId, BOOKMARKS_BAR_ID);
  await setActiveSetId(targetId);

  return getSets();
}

export async function deleteSet(setId: string): Promise<BookmarkSet[]> {
  const activeSetId = await getActiveSetId();

  if (setId === activeSetId) {
    // Active set: its contents are in the bar, just remove the empty folder
    await chrome.bookmarks.removeTree(setId);
    await setActiveSetId(null);
  } else {
    // Inactive set: remove the folder and its contents
    await chrome.bookmarks.removeTree(setId);
  }

  return getSets();
}

export async function renameSet(
  setId: string,
  name: string
): Promise<BookmarkSet[]> {
  await chrome.bookmarks.update(setId, { title: name });
  return getSets();
}

async function moveChildren(
  fromId: string,
  toId: string
): Promise<void> {
  const children = await chrome.bookmarks.getChildren(fromId);
  for (const child of children) {
    await chrome.bookmarks.move(child.id, { parentId: toId });
  }
}
