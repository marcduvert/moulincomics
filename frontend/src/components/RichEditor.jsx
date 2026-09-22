import { useRef } from "react";

// Mini-éditeur de contenu formaté (HTML limité, sans dépendance) : titres,
// sous-titres, gras, listes, liens, retours à la ligne. Réutilisé par
// « Contenu du site » (pages légales) et Admin → Livraison (politique de livraison).
// Le contenu est assaini à l'affichage public (lib/richText.sanitizeHtml).
export const RichEditor = ({ label, value, onChange, testid, hint }) => {
  const ref = useRef(null);
  const wrap = (before, after = "") => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value: v } = el;
    onChange(v.slice(0, s) + before + v.slice(s, e) + after + v.slice(e));
    requestAnimationFrame(() => { el.focus(); el.selectionStart = s + before.length; el.selectionEnd = e + before.length; });
  };
  const tools = [
    ["titre", "Titre", () => wrap("<h2>", "</h2>")],
    ["soustitre", "Sous-titre", () => wrap("<h3>", "</h3>")],
    ["gras", "Gras", () => wrap("<strong>", "</strong>")],
    ["liste", "• Liste", () => wrap("<ul><li>", "</li></ul>")],
    ["lien", "Lien", () => { const url = window.prompt("URL du lien (https://… ou /page)"); if (url) wrap(`<a href="${url}">`, "</a>"); }],
  ];
  return (
    <div className="mb-4">
      <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">{label}</label>
      <div className="flex flex-wrap gap-1 mb-1">
        {tools.map(([k, l, fn]) => (
          <button key={k} type="button" onClick={fn} data-testid={`${testid}-tool-${k}`}
            className="font-mono text-[10px] uppercase border border-ink rounded px-2 py-1 bg-paper hover:bg-papersoft transition-colors">{l}</button>
        ))}
      </div>
      <textarea ref={ref} rows={14} value={value || ""} onChange={(e) => onChange(e.target.value)} data-testid={testid}
        className="w-full border-2 border-ink rounded-md px-3 py-2 bg-papersoft font-mono text-xs outline-none" />
      {hint && <p className="font-mono text-[10px] text-inksoft mt-1">{hint}</p>}
    </div>
  );
};
