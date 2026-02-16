const BOOKMARKS_BAR_ID = "1";

// Guard flag: when true, bookmark event listeners skip (we're making changes ourselves)
let _syncing = false;

export function isSyncing(): boolean {
  return _syncing;
}

async function withSyncGuard<T>(fn: () => Promise<T>): Promise<T> {
  _syncing = true;
  try {
    return await fn();
  } finally {
    _syncing = false;
  }
}

// --- ID Mapping: barId → folderId ---

type IdMapping = Record<string, string>;

async function loadIdMapping(): Promise<IdMapping> {
  const result = await chrome.storage.local.get("idMapping");
  return result.idMapping ?? {};
}

async function saveIdMapping(mapping: IdMapping): Promise<void> {
  await chrome.storage.local.set({ idMapping: mapping });
}

export async function getIdMapping(): Promise<IdMapping> {
  return loadIdMapping();
}

export async function addToIdMapping(
  barId: string,
  folderId: string
): Promise<void> {
  const mapping = await loadIdMapping();
  mapping[barId] = folderId;
  await saveIdMapping(mapping);
}

export async function removeFromIdMappingByBarId(
  barId: string
): Promise<string | undefined> {
  const mapping = await loadIdMapping();
  const folderId = mapping[barId];
  delete mapping[barId];
  await saveIdMapping(mapping);
  return folderId;
}

export async function findBarIdByFolderId(
  folderId: string
): Promise<string | undefined> {
  const mapping = await loadIdMapping();
  for (const [barId, fId] of Object.entries(mapping)) {
    if (fId === folderId) return barId;
  }
  return undefined;
}

// --- Core sync functions ---

/**
 * Recursively copy a bookmark tree from source to target parent.
 * Returns a mapping of newId → sourceId for all copied nodes.
 */
async function copyTree(
  sourceChildren: chrome.bookmarks.BookmarkTreeNode[],
  targetParentId: string
): Promise<IdMapping> {
  const mapping: IdMapping = {};

  for (const child of sourceChildren) {
    if (child.url) {
      // Bookmark
      const created = await chrome.bookmarks.create({
        parentId: targetParentId,
        title: child.title,
        url: child.url,
      });
      mapping[created.id] = child.id;
    } else {
      // Folder — create then recurse
      const createdFolder = await chrome.bookmarks.create({
        parentId: targetParentId,
        title: child.title,
      });
      mapping[createdFolder.id] = child.id;
      const subChildren = await chrome.bookmarks.getChildren(child.id);
      const subMapping = await copyTree(subChildren, createdFolder.id);
      Object.assign(mapping, subMapping);
    }
  }

  return mapping;
}

/**
 * Clear all bookmarks from the Bookmarks Bar. Guarded.
 */
export async function clearBar(): Promise<void> {
  await withSyncGuard(async () => {
    const children = await chrome.bookmarks.getChildren(BOOKMARKS_BAR_ID);
    for (const child of children) {
      await chrome.bookmarks.removeTree(child.id);
    }
  });
  await saveIdMapping({});
}

/**
 * Populate the Bookmarks Bar from a set folder's contents. Guarded.
 * Clears the bar first, then copies all folder contents to bar.
 * Saves the barId → folderId mapping.
 */
export async function populateBarFromFolder(
  folderId: string
): Promise<void> {
  await withSyncGuard(async () => {
    // Clear existing bar contents
    const barChildren = await chrome.bookmarks.getChildren(BOOKMARKS_BAR_ID);
    for (const child of barChildren) {
      await chrome.bookmarks.removeTree(child.id);
    }

    // Copy folder contents to bar
    const folderChildren = await chrome.bookmarks.getChildren(folderId);
    const mapping = await copyTree(folderChildren, BOOKMARKS_BAR_ID);
    // mapping is barId → folderId (copyTree returns newId → sourceId)
    await saveIdMapping(mapping);
  });
}

/**
 * Sync current bar edits back into the active set folder.
 * Uses the ID mapping to update folder bookmarks to match bar state.
 * Called before switching away from the active set.
 */
export async function syncBarToFolder(folderId: string): Promise<void> {
  await withSyncGuard(async () => {
    const mapping = await loadIdMapping();
    const barChildren = await chrome.bookmarks.getChildren(BOOKMARKS_BAR_ID);
    const folderChildren = await chrome.bookmarks.getChildren(folderId);

    // Build reverse map: folderId → barId
    const reverseMappedFolderIds = new Set(Object.values(mapping));

    // 1. Remove folder bookmarks that no longer have a bar counterpart
    for (const fc of folderChildren) {
      if (!reverseMappedFolderIds.has(fc.id)) {
        // Check if any bar bookmark maps to this folder bookmark
        const hasBarCounterpart = Object.entries(mapping).some(
          ([, fId]) => fId === fc.id
        );
        if (!hasBarCounterpart) {
          await chrome.bookmarks.removeTree(fc.id);
        }
      }
    }

    // 2. For bar bookmarks not in mapping, create them in folder
    for (const bc of barChildren) {
      if (!mapping[bc.id]) {
        if (bc.url) {
          const created = await chrome.bookmarks.create({
            parentId: folderId,
            title: bc.title,
            url: bc.url,
          });
          mapping[bc.id] = created.id;
        } else {
          // Folder: recursively copy bar subfolder to set folder
          const created = await chrome.bookmarks.create({
            parentId: folderId,
            title: bc.title,
          });
          mapping[bc.id] = created.id;
          const subChildren = await chrome.bookmarks.getChildren(bc.id);
          const subMapping = await copyTree(subChildren, created.id);
          Object.assign(mapping, subMapping);
        }
      }
    }

    // 3. Update title/url for existing mapped bookmarks
    for (const bc of barChildren) {
      const folderBookmarkId = mapping[bc.id];
      if (folderBookmarkId) {
        try {
          const folderBookmark = (
            await chrome.bookmarks.get(folderBookmarkId)
          )[0];
          if (
            folderBookmark.title !== bc.title ||
            folderBookmark.url !== bc.url
          ) {
            await chrome.bookmarks.update(folderBookmarkId, {
              title: bc.title,
              url: bc.url,
            });
          }
        } catch {
          // Folder bookmark was deleted externally, recreate
          if (bc.url) {
            const created = await chrome.bookmarks.create({
              parentId: folderId,
              title: bc.title,
              url: bc.url,
            });
            mapping[bc.id] = created.id;
          }
        }
      }
    }

    await saveIdMapping(mapping);
  });
}

/**
 * Reconcile: ensure bar matches active set folder.
 * Removes stale bar bookmarks not in mapping, adds missing ones.
 */
export async function reconcileBar(activeSetFolderId: string): Promise<void> {
  await withSyncGuard(async () => {
    const mapping = await loadIdMapping();
    const barChildren = await chrome.bookmarks.getChildren(BOOKMARKS_BAR_ID);

    // Remove bar bookmarks not in our mapping (stale sync artifacts)
    for (const bc of barChildren) {
      if (!mapping[bc.id]) {
        await chrome.bookmarks.removeTree(bc.id);
      }
    }

    // Check if any folder bookmarks are missing from bar
    const folderChildren = await chrome.bookmarks.getChildren(
      activeSetFolderId
    );
    const mappedFolderIds = new Set(Object.values(mapping));

    for (const fc of folderChildren) {
      if (!mappedFolderIds.has(fc.id)) {
        // This folder bookmark has no bar counterpart — copy it to bar
        if (fc.url) {
          const created = await chrome.bookmarks.create({
            parentId: BOOKMARKS_BAR_ID,
            title: fc.title,
            url: fc.url,
          });
          mapping[created.id] = fc.id;
        } else {
          const createdFolder = await chrome.bookmarks.create({
            parentId: BOOKMARKS_BAR_ID,
            title: fc.title,
          });
          mapping[createdFolder.id] = fc.id;
          const subChildren = await chrome.bookmarks.getChildren(fc.id);
          const subMapping = await copyTree(subChildren, createdFolder.id);
          Object.assign(mapping, subMapping);
        }
      }
    }

    await saveIdMapping(mapping);
  });
}

// --- Event handler helpers (called from index.ts listeners) ---

export async function onBarBookmarkCreated(
  barBookmark: chrome.bookmarks.BookmarkTreeNode,
  activeSetFolderId: string
): Promise<void> {
  if (barBookmark.url) {
    const created = await chrome.bookmarks.create({
      parentId: activeSetFolderId,
      title: barBookmark.title,
      url: barBookmark.url,
    });
    await addToIdMapping(barBookmark.id, created.id);
  } else {
    const created = await chrome.bookmarks.create({
      parentId: activeSetFolderId,
      title: barBookmark.title,
    });
    await addToIdMapping(barBookmark.id, created.id);
  }
}

export async function onBarBookmarkRemoved(barId: string): Promise<void> {
  const folderId = await removeFromIdMappingByBarId(barId);
  if (folderId) {
    try {
      await chrome.bookmarks.removeTree(folderId);
    } catch {
      // Already deleted (e.g. sync removed it)
    }
  }
}

export async function onBarBookmarkChanged(
  barId: string,
  changeInfo: chrome.bookmarks.BookmarkChangeInfo
): Promise<void> {
  const mapping = await loadIdMapping();
  const folderId = mapping[barId];
  if (folderId) {
    try {
      await chrome.bookmarks.update(folderId, {
        title: changeInfo.title,
        url: changeInfo.url,
      });
    } catch {
      // Folder bookmark gone
    }
  }
}

export async function onBarBookmarkMoved(
  barId: string,
  moveInfo: chrome.bookmarks.BookmarkMoveInfo,
  activeSetFolderId: string
): Promise<void> {
  // Only handle reorders within the bar
  if (
    moveInfo.parentId === BOOKMARKS_BAR_ID &&
    moveInfo.oldParentId === BOOKMARKS_BAR_ID
  ) {
    const mapping = await loadIdMapping();
    const folderId = mapping[barId];
    if (folderId) {
      try {
        await chrome.bookmarks.move(folderId, {
          parentId: activeSetFolderId,
          index: moveInfo.index,
        });
      } catch {
        // Folder bookmark gone
      }
    }
  }
}

/**
 * Migration: if active set folder is empty and bar has bookmarks,
 * copy bar contents into the folder to establish folder-as-source-of-truth.
 */
export async function migrateIfNeeded(
  activeSetFolderId: string
): Promise<void> {
  const folderChildren = await chrome.bookmarks.getChildren(
    activeSetFolderId
  );
  const barChildren = await chrome.bookmarks.getChildren(BOOKMARKS_BAR_ID);

  if (folderChildren.length === 0 && barChildren.length > 0) {
    // Old format: folder is empty, bar has the bookmarks. Copy bar → folder.
    const mapping = await copyTree(barChildren, activeSetFolderId);
    // mapping is folderId → barId (copyTree returns newId → sourceId)
    // We need barId → folderId, so invert it
    const idMapping: IdMapping = {};
    for (const [newFolderId, barId] of Object.entries(mapping)) {
      idMapping[barId] = newFolderId;
    }
    await saveIdMapping(idMapping);
  }
}
