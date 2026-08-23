// Elemnt — service worker
// Clique sur l'icône = injecte/active le mode sélection dans l'onglet courant.

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "ELEMNT_TOGGLE" });
  } catch {
    // Le content script n'est pas encore injecté : on l'injecte puis on active.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["overlay.css"]
    });
    await chrome.tabs.sendMessage(tab.id, { type: "ELEMNT_TOGGLE" });
  }
});
