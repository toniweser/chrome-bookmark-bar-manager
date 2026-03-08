import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./globals.css";

// Mock chrome.runtime.sendMessage for dev preview
const mockSets = [
  { id: "1", name: "Work", isActive: true },
  { id: "2", name: "Personal", isActive: false },
  { id: "3", name: "Side Projects", isActive: false },
];

if (!globalThis.chrome?.runtime) {
  (globalThis as any).chrome = {
    runtime: {
      sendMessage: async (message: any) => {
        await new Promise((r) => setTimeout(r, 300));
        switch (message.type) {
          case "GET_SETS":
            return { success: true, data: [...mockSets] };
          case "CREATE_SET":
            mockSets.push({
              id: String(Date.now()),
              name: message.name,
              isActive: false,
            });
            return { success: true, data: [...mockSets] };
          case "SWITCH_SET":
            mockSets.forEach((s) => (s.isActive = s.id === message.setId));
            return { success: true, data: [...mockSets] };
          case "DELETE_SET":
            const idx = mockSets.findIndex((s) => s.id === message.setId);
            if (idx !== -1) mockSets.splice(idx, 1);
            if (mockSets.length > 0 && !mockSets.some((s) => s.isActive)) {
              mockSets[0].isActive = true;
            }
            return { success: true, data: [...mockSets] };
          case "RENAME_SET":
            const set = mockSets.find((s) => s.id === message.setId);
            if (set) set.name = message.name;
            return { success: true, data: [...mockSets] };
          default:
            return { success: false, error: "Unknown message type" };
        }
      },
    },
  };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className={"border-2"}>
        <App />
    </div>
  </StrictMode>
);
