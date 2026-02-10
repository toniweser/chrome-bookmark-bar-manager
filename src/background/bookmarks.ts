import type { BookmarkSet } from "../shared/types";

const ROOT_FOLDER_NAME = "_BookmarkBarSets";
const BOOKMARKS_BAR_ID = "1";
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

  // First-time initialization: auto-create initial set from current bar
  if (children.filter((c) => !c.url).length === 0) {
    const folder = await chrome.bookmarks.create({
      parentId: root.id,
      title: INITIAL_SET_NAME,
    });
    await setActiveSetId(folder.id);
    return [{ id: folder.id, name: folder.title, isActive: true }];
  }

  // Recovery: if activeSetId is set but doesn't match any folder, clear it
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
  await chrome.bookmarks.create({
    parentId: root.id,
    title: name,
  });
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
    // Last set: keep bookmarks in bar, delete the set folder
    if (isActive) {
      // Bookmarks already in bar, folder is empty
      await chrome.bookmarks.removeTree(setId);
    } else {
      // Edge case: move folder contents to bar, then delete
      await moveChildren(setId, BOOKMARKS_BAR_ID);
      await chrome.bookmarks.removeTree(setId);
    }
    await setActiveSetId(null);
    return getSets();
  }

  if (mergeTargetId) {
    // Merge bookmarks into target set
    const targetIsActive = mergeTargetId === activeSetId;

    if (isActive) {
      // Source is active: bar has the bookmarks
      if (targetIsActive) {
        // Can't happen (only one active), but safety check
        await chrome.bookmarks.removeTree(setId);
      } else {
        // Move bar contents to target's folder
        await moveChildren(BOOKMARKS_BAR_ID, mergeTargetId);
        await chrome.bookmarks.removeTree(setId);
        // Switch to the merge target
        await moveChildren(mergeTargetId, BOOKMARKS_BAR_ID);
        await setActiveSetId(mergeTargetId);
      }
    } else {
      // Source is inactive: bookmarks are in its folder
      if (targetIsActive) {
        // Target is active: move source contents to bar
        await moveChildren(setId, BOOKMARKS_BAR_ID);
      } else {
        // Target is inactive: move source contents to target's folder
        await moveChildren(setId, mergeTargetId);
      }
      await chrome.bookmarks.removeTree(setId);
    }
  } else {
    // Delete all bookmarks from this set
    if (isActive) {
      // Clear bar contents
      const barChildren = await chrome.bookmarks.getChildren(BOOKMARKS_BAR_ID);
      for (const child of barChildren) {
        await chrome.bookmarks.removeTree(child.id);
      }
      // Delete the empty folder
      await chrome.bookmarks.removeTree(setId);
      // Activate the first remaining set
      const remaining = (await chrome.bookmarks.getChildren(root.id)).filter(
        (c) => !c.url
      );
      if (remaining.length > 0) {
        await moveChildren(remaining[0].id, BOOKMARKS_BAR_ID);
        await setActiveSetId(remaining[0].id);
      } else {
        await setActiveSetId(null);
      }
    } else {
      // Inactive: removeTree deletes folder + all bookmark contents
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

async function moveChildren(
  fromId: string,
  toId: string
): Promise<void> {
  const children = await chrome.bookmarks.getChildren(fromId);
  for (const child of children) {
    await chrome.bookmarks.move(child.id, { parentId: toId });
  }
}
