import type { BookmarkSet } from "../shared/types";

const ROOT_FOLDER_NAME = "_BookmarkBarSets";

// === State ===
let initComplete = false;
let opQueue: Promise<void> = Promise.resolve();
let opRunning = false;
const idMap = new Map<string, string>(); // barBookmarkId → projectBookmarkId
const pendingOps: Promise<unknown>[] = [];

// Folder IDs (resolved dynamically via getTree, NOT hardcoded)
let barId = "";
let otherBookmarksId = "";
let setsFolderId = "";

// === Accessors ===
export function getBarId(): string {
  return barId;
}
export function getSetsFolderId(): string {
  return setsFolderId;
}
export function getIdMap(): Map<string, string> {
  return idMap;
}

// === Operations Queue (Async Mutex) ===
export function enqueueOp(fn: () => Promise<void>): Promise<void> {
  const p = opQueue.then(async () => {
    opRunning = true;
    try {
      await fn();
    } finally {
      opRunning = false;
    }
  });
  opQueue = p.then(
    () => {},
    () => {}
  );
  return p;
}

export function shouldIgnoreEvent(): boolean {
  return opRunning || !initComplete;
}

// === Pending Ops (lightweight mirror writes from event handlers) ===
export function queuePendingOp(fn: () => Promise<unknown>): void {
  const promise = fn();
  pendingOps.push(promise);
  promise.finally(() => {
    const idx = pendingOps.indexOf(promise);
    if (idx >= 0) pendingOps.splice(idx, 1);
  });
}

async function flushPendingOps(): Promise<void> {
  await Promise.all([...pendingOps]);
}

// === Helpers ===

async function resolveRootIds(): Promise<void> {
  const tree = await chrome.bookmarks.getTree();
  const roots = tree[0].children!;
  for (const root of roots) {
    if (
      root.id === "1" ||
      root.title === "Bookmarks Bar" ||
      root.title === "Bookmark Bar"
    ) {
      barId = root.id;
    }
    if (
      root.id === "2" ||
      root.title === "Other Bookmarks" ||
      root.title === "Other bookmarks"
    ) {
      otherBookmarksId = root.id;
    }
  }
  // Fallback for unknown browsers
  if (!barId) barId = roots[0]?.id ?? "1";
  if (!otherBookmarksId) otherBookmarksId = roots[1]?.id ?? "2";
}

async function findOrCreateFolder(
  parentId: string,
  name: string
): Promise<string> {
  const children = await chrome.bookmarks.getChildren(parentId);
  const existing = children.find((c) => c.title === name && !c.url);
  if (existing) return existing.id;
  const created = await chrome.bookmarks.create({ parentId, title: name });
  return created.id;
}

async function clearFolder(folderId: string): Promise<void> {
  const children = await chrome.bookmarks.getChildren(folderId);
  for (const child of children) {
    await chrome.bookmarks.removeTree(child.id);
  }
}

async function copyTreeToBar(
  sourceChildren: chrome.bookmarks.BookmarkTreeNode[],
  targetParentId: string
): Promise<void> {
  for (const child of sourceChildren) {
    if (child.url) {
      const created = await chrome.bookmarks.create({
        parentId: targetParentId,
        title: child.title,
        url: child.url,
      });
      idMap.set(created.id, child.id);
    } else {
      const createdFolder = await chrome.bookmarks.create({
        parentId: targetParentId,
        title: child.title,
      });
      idMap.set(createdFolder.id, child.id);
      const subChildren = await chrome.bookmarks.getChildren(child.id);
      await copyTreeToBar(subChildren, createdFolder.id);
    }
  }
}

export async function getProjectFolder(
  name: string
): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  if (!setsFolderId) return null;
  const children = await chrome.bookmarks.getChildren(setsFolderId);
  return children.find((c) => c.title === name && !c.url) ?? null;
}

async function getProjectFolderById(
  id: string
): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  try {
    const [node] = await chrome.bookmarks.get(id);
    return node;
  } catch {
    return null;
  }
}

export async function getActiveProjectFolderId(): Promise<string | null> {
  const { activeProject } = await chrome.storage.sync.get("activeProject");
  if (!activeProject) return null;
  const folder = await getProjectFolder(activeProject);
  return folder?.id ?? null;
}

// === Reconciliation ===
async function reconcile(): Promise<void> {
  await flushPendingOps();

  const { activeProject } = await chrome.storage.sync.get("activeProject");
  if (!activeProject) return;

  idMap.clear();
  await clearFolder(barId);

  const projectFolder = await getProjectFolder(activeProject);
  if (!projectFolder) return;

  const children = await chrome.bookmarks.getChildren(projectFolder.id);
  await copyTreeToBar(children, barId);
}

// === Initialization ===
export async function init(retryCount = 0): Promise<void> {
  initComplete = false;

  try {
    await resolveRootIds();
    setsFolderId = await findOrCreateFolder(otherBookmarksId, ROOT_FOLDER_NAME);

    // Migration: chrome.storage.local activeSetId → chrome.storage.sync activeProject
    const { activeProject } = await chrome.storage.sync.get("activeProject");
    if (!activeProject) {
      const { activeSetId } = await chrome.storage.local.get("activeSetId");
      if (activeSetId) {
        try {
          const [folder] = await chrome.bookmarks.get(activeSetId);
          if (folder?.title) {
            await chrome.storage.sync.set({ activeProject: folder.title });
          }
        } catch {
          // Folder no longer exists
        }
        await chrome.storage.local.remove("activeSetId");
      }
    }

    // Clean up old idMapping from storage (now in-memory only)
    await chrome.storage.local.remove("idMapping");

    // First-time setup: if no sets exist, create one from current bar
    const setChildren = await chrome.bookmarks.getChildren(setsFolderId);
    const folders = setChildren.filter((c) => !c.url);
    if (folders.length === 0) {
      const barChildren = await chrome.bookmarks.getChildren(barId);
      const initialFolder = await chrome.bookmarks.create({
        parentId: setsFolderId,
        title: "Default",
      });
      // Copy bar contents into the new folder
      for (const bm of barChildren) {
        if (bm.url) {
          await chrome.bookmarks.create({
            parentId: initialFolder.id,
            title: bm.title,
            url: bm.url,
          });
        } else {
          const created = await chrome.bookmarks.create({
            parentId: initialFolder.id,
            title: bm.title,
          });
          const subChildren = await chrome.bookmarks.getChildren(bm.id);
          await copySubtreeToFolder(subChildren, created.id);
        }
      }
      await chrome.storage.sync.set({ activeProject: "Default" });
    } else {
      // Ensure activeProject is set to something valid
      const current = await chrome.storage.sync.get("activeProject");
      if (!current.activeProject) {
        await chrome.storage.sync.set({ activeProject: folders[0].title });
      } else {
        // Verify the active project folder still exists
        const exists = folders.some(
          (f) => f.title === current.activeProject
        );
        if (!exists) {
          await chrome.storage.sync.set({ activeProject: folders[0].title });
        }
      }
    }

    await enqueueOp(reconcile);
    initComplete = true;
  } catch (err) {
    console.error("BookmarkSets init failed:", err);
    if (retryCount < 3) {
      await new Promise((r) =>
        setTimeout(r, 1000 * Math.pow(2, retryCount))
      );
      return init(retryCount + 1);
    }
    // Give up after retries — unblock message handlers
    initComplete = true;
  }
}

async function copySubtreeToFolder(
  children: chrome.bookmarks.BookmarkTreeNode[],
  parentId: string
): Promise<void> {
  for (const child of children) {
    if (child.url) {
      await chrome.bookmarks.create({
        parentId,
        title: child.title,
        url: child.url,
      });
    } else {
      const created = await chrome.bookmarks.create({
        parentId,
        title: child.title,
      });
      const subChildren = await chrome.bookmarks.getChildren(child.id);
      await copySubtreeToFolder(subChildren, created.id);
    }
  }
}

// === Project Operations ===

export function switchProject(projectName: string): Promise<void> {
  return enqueueOp(async () => {
    await flushPendingOps();

    const projectFolder = await getProjectFolder(projectName);
    if (!projectFolder) return;

    idMap.clear();
    await clearFolder(barId);

    const children = await chrome.bookmarks.getChildren(projectFolder.id);
    await copyTreeToBar(children, barId);

    await chrome.storage.sync.set({ activeProject: projectName });
  });
}

export function createProject(name: string): Promise<void> {
  return enqueueOp(async () => {
    await chrome.bookmarks.create({
      parentId: setsFolderId,
      title: name,
    });
  });
}

export function renameProject(
  folderId: string,
  newName: string
): Promise<void> {
  return enqueueOp(async () => {
    const folder = await getProjectFolderById(folderId);
    if (!folder) return;
    const oldName = folder.title;

    await chrome.bookmarks.update(folderId, { title: newName });

    const { activeProject } = await chrome.storage.sync.get("activeProject");
    if (activeProject === oldName) {
      await chrome.storage.sync.set({ activeProject: newName });
    }
  });
}

export function deleteProjectMerge(
  folderId: string,
  targetFolderId: string
): Promise<void> {
  return enqueueOp(async () => {
    const folder = await getProjectFolderById(folderId);
    const targetFolder = await getProjectFolderById(targetFolderId);
    if (!folder || !targetFolder) return;

    // Copy bookmarks to target (skip duplicates by URL)
    const sourceBookmarks = await chrome.bookmarks.getChildren(folderId);
    const targetBookmarks = await chrome.bookmarks.getChildren(targetFolderId);
    const targetUrls = new Set(targetBookmarks.map((b) => b.url));

    for (const bm of sourceBookmarks) {
      if (!targetUrls.has(bm.url)) {
        await chrome.bookmarks.create({
          parentId: targetFolderId,
          title: bm.title,
          url: bm.url,
        });
      }
    }

    await chrome.bookmarks.removeTree(folderId);

    const { activeProject } = await chrome.storage.sync.get("activeProject");
    if (activeProject === folder.title) {
      // Switch to target inline (not via switchProject to avoid re-enqueue)
      idMap.clear();
      await clearFolder(barId);
      const newBookmarks = await chrome.bookmarks.getChildren(targetFolderId);
      await copyTreeToBar(newBookmarks, barId);
      await chrome.storage.sync.set({ activeProject: targetFolder.title });
    }
  });
}

export function deleteProjectPurge(folderId: string): Promise<void> {
  return enqueueOp(async () => {
    const folder = await getProjectFolderById(folderId);
    if (!folder) return;

    await chrome.bookmarks.removeTree(folderId);

    const { activeProject } = await chrome.storage.sync.get("activeProject");
    if (activeProject === folder.title) {
      idMap.clear();
      await clearFolder(barId);

      const remaining = await chrome.bookmarks.getChildren(setsFolderId);
      const nextFolder = remaining.find((c) => !c.url);
      if (nextFolder) {
        const bookmarks = await chrome.bookmarks.getChildren(nextFolder.id);
        await copyTreeToBar(bookmarks, barId);
        await chrome.storage.sync.set({ activeProject: nextFolder.title });
      } else {
        await chrome.storage.sync.remove("activeProject");
      }
    }
  });
}

export function deleteLastProject(folderId: string): Promise<void> {
  return enqueueOp(async () => {
    const folder = await getProjectFolderById(folderId);
    if (!folder) return;

    await chrome.bookmarks.removeTree(folderId);
    idMap.clear();
    await chrome.storage.sync.remove("activeProject");
    // Bookmarks stay in the bar, unmanaged
  });
}

// === Querying (for popup) ===

export async function getSets(): Promise<BookmarkSet[]> {
  if (!setsFolderId) return [];
  const children = await chrome.bookmarks.getChildren(setsFolderId);
  const { activeProject } = await chrome.storage.sync.get("activeProject");

  return children
    .filter((c) => !c.url)
    .map((c) => ({
      id: c.id,
      name: c.title,
      isActive: c.title === activeProject,
    }));
}

export function triggerReconcile(): Promise<void> {
  return enqueueOp(reconcile);
}
