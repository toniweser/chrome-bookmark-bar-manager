import { vi } from "vitest";

// In-memory bookmark tree
interface BookmarkNode {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  children?: BookmarkNode[];
}

let nextId = 100;
let bookmarkStore: Map<string, BookmarkNode>;
let storageLocal: Record<string, unknown>;
let storageSync: Record<string, unknown>;

function newId(): string {
  return String(nextId++);
}

function findNode(id: string): BookmarkNode | undefined {
  return bookmarkStore.get(id);
}

function getChildrenOf(parentId: string): BookmarkNode[] {
  const results: BookmarkNode[] = [];
  for (const node of bookmarkStore.values()) {
    if (node.parentId === parentId) {
      results.push(node);
    }
  }
  return results;
}

function removeTreeRecursive(id: string): void {
  const children = getChildrenOf(id);
  for (const child of children) {
    removeTreeRecursive(child.id);
  }
  bookmarkStore.delete(id);
}

export function resetMock() {
  nextId = 100;
  bookmarkStore = new Map();
  storageLocal = {};
  storageSync = {};

  // Create default tree structure:
  // root (0)
  //   ├── Bookmarks Bar (1)
  //   └── Other Bookmarks (2)
  bookmarkStore.set("0", { id: "0", title: "", children: [] });
  bookmarkStore.set("1", { id: "1", parentId: "0", title: "Bookmarks Bar" });
  bookmarkStore.set("2", { id: "2", parentId: "0", title: "Other Bookmarks" });
}

// Helper to pre-populate bookmarks for tests
export function addBookmark(
  parentId: string,
  title: string,
  url?: string
): string {
  const id = newId();
  bookmarkStore.set(id, { id, parentId, title, url });
  return id;
}

export function getBookmarkStore(): Map<string, BookmarkNode> {
  return bookmarkStore;
}

export function setupChromeMock() {
  resetMock();

  const chromeMock = {
    bookmarks: {
      getTree: vi.fn(async () => {
        return [
          {
            id: "0",
            title: "",
            children: [
              { id: "1", title: "Bookmarks Bar", parentId: "0" },
              { id: "2", title: "Other Bookmarks", parentId: "0" },
            ],
          },
        ];
      }),

      getChildren: vi.fn(async (parentId: string) => {
        return getChildrenOf(parentId).map((n) => ({
          id: n.id,
          parentId: n.parentId,
          title: n.title,
          url: n.url,
        }));
      }),

      get: vi.fn(async (id: string) => {
        const node = findNode(id);
        if (!node) throw new Error(`Bookmark not found: ${id}`);
        return [
          { id: node.id, parentId: node.parentId, title: node.title, url: node.url },
        ];
      }),

      create: vi.fn(
        async (details: { parentId?: string; title: string; url?: string }) => {
          const id = newId();
          const node: BookmarkNode = {
            id,
            parentId: details.parentId,
            title: details.title,
            url: details.url,
          };
          bookmarkStore.set(id, node);
          return { id, parentId: details.parentId, title: details.title, url: details.url };
        }
      ),

      update: vi.fn(
        async (id: string, changes: { title?: string; url?: string }) => {
          const node = findNode(id);
          if (!node) throw new Error(`Bookmark not found: ${id}`);
          if (changes.title !== undefined) node.title = changes.title;
          if (changes.url !== undefined) node.url = changes.url;
          return { id: node.id, title: node.title, url: node.url };
        }
      ),

      removeTree: vi.fn(async (id: string) => {
        removeTreeRecursive(id);
      }),

      move: vi.fn(
        async (
          id: string,
          destination: { parentId?: string; index?: number }
        ) => {
          const node = findNode(id);
          if (!node) throw new Error(`Bookmark not found: ${id}`);
          if (destination.parentId !== undefined) {
            node.parentId = destination.parentId;
          }
          return node;
        }
      ),
    },

    storage: {
      local: {
        get: vi.fn(async (key: string) => {
          if (typeof key === "string") {
            return { [key]: storageLocal[key] };
          }
          return storageLocal;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(storageLocal, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete storageLocal[key];
        }),
      },
      sync: {
        get: vi.fn(async (key: string) => {
          if (typeof key === "string") {
            return { [key]: storageSync[key] };
          }
          return storageSync;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(storageSync, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete storageSync[key];
        }),
      },
    },

    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn(),
    },
  };

  // @ts-expect-error mock chrome global
  globalThis.chrome = chromeMock;

  return chromeMock;
}
