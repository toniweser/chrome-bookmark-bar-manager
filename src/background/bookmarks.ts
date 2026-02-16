import type { BookmarkSet } from "../shared/types";
import {
  clearBar,
  populateBarFromFolder,
  syncBarToFolder,
  reconcileBar,
  migrateIfNeeded,
} from "./sync";

const ROOT_FOLDER_NAME = "_BookmarkBarSets";
const OTHER_BOOKMARKS_ID = "2";
const INITIAL_SET_NAME = "Your current bookmark bar";

async function ensureRootFolder(): Promise<chrome.bookmarks.BookmarkTreeNode> {
  const otherChildren = await chrome.bookmarks.getChildren(OTHER_BOOKMARKS_ID);
  const existing = otherChildren.find((n) => n.title === ROOT_FOLDER_NAME);
  if (existing) return existing;
  return chrome.bookmarks.create({
    parentId: OTHER_BOOKMARKS_ID,
    title: ROOT_FOLDER_NAME,
  });
}

export async function getActiveSetId(): Promise<string | null> {
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

  // First-time initialization: auto-create initial set from current bar
  if (children.filter((c) => !c.url).length === 0) {
    const folder = await chrome.bookmarks.create({
      parentId: root.id,
      title: INITIAL_SET_NAME,
    });
    await setActiveSetId(folder.id);
    // Migration: copy current bar contents into the new folder
    await migrateIfNeeded(folder.id);
    return [{ id: folder.id, name: folder.title, isActive: true }];
  }

  // Recovery: if activeSetId doesn't match any folder, clear it
  if (activeSetId && !children.some((c) => c.id === activeSetId)) {
    activeSetId = null;
    await setActiveSetId(null);
  }

  // If no activeSetId, pick the first folder
  if (!activeSetId && children.length > 0) {
    const firstFolder = children.find((c) => !c.url);
    if (firstFolder) {
      activeSetId = firstFolder.id;
      await setActiveSetId(firstFolder.id);
      // Migrate and populate bar from this folder
      await migrateIfNeeded(firstFolder.id);
      await populateBarFromFolder(firstFolder.id);
    }
  }

  // Run migration for active set if needed (old format → new format)
  if (activeSetId) {
    await migrateIfNeeded(activeSetId);
  }

  return children
    .filter((c) => !c.url)
    .map((c) => ({
      id: c.id,
      name: c.title,
      isActive: c.id === activeSetId,
    }));
}

export async function createSet(name: string): Promise<BookmarkSet[]> {
  const root = await ensureRootFolder();
  await chrome.bookmarks.create({
    parentId: root.id,
    title: name,
  });
  return getSets();
}

export async function switchSet(targetId: string): Promise<BookmarkSet[]> {
  const activeSetId = await getActiveSetId();
  if (activeSetId === targetId) return getSets();

  // 1. Sync any bar edits back to the current active set's folder
  if (activeSetId) {
    await syncBarToFolder(activeSetId);
  }

  // 2. Clear bar
  await clearBar();

  // 3. Copy target set's folder contents to bar
  await populateBarFromFolder(targetId);

  // 4. Update active set
  await setActiveSetId(targetId);

  return getSets();
}

export async function deleteSet(
  setId: string,
  mergeTargetId?: string
): Promise<BookmarkSet[]> {
  const activeSetId = await getActiveSetId();
  const root = await ensureRootFolder();
  const allFolders = (await chrome.bookmarks.getChildren(root.id)).filter(
    (c) => !c.url
  );
  const isLastSet = allFolders.length === 1;
  const isActive = setId === activeSetId;

  if (isLastSet) {
    // Last set: clear bar, delete folder, leave bar empty
    if (isActive) {
      await clearBar();
    }
    await chrome.bookmarks.removeTree(setId);
    await setActiveSetId(null);
    return getSets();
  }

  if (mergeTargetId) {
    // Merge: move source folder's children into target folder
    if (isActive) {
      // Sync bar edits to active folder first
      await syncBarToFolder(setId);
    }

    // Move children from source folder to target folder
    const sourceChildren = await chrome.bookmarks.getChildren(setId);
    for (const child of sourceChildren) {
      await chrome.bookmarks.move(child.id, { parentId: mergeTargetId });
    }

    // Delete the now-empty source folder
    await chrome.bookmarks.removeTree(setId);

    if (isActive) {
      // Activate the merge target
      await setActiveSetId(mergeTargetId);
      await populateBarFromFolder(mergeTargetId);
    } else if (mergeTargetId === activeSetId) {
      // Target is active — reconcile bar to show merged bookmarks
      await reconcileBar(mergeTargetId);
    }
  } else {
    // Delete set and all its bookmarks
    if (isActive) {
      await clearBar();
      await chrome.bookmarks.removeTree(setId);

      // Activate the first remaining set
      const remaining = (await chrome.bookmarks.getChildren(root.id)).filter(
        (c) => !c.url
      );
      if (remaining.length > 0) {
        await setActiveSetId(remaining[0].id);
        await populateBarFromFolder(remaining[0].id);
      } else {
        await setActiveSetId(null);
      }
    } else {
      await chrome.bookmarks.removeTree(setId);
    }
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
