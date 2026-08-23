// Elemnt — content script
// Mode sélection : hover = highlight, clic = ajoute l'élément à la sélection.
// Panneau latéral : commentaires par élément + export JSON.

(() => {
  if (window.__elemntActive) {
    // Déjà actif : un second message sert à désactiver.
    teardown();
    return;
  }
  window.__elemntActive = true;

  const selections = []; // { el, selector, comment }

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

  // ---------- hover highlight ----------

  let hovered = null;

  function onOver(e) {
    const el = e.target;
    if (panelContains(el)) return;
    if (hovered && hovered !== el) hovered.classList.remove("elemnt-hover-outline");
    hovered = el;
    el.classList.add("elemnt-hover-outline");
  }

  function onOut() {
    if (hovered) hovered.classList.remove("elemnt-hover-outline");
  }

  // ---------- sélection au clic ----------

  function onClick(e) {
    if (panelContains(e.target)) return; // laisser le panneau fonctionner
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    if (selections.some((s) => s.el === el)) return;
    el.classList.remove("elemnt-hover-outline");
    el.classList.add("elemnt-selected-outline");
    selections.push({ el, selector: cssPath(el), comment: "" });
    renderList();
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
        <span style="color:#9aa0ac;font-size:11px">${selections.length} élément(s)</span>
        <button id="elemnt-close" title="Quitter le mode sélection">✕</button>
      </header>
      <div id="elemnt-list"></div>
      <div id="elemnt-footer">
        <button id="elemnt-copy">Copier JSON</button>
        <button id="elemnt-export">Télécharger .json</button>
      </div>`;
    document.documentElement.appendChild(panel);

    panel.querySelector("#elemnt-close").addEventListener("click", teardown);
    panel.querySelector("#elemnt-copy").addEventListener("click", copyJson);
    panel.querySelector("#elemnt-export").addEventListener("click", downloadJson);
    renderList();
  }

  function renderList() {
    const list = panel.querySelector("#elemnt-list");
    const counter = panel.querySelector("header span");
    counter.textContent = `${selections.length} élément(s)`;
    list.innerHTML = "";

    selections.forEach((s, i) => {
      const item = document.createElement("div");
      item.className = "elemnt-item";
      const d = describe(s.el);
      item.innerHTML = `
        <div class="elemnt-tagline">#${i + 1} ${d.tag}${d.id ? "#" + d.id : ""}${
        d.classes.length ? "." + d.classes.join(".") : ""
      }</div>
        <textarea placeholder="Commentaire pour l'agent IA…"></textarea>
        <button class="elemnt-remove">Retirer</button>`;
      const ta = item.querySelector("textarea");
      ta.value = s.comment;
      ta.addEventListener("input", () => (s.comment = ta.value));
      item.querySelector(".elemnt-remove").addEventListener("click", () => {
        s.el.classList.remove("elemnt-selected-outline");
        selections.splice(i, 1);
        renderList();
      });
      list.appendChild(item);
    });
  }

  // ---------- export ----------

  function buildReport() {
    return {
      tool: "Elemnt",
      version: "0.1.0",
      generatedAt: new Date().toISOString(),
      page: {
        url: location.href,
        title: document.title
      },
      elements: selections.map((s, i) => ({
        index: i + 1,
        ...describe(s.el),
        instruction: s.comment
      }))
    };
  }

  async function copyJson() {
    const json = JSON.stringify(buildReport(), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      flash("✓ Copié dans le presse-papiers");
    } catch {
      flash("✗ Copie refusée par le navigateur");
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
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    document.addEventListener("click", onClick, true);
  }

  function teardown() {
    window.__elemntActive = false;
    document.removeEventListener("mouseover", onOver, true);
    document.removeEventListener("mouseout", onOut, true);
    document.removeEventListener("click", onClick, true);
    selections.forEach((s) => s.el.classList.remove("elemnt-selected-outline"));
    if (hovered) hovered.classList.remove("elemnt-hover-outline");
    if (panel) panel.remove();
    panel = null;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "ELEMNT_TOGGLE" && !window.__elemntActive) activate();
  });

  activate();
})();
