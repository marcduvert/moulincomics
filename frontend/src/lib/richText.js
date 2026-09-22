// Contenu formaté administrable (pages légales) : sanitation HTML sans dépendance.
// Whitelist stricte : titres, paragraphes, gras, listes, liens, retours à la ligne.
// Tout le reste (scripts, iframes, attributs d'événements…) est supprimé ou déballé.

const ALLOWED = new Set(["H2", "H3", "H4", "P", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A", "BR", "HR"]);

export const sanitizeHtml = (html) => {
  if (typeof window === "undefined" || !window.DOMParser) return "";
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const clean = (node) => {
    const out = [];
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { out.push(child.textContent); continue; }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME" || tag === "OBJECT") continue;
      const inner = clean(child);
      if (!ALLOWED.has(tag)) { out.push(inner); continue; }
      if (tag === "BR" || tag === "HR") { out.push(`<${tag.toLowerCase()}>`); continue; }
      if (tag === "A") {
        const href = (child.getAttribute("href") || "").trim();
        if (/^(https?:|mailto:)/i.test(href)) {
          out.push(`<a href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">${inner}</a>`);
        } else if (href.startsWith("/")) {
          out.push(`<a href="${href.replace(/"/g, "&quot;")}">${inner}</a>`);
        } else out.push(inner);
        continue;
      }
      out.push(`<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>`);
    }
    return out.join("");
  };
  return clean(doc.body);
};
