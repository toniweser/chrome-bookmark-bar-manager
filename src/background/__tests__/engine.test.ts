import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupChromeMock, resetMock, addBookmark, getBookmarkStore } from "./chrome.mock";

// engine.ts has module-level state — we need fresh imports per test
async function freshEngine() {
  // Clear the module cache so we get fresh state
  const modulePath = "../engine";
  // Use vi.importActual won't help here; use dynamic import with cache busting
  return await import("../engine");
}

// Since vitest caches modules, we'll use a single import but rely on init() to reset state.
// The key insight: init() resets initComplete and re-resolves all IDs,
// and the chrome mock is fully reset, so state is effectively fresh.
import * as engine from "../engine";

describe("engine", () => {
  beforeEach(() => {
    setupChromeMock();
  });

  describe("init", () => {
    it("creates _BookmarkBarSets folder and Default set on first run", async () => {
      addBookmark("1", "Google", "https://google.com");
      addBookmark("1", "GitHub", "https://github.com");

      await engine.init();

      const setsFolderId = engine.getSetsFolderId();
      expect(setsFolderId).toBeTruthy();

      const store = getBookmarkStore();
      const setsFolder = store.get(setsFolderId);
      expect(setsFolder?.parentId).toBe("2");

      const sets = await engine.getSets();
      expect(sets).toHaveLength(1);
      expect(sets[0].name).toBe("Default");
      expect(sets[0].isActive).toBe(true);

      // Default folder should contain copies of bar bookmarks
      const defaultFolder = await engine.getProjectFolder("Default");
      expect(defaultFolder).toBeTruthy();
      const children = await chrome.bookmarks.getChildren(defaultFolder!.id);
      expect(children).toHaveLength(2);
      const urls = children.map((c: any) => c.url);
      expect(urls).toContain("https://google.com");
      expect(urls).toContain("https://github.com");
    });

    it("reuses existing _BookmarkBarSets folder", async () => {
      const existingFolderId = addBookmark("2", "_BookmarkBarSets");
      addBookmark(existingFolderId, "Work");
      await chrome.storage.sync.set({ activeProject: "Work" });

      await engine.init();

      expect(engine.getSetsFolderId()).toBe(existingFolderId);
    });

    it("sets activeProject to first folder if current one is missing", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      addBookmark(setsId, "Personal");
      await chrome.storage.sync.set({ activeProject: "NonExistent" });

      await engine.init();

      const { activeProject } = await chrome.storage.sync.get("activeProject");
      expect(activeProject).toBe("Personal");
    });
  });

  describe("createProject", () => {
    it("creates a new empty project folder", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      addBookmark(setsId, "Work");
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      await engine.createProject("Gaming");

      const sets = await engine.getSets();
      const gaming = sets.find((s) => s.name === "Gaming");
      expect(gaming).toBeTruthy();
      expect(gaming!.isActive).toBe(false);
    });
  });

  describe("switchProject", () => {
    it("switches active project and updates bookmark bar", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      const workId = addBookmark(setsId, "Work");
      addBookmark(workId, "Jira", "https://jira.example.com");
      const personalId = addBookmark(setsId, "Personal");
      addBookmark(personalId, "Reddit", "https://reddit.com");
      await chrome.storage.sync.set({ activeProject: "Work" });

      await engine.init();

      // Bar should have Work bookmarks after init
      let barChildren = await chrome.bookmarks.getChildren("1");
      expect(barChildren.some((b: any) => b.url === "https://jira.example.com")).toBe(true);

      // Switch to Personal
      await engine.switchProject("Personal");

      barChildren = await chrome.bookmarks.getChildren("1");
      expect(barChildren.some((b: any) => b.url === "https://reddit.com")).toBe(true);
      expect(barChildren.some((b: any) => b.url === "https://jira.example.com")).toBe(false);

      const { activeProject } = await chrome.storage.sync.get("activeProject");
      expect(activeProject).toBe("Personal");
    });

    it("does nothing if project does not exist", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      addBookmark(setsId, "Work");
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      await engine.switchProject("NonExistent");

      const { activeProject } = await chrome.storage.sync.get("activeProject");
      expect(activeProject).toBe("Work");
    });
  });

  describe("renameProject", () => {
    it("renames a project folder", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      const workId = addBookmark(setsId, "Work");
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      await engine.renameProject(workId, "Office");

      const sets = await engine.getSets();
      expect(sets.some((s) => s.name === "Office")).toBe(true);
      expect(sets.some((s) => s.name === "Work")).toBe(false);
    });

    it("updates activeProject when renaming the active project", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      const workId = addBookmark(setsId, "Work");
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      await engine.renameProject(workId, "Office");

      const { activeProject } = await chrome.storage.sync.get("activeProject");
      expect(activeProject).toBe("Office");
    });

    it("does not change activeProject when renaming an inactive project", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      addBookmark(setsId, "Work");
      const personalId = addBookmark(setsId, "Personal");
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      await engine.renameProject(personalId, "Private");

      const { activeProject } = await chrome.storage.sync.get("activeProject");
      expect(activeProject).toBe("Work");
    });
  });

  describe("deleteProjectPurge", () => {
    it("deletes project and switches to next available", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      const workId = addBookmark(setsId, "Work");
      const personalId = addBookmark(setsId, "Personal");
      addBookmark(personalId, "Reddit", "https://reddit.com");
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      await engine.deleteProjectPurge(workId);

      const sets = await engine.getSets();
      expect(sets).toHaveLength(1);
      expect(sets[0].name).toBe("Personal");
      expect(sets[0].isActive).toBe(true);

      const barChildren = await chrome.bookmarks.getChildren("1");
      expect(barChildren.some((b: any) => b.url === "https://reddit.com")).toBe(true);
    });

    it("does not switch if deleting an inactive project", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      addBookmark(setsId, "Work");
      const personalId = addBookmark(setsId, "Personal");
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      await engine.deleteProjectPurge(personalId);

      const { activeProject } = await chrome.storage.sync.get("activeProject");
      expect(activeProject).toBe("Work");
    });
  });

  describe("deleteProjectMerge", () => {
    it("merges bookmarks into target, skipping duplicates", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      const workId = addBookmark(setsId, "Work");
      addBookmark(workId, "Jira", "https://jira.example.com");
      addBookmark(workId, "Shared", "https://shared.com");
      const personalId = addBookmark(setsId, "Personal");
      addBookmark(personalId, "Reddit", "https://reddit.com");
      addBookmark(personalId, "Shared", "https://shared.com"); // duplicate
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      await engine.deleteProjectMerge(workId, personalId);

      const sets = await engine.getSets();
      expect(sets).toHaveLength(1);
      expect(sets[0].name).toBe("Personal");

      const personalChildren = await chrome.bookmarks.getChildren(personalId);
      const urls = personalChildren.map((c: any) => c.url);
      expect(urls).toContain("https://reddit.com");
      expect(urls).toContain("https://shared.com");
      expect(urls).toContain("https://jira.example.com");
      // No duplicate
      expect(urls.filter((u: string) => u === "https://shared.com")).toHaveLength(1);
    });
  });

  describe("deleteLastProject", () => {
    it("removes folder and leaves bar unmanaged", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      const workId = addBookmark(setsId, "Work");
      addBookmark(workId, "Jira", "https://jira.example.com");
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      // Bar has bookmarks from reconcile
      let barChildren = await chrome.bookmarks.getChildren("1");
      expect(barChildren.length).toBeGreaterThan(0);

      await engine.deleteLastProject(workId);

      const sets = await engine.getSets();
      expect(sets).toHaveLength(0);

      const { activeProject } = await chrome.storage.sync.get("activeProject");
      expect(activeProject).toBeUndefined();

      // Bar bookmarks remain (unmanaged)
      barChildren = await chrome.bookmarks.getChildren("1");
      expect(barChildren.length).toBeGreaterThan(0);
    });
  });

  describe("getSets", () => {
    it("returns all project folders with correct active status", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      addBookmark(setsId, "Work");
      addBookmark(setsId, "Personal");
      addBookmark(setsId, "Gaming");
      await chrome.storage.sync.set({ activeProject: "Personal" });
      await engine.init();

      const sets = await engine.getSets();
      expect(sets).toHaveLength(3);

      const active = sets.filter((s) => s.isActive);
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe("Personal");
    });

    it("ignores URL bookmarks in sets folder", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      addBookmark(setsId, "Work");
      addBookmark(setsId, "Stray Bookmark", "https://stray.com");
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      const sets = await engine.getSets();
      expect(sets).toHaveLength(1);
      expect(sets[0].name).toBe("Work");
    });
  });

  describe("enqueueOp", () => {
    it("serializes concurrent operations", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      addBookmark(setsId, "Work");
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      const order: number[] = [];

      const p1 = engine.enqueueOp(async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(1);
      });
      const p2 = engine.enqueueOp(async () => {
        order.push(2);
      });
      const p3 = engine.enqueueOp(async () => {
        order.push(3);
      });

      await Promise.all([p1, p2, p3]);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe("idMap", () => {
    it("maps bar bookmark IDs to project bookmark IDs after reconcile", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      const workId = addBookmark(setsId, "Work");
      addBookmark(workId, "Jira", "https://jira.example.com");
      addBookmark(workId, "GitHub", "https://github.com");
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      const idMap = engine.getIdMap();
      expect(idMap.size).toBe(2);

      // Every bar bookmark should map to a known project bookmark
      const barChildren = await chrome.bookmarks.getChildren("1");
      for (const barBm of barChildren) {
        expect(idMap.has(barBm.id)).toBe(true);
        const projId = idMap.get(barBm.id)!;
        const store = getBookmarkStore();
        expect(store.has(projId)).toBe(true);
      }
    });

    it("is rebuilt on project switch", async () => {
      const setsId = addBookmark("2", "_BookmarkBarSets");
      const workId = addBookmark(setsId, "Work");
      addBookmark(workId, "Jira", "https://jira.example.com");
      const personalId = addBookmark(setsId, "Personal");
      addBookmark(personalId, "Reddit", "https://reddit.com");
      await chrome.storage.sync.set({ activeProject: "Work" });
      await engine.init();

      const oldKeys = [...engine.getIdMap().keys()];

      await engine.switchProject("Personal");

      const newMap = engine.getIdMap();
      // Old bar IDs should no longer exist (bar was cleared and rebuilt)
      for (const key of oldKeys) {
        expect(newMap.has(key)).toBe(false);
      }
      expect(newMap.size).toBe(1);
    });
  });
});
