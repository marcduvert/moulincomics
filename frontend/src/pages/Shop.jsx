import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLang } from "../context/LanguageContext";
import { useContent } from "../context/ContentContext";
import { ProductCard } from "../components/ProductCard";
import { Seo } from "../components/Seo";
import { absUrl } from "../lib/seo";

// Module-level cache with short TTL: fast navigation, but refreshes so new admin
// products appear without a hard reload.
let PRODUCTS_CACHE = null;
let CACHE_TS = 0;
const CACHE_TTL = 60000;
const NO_SERIES = "__sans_serie__";
const cacheFresh = () => PRODUCTS_CACHE != null && Date.now() - CACHE_TS < CACHE_TTL;

export default function Shop() {
  const { t } = useLang();
  const { content } = useContent();
  const [params, setParams] = useSearchParams();
  const [allProducts, setAllProducts] = useState(PRODUCTS_CACHE || []);
  const [loading, setLoading] = useState(!cacheFresh());
  const category = params.get("category") || "";
  const serie = params.get("series") || "";
  const q = params.get("q") || "";
  const [search, setSearch] = useState(q);
  const searchTimer = useRef(null);
  const [othersOpen, setOthersOpen] = useState(false);
  const [othersSearch, setOthersSearch] = useState("");
  const seriesZoneRef = useRef(null);

  useEffect(() => {
    if (!othersOpen) return;
    const close = (e) => { if (seriesZoneRef.current && !seriesZoneRef.current.contains(e.target)) setOthersOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [othersOpen]);

  // Compteurs calculés à la volée depuis le catalogue courant (jamais stockés,
  // évoluent automatiquement avec les imports). Mêmes données que le filtre existant.
  const { ranked, counts, noSeriesCount, top, restAlpha, catCounts } = useMemo(() => {
    const c = {};
    const cc = {};
    let none = 0;
    for (const p of allProducts) {
      const s = (p.series || "").trim();
      if (s) c[s] = (c[s] || 0) + 1; else none += 1;
      const k = (p.category || "").trim();
      if (k) cc[k] = (cc[k] || 0) + 1;
    }
    const r = Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b));
    return { ranked: r, counts: c, noSeriesCount: none, catCounts: cc,
             top: r.slice(0, 14), restAlpha: r.slice(9).sort((a, b) => a.localeCompare(b)) };
  }, [allProducts]);

  // Filtres catégories : liste administrable (Admin → Catégories), seules les
  // catégories contenant ≥1 produit sont affichées, compteur calculé automatiquement.
  const CATS = [{ v: "", l: t.shop.all, tid: "all" },
    ...(content?.categories || [])
      .filter((cat) => catCounts[cat] > 0)
      .map((cat) => ({ v: cat, l: `${cat} (${catCounts[cat]})`, tid: cat }))];

  // Fetch the full catalogue once (or when cache is stale), then filter client-side.
  useEffect(() => {
    if (!cacheFresh()) {
      api.get("/products").then((r) => { PRODUCTS_CACHE = r.data; CACHE_TS = Date.now(); setAllProducts(r.data); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, []);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  // Debounced sync of search text -> URL (kept for shareable links); filtering is instant below.
  const onSearchChange = (val) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setParam("q", val), 300);
  };

  const filtered = useMemo(() => {
    const needle = (search || q).trim().toLowerCase();
    const inStock = params.get("stock") === "1";
    return allProducts.filter((p) => {
      if (category && p.category !== category) return false;
      if (serie === NO_SERIES) { if ((p.series || "").trim()) return false; }
      else if (serie && (p.series || "") !== serie) return false;
      if (inStock && !(p.stock > 0)) return false;
      if (needle) {
        const hay = `${p.title || ""} ${p.series || ""} ${p.publisher || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [allProducts, category, serie, search, q, params]);

  const shopLd = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t.nav.home || "Accueil", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: t.shop.title, item: absUrl("/shop") },
    ],
  };

  return (
    <div>
      <Seo
        title={serie && serie !== NO_SERIES ? `${serie} — ${t.shop.title} | Moulin Comics` : `${t.shop.title} — Comics VO & VF | Moulin Comics`}
        description={serie && serie !== NO_SERIES
          ? `${t.shop.title} Moulin Comics : comics et BD de la série ${serie}.`
          : "Comics Marvel, DC et indés en version originale, mensuels VF Strange, Nova, Titans — tout le stock Moulin Comics."}
        path="/shop"
        jsonLd={shopLd}
      />
      <div className="border-b-2 border-ink">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-12 sm:py-16">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-comicred mb-2">{t.shop.eyebrow}</p>
          <h1 className="font-display font-black tracking-tighter text-4xl sm:text-5xl lg:text-6xl">{t.shop.title}</h1>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
        <div className="flex flex-wrap items-center gap-6 mb-8 border-b border-ink/15 pb-6">
          <input data-testid="search-input" value={search} placeholder={t.shop.searchPh}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 min-w-[200px] bg-transparent border-2 border-ink px-4 py-2.5 font-mono text-sm outline-none focus:bg-papersoft" />
          <div className="flex flex-wrap gap-2">
            {CATS.map((c) => (
              <button key={c.tid} data-testid={`filter-cat-${c.tid}`} onClick={() => setParam("category", c.v)}
                className={`font-mono text-xs uppercase tracking-widest px-4 py-2.5 border-2 border-ink transition-colors ${category === c.v ? "bg-ink text-paper" : "hover:bg-papersoft"}`}>
                {c.l}
              </button>
            ))}
            <button data-testid="filter-in-stock" onClick={() => setParam("stock", params.get("stock") === "1" ? "" : "1")}
              className={`font-mono text-xs uppercase tracking-widest px-4 py-2.5 border-2 border-ink transition-colors ${params.get("stock") === "1" ? "bg-green-600 text-paper" : "hover:bg-papersoft"}`}>
              {t.shop.inStockOnly}
            </button>
          </div>
        </div>

        {(ranked.length > 0 || noSeriesCount > 0) && (
          <div className="mb-10" ref={seriesZoneRef}>
            <div className="flex flex-wrap items-center gap-2" data-testid="series-filter-bar">
              <button data-testid="filter-series-all" onClick={() => setParam("series", "")}
                className={`max-sm:order-1 shrink-0 font-mono text-[11px] uppercase px-3 py-1.5 border border-ink transition-colors ${!serie ? "bg-comicyellow" : "hover:bg-papersoft"}`}>{t.shop.allSeries}</button>
              {top.map((s, i) => (
                <button key={s} data-testid={`filter-series-${s}`} onClick={() => setParam("series", s)}
                  className={`max-sm:order-4 shrink-0 ${i >= 9 ? "hidden sm:inline-block " : ""}font-mono text-[11px] uppercase px-3 py-1.5 border border-ink transition-colors ${serie === s ? "bg-comicyellow" : "hover:bg-papersoft"}`}>
                  {s} ({counts[s]})
                </button>
              ))}
              {ranked.length > 9 && (
                <span className={`max-sm:order-2 shrink-0 ${ranked.length <= 14 ? "sm:hidden" : ""}`}>
                  <button data-testid="filter-series-others" onClick={() => { setOthersOpen((o) => !o); setOthersSearch(""); }}
                    aria-expanded={othersOpen}
                    className={`font-mono text-[11px] uppercase px-3 py-1.5 border border-ink transition-colors ${othersOpen || (serie && serie !== NO_SERIES && !top.includes(serie)) ? "bg-comicyellow" : "hover:bg-papersoft"}`}>
                    {t.shop.otherSeries} ▾
                  </button>
                </span>
              )}
              {noSeriesCount > 0 && (
                <button data-testid="filter-series-none" onClick={() => setParam("series", NO_SERIES)}
                  className={`max-sm:order-3 shrink-0 font-mono text-[11px] uppercase px-3 py-1.5 border border-ink transition-colors ${serie === NO_SERIES ? "bg-comicyellow" : "hover:bg-papersoft"}`}>
                  {t.shop.noSeries} ({noSeriesCount})
                </button>
              )}
            </div>
            {othersOpen && (
              <div data-testid="others-panel" className="mt-2 w-full sm:w-80 border-2 border-ink bg-paper">
                <div className="p-2 border-b border-ink/15">
                  <input data-testid="others-search" value={othersSearch} onChange={(e) => setOthersSearch(e.target.value)}
                    placeholder="Rechercher une série..."
                    className="w-full border border-ink px-2 py-1.5 font-mono text-xs outline-none bg-papersoft" />
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {restAlpha.filter((s) => s.toLowerCase().includes(othersSearch.trim().toLowerCase())).map((s) => (
                    <button key={s} data-testid={`filter-series-${s}`}
                      onClick={() => { setParam("series", s); setOthersOpen(false); }}
                      className={`${ranked.indexOf(s) < 14 ? "sm:hidden " : ""}block w-full text-left font-mono text-[11px] uppercase px-3 py-2 transition-colors hover:bg-papersoft ${serie === s ? "bg-comicyellow" : ""}`}>
                      {s} ({counts[s]})
                    </button>
                  ))}
                  {restAlpha.filter((s) => s.toLowerCase().includes(othersSearch.trim().toLowerCase())).length === 0 && (
                    <p className="font-mono text-xs text-inksoft px-3 py-3">Aucune série</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <p className="font-mono text-sm text-inksoft py-20 text-center">{t.shop.loading}</p>
        ) : filtered.length === 0 ? (
          <p className="font-mono text-sm text-inksoft py-20 text-center">{t.shop.empty}</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {filtered.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}
