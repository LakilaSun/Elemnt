// Elemnt — service worker
// Clique sur l'icône = active/coupe le mode sélection dans l'onglet courant.
// Le script va dans la page ET dans ses cadres (iframes, y compris les cadres
// isolés « sandbox » d'une application) : la page porte le panneau, ce
// service worker relaie entre elle et ses cadres.

const ignorer = () => {};

// Le script ne se charge qu'une fois par cadre : le renvoyer ne fait que
// l'ajouter aux cadres apparus depuis.
function injecter(tabId) {
  return chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content.js"]
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await injecter(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "ELEMNT_TOGGLE" }, { frameId: 0 });
  } catch {
    // page interdite aux extensions (chrome://, magasin d'extensions…)
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;
  if (tabId == null || !msg) return;
  switch (msg.type) {
    case "ELEMNT_HELLO": // la page ou un cadre vient de charger le script
      chrome.scripting.insertCSS({
        target: { tabId, frameIds: [sender.frameId] },
        files: ["overlay.css"]
      }).catch(ignorer);
      if (sender.frameId !== 0) {
        chrome.tabs.sendMessage(tabId, { type: "ELEMNT_FRAME_HELLO", frameId: sender.frameId },
          { frameId: 0 }).catch(ignorer);
      }
      break;
    case "ELEMNT_REINJECT": // la page a vu apparaître un cadre
      injecter(tabId).catch(ignorer);
      break;
    case "ELEMNT_TO_PAGE": // d'un cadre vers la page, qui saura de quel cadre
      chrome.tabs.sendMessage(tabId, { ...msg.payload, frameId: sender.frameId },
        { frameId: 0 }).catch(ignorer);
      break;
    case "ELEMNT_TO_FRAMES": // de la page vers tous ses cadres
      chrome.tabs.sendMessage(tabId, msg.payload).catch(ignorer);
      break;
    case "ELEMNT_TO_FRAME": // de la page vers un cadre
      chrome.tabs.sendMessage(tabId, msg.payload, { frameId: msg.frameId }).catch(ignorer);
      break;
  }
});
