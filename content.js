// Elemnt — content script
// Deux modes :
//   🎯 Pick  : survol = highlight, clic = ajoute/retire l'élément de la sélection
//   ▭ Drag   : dessine un rectangle, les éléments interceptés sont ajoutés
//              (la surbrillance n'apparaît qu'après la sélection)
// Un commentaire unique est attaché au GROUPE de sélection.
//
// Chargé dans la page ET dans chacun de ses cadres (iframes, y compris les
// cadres isolés « sandbox » d'une application) : on ne peut pas viser depuis
// la page ce qu'un cadre affiche. Deux rôles :
//   - la page (cadre du haut) porte le panneau et la sélection ;
//   - un cadre ne fait que viser : il surligne chez lui et envoie à la page la
//     description de ce qu'on y choisit (par le service worker).

(() => {
  if (window.__elemntCharge) return; // déjà chargé dans ce cadre : rien à refaire
  window.__elemntCharge = true;

  const estPage = window === window.top;

  const state = {
    active: false,
    mode: "pick", // 'pick' | 'drag'
    // { el, selector } pour un élément de la page ;
    // { frameId, id, desc } pour un élément choisi dans un cadre
    selections: [],
    groupComment: ""
  };

  // ---------- messages : page <-> cadres, par le service worker ----------

  function envoyer(msg) {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch {
      // extension rechargée : ce script n'a plus de lien avec elle
    }
  }
  const versPage = (payload) => envoyer({ type: "ELEMNT_TO_PAGE", payload });
  const versCadres = (payload) => envoyer({ type: "ELEMNT_TO_FRAMES", payload });
  const versCadre = (frameId, payload) => envoyer({ type: "ELEMNT_TO_FRAME", frameId, payload });

  // ---------- utilitaires ----------

  function cssPath(el) {
    if (!(el instanceof Element)) return "";
    const parts = [];
    while (el && el.nodeType === Node.ELEMENT_NODE && parts.length < 6) {
      let sel = el.nodeName.toLowerCase();
      if (el.id) {
        sel += `#${CSS.escape(el.id)}`;
        parts.unshift(sel);
        break;
      }
      const parent = el.parentNode;
      if (parent) {
        const sibs = Array.from(parent.children).filter(
          (c) => c.nodeName === el.nodeName
        );
        if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(el) + 1})`;
      }
      parts.unshift(sel);
      el = parent;
    }
    return parts.join(" > ");
  }

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none";
  }

  function describe(el) {
    const classes = (typeof el.className === "string" ? el.className : "")
      .split(/\s+/)
      .filter((c) => c && !c.startsWith("elemnt-"));
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    const d = {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes,
      cssSelector: cssPath(el),
      textPreview: text.slice(0, 120),
      outerHTML: el.outerHTML.slice(0, 2000),
      rect: (() => {
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x + window.scrollX),
          y: Math.round(r.y + window.scrollY),
          width: Math.round(r.width),
          height: Math.round(r.height)
        };
      })()
    };
    // Dans un cadre : lequel (son titre, s'il en a un) ; position comptée depuis lui.
    if (!estPage) d.frame = { url: location.href, title: document.title };
    return d;
  }

  // La description d'une sélection, d'où qu'elle vienne.
  function descOf(s) {
    return s.el ? describe(s.el) : s.desc;
  }

  function mark(el) {
    el.classList.add("elemnt-selected-outline");
  }
  function unmark(el) {
    el.classList.remove("elemnt-selected-outline");
    el.classList.remove("elemnt-hover-outline");
  }

  // ---------- la sélection : dans la page, ou depuis un cadre ----------

  // Dans un cadre : les éléments choisis, par numéro (la page ne voit que ce numéro).
  const marques = new Map(); // id -> el
  const numeros = new WeakMap(); // el -> id
  let prochainNumero = 1;

  function isSelected(el) {
    if (!estPage) return numeros.has(el) && marques.has(numeros.get(el));
    return state.selections.some((s) => s.el === el);
  }

  function addSelection(el) {
    if (!el || isSelected(el)) return;
    mark(el);
    if (!estPage) {
      const id = numeros.get(el) || prochainNumero++;
      numeros.set(el, id);
      marques.set(id, el);
      versPage({ type: "ELEMNT_FRAME_PICK", id, desc: describe(el) });
      return;
    }
    state.selections.push({ el, selector: cssPath(el) });
    renderList();
  }

  // Un clic sur un élément déjà choisi le retire.
  function toggleSelection(el) {
    if (!isSelected(el)) {
      addSelection(el);
    } else if (!estPage) {
      const id = numeros.get(el);
      marques.delete(id);
      unmark(el);
      versPage({ type: "ELEMNT_FRAME_UNPICK", id });
    } else {
      removeSelection(state.selections.findIndex((s) => s.el === el));
    }
  }

  function removeSelection(index) {
    const s = state.selections[index];
    if (!s) return;
    if (s.el) unmark(s.el);
    else versCadre(s.frameId, { type: "ELEMNT_UNMARK", id: s.id });
    state.selections.splice(index, 1);
    renderList();
  }

  // ---------- mode PICK ----------

  let hovered = null;

  function pickOver(e) {
    const el = e.target;
    if (panelContains(el)) return;
    if (hovered && hovered !== el) hovered.classList.remove("elemnt-hover-outline");
    hovered = el;
    // Un cadre se vise de l'intérieur (son propre script) : pas de contour sur lui en entier.
    if (estPage && el.tagName === "IFRAME") return;
    if (!isSelected(el)) el.classList.add("elemnt-hover-outline");
  }

  function pickOut() {
    if (hovered) hovered.classList.remove("elemnt-hover-outline");
  }

  function pickClick(e) {
    if (panelContains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.target.classList.remove("elemnt-hover-outline");
    toggleSelection(e.target);
  }

  // ---------- mode DRAG ----------

  let band = null;
  let dragStart = null;

  function dragDown(e) {
    if (panelContains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    dragStart = { x: e.clientX, y: e.clientY, scrollY: window.scrollY };
    band = document.createElement("div");
    band.id = "elemnt-band";
    document.documentElement.appendChild(band);
    positionBand(e.clientX, e.clientY);
  }

  function positionBand(cx, cy) {
    const x = Math.min(dragStart.x, cx);
    const y = Math.min(dragStart.y, cy);
    band.style.left = x + "px";
    band.style.top = y + "px";
    band.style.width = Math.abs(cx - dragStart.x) + "px";
    band.style.height =
      Math.abs(cy - dragStart.y) + Math.abs(window.scrollY - dragStart.scrollY) + "px";
  }

  function dragMove(e) {
    if (!band) return;
    positionBand(e.clientX, e.clientY);
  }

  function dragUp() {
    if (!band) return;
    const r = band.getBoundingClientRect();
    band.remove();
    band = null;
    dragStart = null;
    if (r.width < 6 || r.height < 6) return; // trop petit = accident de clic

    const candidates = Array.from(document.querySelectorAll("*")).filter(
      (el) =>
        !panelContains(el) &&
        el.tagName !== "HTML" &&
        el.tagName !== "BODY" &&
        !el.id.startsWith("elemnt") &&
        isVisible(el)
    ).filter((el) => {
      const b = el.getBoundingClientRect();
      return (
        b.left < r.right && b.right > r.left &&
        b.top < r.bottom && b.bottom > r.top
      );
    });

    // Garde les blocs englobants, élimine les enfants contenus dans un bloc gardé
    candidates.sort((a, b) => area(b) - area(a));
    const kept = [];
    for (const el of candidates) {
      if (!kept.some((k) => k.contains(el) || el.contains(k))) kept.push(el);
    }
    kept.slice(0, 60).forEach(addSelection); // garde-fou : 60 éléments max
    renderList();
  }

  function area(el) {
    const r = el.getBoundingClientRect();
    return r.width * r.height;
  }

  // ---------- panneau (dans la page seulement) ----------

  let panel = null;

  function panelContains(el) {
    return panel && (el === panel || panel.contains(el));
  }

  // ---------- déplacement du panneau ----------

  let panelDragMoved = false;

  function panelDragStart(e) {
    if (e.target.closest("#elemnt-close")) return;
    e.preventDefault();
    panelDragMoved = false;
    const rect = panel.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    // bascule en positionnement absolu aux coordonnées courantes
    panel.style.left = rect.left + "px";
    panel.style.top = rect.top + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";

    function move(ev) {
      panelDragMoved = true;
      const x = Math.min(Math.max(0, ev.clientX - offX), window.innerWidth - 80);
      const y = Math.min(Math.max(0, ev.clientY - offY), window.innerHeight - 30);
      panel.style.left = x + "px";
      panel.style.top = y + "px";
    }
    function up() {
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("mouseup", up, true);
      setTimeout(() => (panelDragMoved = false), 0);
    }
    document.addEventListener("mousemove", move, true);
    document.addEventListener("mouseup", up, true);
  }

  function buildPanel() {
    panel = document.createElement("div");
    panel.id = "elemnt-panel";
    panel.innerHTML = `
      <header>
        <strong>Elemnt</strong>
        <span id="elemnt-counter">0</span>
        <span id="elemnt-minimize" title="Replier / déplier">—</span>
        <button id="elemnt-close" title="Quitter">✕</button>
      </header>
      <div id="elemnt-modes">
        <button data-mode="pick" title="Survoler puis cliquer les éléments">🎯 Pick</button>
        <button data-mode="drag" title="Dessiner un rectangle de sélection">▭ Drag</button>
      </div>
      <textarea id="elemnt-group-comment"
        placeholder="Commentaire pour la sélection (tout le groupe)…"></textarea>
      <div id="elemnt-list"></div>
      <div id="elemnt-footer">
        <button id="elemnt-copy">Copier JSON</button>
        <button id="elemnt-export">Télécharger .json</button>
      </div>`;
    document.documentElement.appendChild(panel);

    panel.querySelector("#elemnt-close").addEventListener("click", teardown);

    // Déplacement du panneau par son header
    const header = panel.querySelector("header");
    header.addEventListener("mousedown", panelDragStart);
    header.addEventListener("click", (e) => {
      // un clic simple (sans drag) sur le header replie/déplie
      if (!panelDragMoved) panel.classList.toggle("elemnt-collapsed");
    });
    panel.querySelector("#elemnt-group-comment").addEventListener("input", (e) => {
      state.groupComment = e.target.value;
    });
    panel.querySelectorAll("#elemnt-modes button").forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.dataset.mode));
    });
    panel.querySelector("#elemnt-copy").addEventListener("click", copyJson);
    panel.querySelector("#elemnt-export").addEventListener("click", downloadJson);
    setMode(state.mode);
    renderList();
  }

  // Le mode vaut pour la page et ses cadres.
  function setMode(mode) {
    state.mode = mode;
    if (panel) {
      panel.querySelectorAll("#elemnt-modes button").forEach((b) => {
        b.classList.toggle("active", b.dataset.mode === mode);
      });
    }
    bindMode();
    if (estPage) versCadres({ type: "ELEMNT_STATE", active: true, mode });
  }

  function renderList() {
    if (!panel) return;
    panel.querySelector("#elemnt-counter").textContent =
      `${state.selections.length} élément(s)`;
    const list = panel.querySelector("#elemnt-list");
    list.innerHTML = "";

    state.selections.forEach((s, i) => {
      const d = descOf(s);
      const item = document.createElement("div");
      item.className = "elemnt-item";
      item.innerHTML = `
        <div class="elemnt-tagline">#${i + 1} ${d.tag}${d.id ? "#" + d.id : ""}${
        d.classes.length ? "." + d.classes.join(".") : ""
      }</div>
        <button class="elemnt-remove">Retirer</button>`;
      if (d.frame) {
        // Élément d'un cadre : dans lequel (le titre du cadre, en texte).
        const ou = document.createElement("span");
        ou.className = "elemnt-frame";
        ou.textContent = ` · ${d.frame.title || "dans un cadre"}`;
        item.querySelector(".elemnt-tagline").appendChild(ou);
      }
      item.querySelector(".elemnt-remove").addEventListener("click", () =>
        removeSelection(i)
      );
      // clic sur la ligne = fait défiler jusqu'à l'élément
      item.querySelector(".elemnt-tagline").addEventListener("click", () => {
        if (s.el) flashEl(s.el);
        else versCadre(s.frameId, { type: "ELEMNT_FLASH", id: s.id });
      });
      list.appendChild(item);
    });
  }

  function flashEl(el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("elemnt-flash");
    setTimeout(() => el.classList.remove("elemnt-flash"), 1200);
  }

  // ---------- export ----------

  function buildReport() {
    return {
      tool: "Elemnt",
      version: "0.3.0",
      generatedAt: new Date().toISOString(),
      page: { url: location.href, title: document.title },
      instruction: state.groupComment,
      elements: state.selections.map((s, i) => ({
        index: i + 1,
        ...descOf(s)
      }))
    };
  }

  async function copyJson() {
    const json = JSON.stringify(buildReport(), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      flash("✓ Copié !");
    } catch {
      flash("✗ Copie refusée");
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(buildReport(), null, 2)], {
      type: "application/json"
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `elemnt-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function flash(msg) {
    const b = panel.querySelector("#elemnt-copy");
    const old = b.textContent;
    b.textContent = msg;
    setTimeout(() => (b.textContent = old), 1500);
  }

  // ---------- cycle de vie ----------

  // Un cadre ajouté à la page pendant la sélection (un outil qu'on ouvre)
  // reçoit le script à son tour.
  let surveillance = null;

  function activate() {
    state.active = true;
    document.addEventListener("keydown", onKey);
    if (!estPage) {
      bindMode();
      return;
    }
    buildPanel(); // pose aussi le mode, et le dit aux cadres
    surveillance = new MutationObserver((changes) => {
      const cadre = changes.some((c) =>
        Array.from(c.addedNodes).some(
          (n) => n.nodeType === 1 && (n.tagName === "IFRAME" || n.querySelector?.("iframe"))
        )
      );
      if (cadre) setTimeout(() => envoyer({ type: "ELEMNT_REINJECT" }), 300);
    });
    surveillance.observe(document.documentElement, { childList: true, subtree: true });
  }

  function bindMode() {
    unbindMode();
    if (!state.active) return;
    if (state.mode === "pick") {
      document.addEventListener("mouseover", pickOver, true);
      document.addEventListener("mouseout", pickOut, true);
      document.addEventListener("click", pickClick, true);
    } else {
      document.addEventListener("mousedown", dragDown, true);
      document.addEventListener("mousemove", dragMove, true);
      document.addEventListener("mouseup", dragUp, true);
    }
  }

  function unbindMode() {
    document.removeEventListener("mouseover", pickOver, true);
    document.removeEventListener("mouseout", pickOut, true);
    document.removeEventListener("click", pickClick, true);
    document.removeEventListener("mousedown", dragDown, true);
    document.removeEventListener("mousemove", dragMove, true);
    document.removeEventListener("mouseup", dragUp, true);
  }

  function onKey(e) {
    if (e.key !== "Escape") return;
    if (estPage) teardown();
    else versPage({ type: "ELEMNT_FRAME_ESCAPE" });
  }

  function teardown() {
    state.active = false;
    unbindMode();
    document.removeEventListener("keydown", onKey);
    if (hovered) unmark(hovered);
    hovered = null;
    if (band) band.remove();
    band = null;
    if (!estPage) {
      marques.forEach((el) => unmark(el));
      marques.clear();
      return;
    }
    state.selections.forEach((s) => s.el && unmark(s.el));
    state.selections = [];
    if (surveillance) surveillance.disconnect();
    surveillance = null;
    if (panel) panel.remove();
    panel = null;
    versCadres({ type: "ELEMNT_STATE", active: false });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg.type !== "string") return;
    if (estPage) {
      if (msg.type === "ELEMNT_TOGGLE") {
        if (state.active) teardown();
        else activate();
      } else if (!state.active) {
        // sélection coupée : un cadre en retard n'y ajoute rien
      } else if (msg.type === "ELEMNT_FRAME_HELLO") {
        versCadre(msg.frameId, { type: "ELEMNT_STATE", active: true, mode: state.mode });
      } else if (msg.type === "ELEMNT_FRAME_PICK") {
        const deja = state.selections.some((s) => s.frameId === msg.frameId && s.id === msg.id);
        if (!deja) state.selections.push({ frameId: msg.frameId, id: msg.id, desc: msg.desc });
        renderList();
      } else if (msg.type === "ELEMNT_FRAME_UNPICK") {
        state.selections = state.selections.filter((s) => !(s.frameId === msg.frameId && s.id === msg.id));
        renderList();
      } else if (msg.type === "ELEMNT_FRAME_ESCAPE") {
        teardown();
      }
      return;
    }
    // Dans un cadre : ce que dit la page.
    if (msg.type === "ELEMNT_STATE") {
      if (!msg.active) {
        if (state.active) teardown();
      } else {
        state.mode = msg.mode || state.mode;
        if (state.active) bindMode();
        else activate();
      }
    } else if (msg.type === "ELEMNT_UNMARK") {
      const el = marques.get(msg.id);
      if (el) unmark(el);
      marques.delete(msg.id);
    } else if (msg.type === "ELEMNT_FLASH") {
      const el = marques.get(msg.id);
      if (el) flashEl(el);
    }
  });

  // Se présenter : le service worker pose les styles dans ce cadre, et la
  // page, si une sélection est en cours, dit au cadre de viser aussi.
  envoyer({ type: "ELEMNT_HELLO" });
})();
