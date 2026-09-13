import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useLang } from "../context/LanguageContext";
import { ProductCard } from "../components/ProductCard";
import { Seo } from "../components/Seo";
import { absUrl } from "../lib/seo";

// Module-level cache with short TTL: fast navigation, but refreshes so new admin
// products appear without a hard reload.
let PRODUCTS_CACHE = null;
let SERIES_CACHE = null;
let CACHE_TS = 0;
const CACHE_TTL = 60000;
const cacheFresh = () => PRODUCTS_CACHE != null && Date.now() - CACHE_TS < CACHE_TTL;

export default function Shop() {
  const { t } = useLang();
  const CATS = [{ v: "", l: t.shop.all }, { v: "VO", l: "VO" }, { v: "VF", l: "VF" }];
  const [params, setParams] = useSearchParams();
  const [allProducts, setAllProducts] = useState(PRODUCTS_CACHE || []);
  const [series, setSeries] = useState(SERIES_CACHE || []);
  const [loading, setLoading] = useState(!cacheFresh());
  const category = params.get("category") || "";
  const serie = params.get("series") || "";
  const q = params.get("q") || "";
  const [search, setSearch] = useState(q);
  const searchTimer = useRef(null);

  // Fetch the full catalogue once (or when cache is stale), then filter client-side.
  useEffect(() => {
    api.get("/series").then((r) => { SERIES_CACHE = r.data; setSeries(r.data); }).catch(() => {});
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
    return allProducts.filter((p) => {
      if (category && p.category !== category) return false;
      if (serie && (p.series || "") !== serie) return false;
      if (needle) {
        const hay = `${p.title || ""} ${p.series || ""} ${p.publisher || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [allProducts, category, serie, search, q]);

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
        title={serie ? `${serie} — ${t.shop.title} | Moulin Comics` : `${t.shop.title} — Comics VO & VF | Moulin Comics`}
        description={serie
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
          <div className="flex gap-2">
            {CATS.map((c) => (
              <button key={c.l} data-testid={`filter-cat-${c.l}`} onClick={() => setParam("category", c.v)}
                className={`font-mono text-xs uppercase tracking-widest px-4 py-2.5 border-2 border-ink transition-colors ${category === c.v ? "bg-ink text-paper" : "hover:bg-papersoft"}`}>
                {c.l}
              </button>
            ))}
          </div>
        </div>

        {series.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-10">
            <button onClick={() => setParam("series", "")}
              className={`font-mono text-[11px] uppercase px-3 py-1.5 border border-ink ${!serie ? "bg-comicyellow" : ""}`}>{t.shop.allSeries}</button>
            {series.map((s) => (
              <button key={s} data-testid={`filter-series-${s}`} onClick={() => setParam("series", s)}
                className={`font-mono text-[11px] uppercase px-3 py-1.5 border border-ink transition-colors ${serie === s ? "bg-comicyellow" : "hover:bg-papersoft"}`}>{s}</button>
            ))}
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
