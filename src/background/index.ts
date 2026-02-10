import type { Message, MessageResponse } from "../shared/types";
import { getSets, createSet, switchSet, deleteSet, renameSet } from "./bookmarks";

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse: (response: MessageResponse) => void) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: String(err) }));
    return true; // keep message channel open for async response
  }
);

async function handleMessage(message: Message): Promise<MessageResponse> {
  switch (message.type) {
    case "GET_SETS":
      return { success: true, data: await getSets() };
    case "CREATE_SET":
      return { success: true, data: await createSet(message.name) };
    case "SWITCH_SET":
      return { success: true, data: await switchSet(message.setId) };
    case "DELETE_SET":
      return { success: true, data: await deleteSet(message.setId, message.mergeTargetId) };
    case "RENAME_SET":
      return { success: true, data: await renameSet(message.setId, message.name) };
  }
}
