// Elemnt — content script
// Deux modes :
//   🎯 Pick  : survol = highlight, clic = ajoute/retire l'élément de la sélection
//   ▭ Drag   : dessine un rectangle, les éléments interceptés sont ajoutés
//              (la surbrillance n'apparaît qu'après la sélection)
// Un commentaire unique est attaché au GROUPE de sélection.

(() => {
  if (window.__elemntActive) {
    teardown();
    return;
  }
  window.__elemntActive = true;

  const state = {
    mode: "pick", // 'pick' | 'drag'
    selections: [], // { el, selector }
    groupComment: ""
  };

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
    const classes =
      typeof el.className === "string" ? el.className.trim() : "";
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: classes ? classes.split(/\s+/) : [],
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
  }

  function mark(el) {
    el.classList.add("elemnt-selected-outline");
  }
  function unmark(el) {
    el.classList.remove("elemnt-selected-outline");
    el.classList.remove("elemnt-hover-outline");
  }

  function isSelected(el) {
    return state.selections.some((s) => s.el === el);
  }

  function addSelection(el) {
    if (!el || isSelected(el)) return;
    state.selections.push({ el, selector: cssPath(el) });
    mark(el);
    renderList();
  }

  function removeSelection(index) {
    const s = state.selections[index];
    if (!s) return;
    unmark(s.el);
    state.selections.splice(index, 1);
    renderList();
  }

  // ---------- mode PICK ----------

  let hovered = null;

  function pickOver(e) {
    const el = e.target;
    if (panelContains(el)) return;
    if (hovered && hovered !== el) unmark(hovered);
    hovered = el;
    if (!isSelected(el)) el.classList.add("elemnt-hover-outline");
  }

  function pickOut() {
    if (hovered) unmark(hovered);
  }

  function pickClick(e) {
    if (panelContains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    const idx = state.selections.findIndex((s) => s.el === e.target);
    if (idx >= 0) removeSelection(idx); // re-clic = retire
    else addSelection(e.target);
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

  // ---------- panneau ----------

  let panel = null;

  function panelContains(el) {
    return panel && (el === panel || panel.contains(el));
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
    panel.querySelector("#elemnt-minimize").addEventListener("click", () => {
      panel.classList.toggle("elemnt-collapsed");
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

  function setMode(mode) {
    state.mode = mode;
    panel.querySelectorAll("#elemnt-modes button").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
  }

  function renderList() {
    if (!panel) return;
    panel.querySelector("#elemnt-counter").textContent =
      `${state.selections.length} élément(s)`;
    const list = panel.querySelector("#elemnt-list");
    list.innerHTML = "";

    state.selections.forEach((s, i) => {
      const d = describe(s.el);
      const item = document.createElement("div");
      item.className = "elemnt-item";
      item.innerHTML = `
        <div class="elemnt-tagline">#${i + 1} ${d.tag}${d.id ? "#" + d.id : ""}${
        d.classes.length ? "." + d.classes.join(".") : ""
      }</div>
        <button class="elemnt-remove">Retirer</button>`;
      item.querySelector(".elemnt-remove").addEventListener("click", () =>
        removeSelection(i)
      );
      // clic sur la ligne = fait défiler jusqu'à l'élément
      item.querySelector(".elemnt-tagline").addEventListener("click", () => {
        s.el.scrollIntoView({ behavior: "smooth", block: "center" });
        s.el.classList.add("elemnt-flash");
        setTimeout(() => s.el.classList.remove("elemnt-flash"), 1200);
      });
      list.appendChild(item);
    });
  }

  // ---------- export ----------

  function buildReport() {
    return {
      tool: "Elemnt",
      version: "0.2.0",
      generatedAt: new Date().toISOString(),
      page: { url: location.href, title: document.title },
      instruction: state.groupComment,
      elements: state.selections.map((s, i) => ({
        index: i + 1,
        ...describe(s.el)
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

  function activate() {
    buildPanel();
    bindMode();
    document.addEventListener("keydown", onKey);
  }

  function bindMode() {
    unbindMode();
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
    if (e.key === "Escape") teardown();
  }

  function teardown() {
    window.__elemntActive = false;
    unbindMode();
    document.removeEventListener("keydown", onKey);
    state.selections.forEach((s) => unmark(s.el));
    if (hovered) unmark(hovered);
    if (band) band.remove();
    if (panel) panel.remove();
    panel = null;
    band = null;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "ELEMNT_TOGGLE" && !window.__elemntActive) activate();
  });

  activate();
})();
