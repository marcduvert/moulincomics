import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { ProductCard } from "../components/ProductCard";
import { Reveal } from "../components/Reveal";

const CATS = [{ v: "", l: "Tout" }, { v: "VO", l: "VO" }, { v: "VF", l: "VF" }];

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const category = params.get("category") || "";
  const serie = params.get("series") || "";
  const q = params.get("q") || "";

  useEffect(() => { api.get("/series").then((r) => setSeries(r.data)); }, []);

  useEffect(() => {
    setLoading(true);
    const p = {};
    if (category) p.category = category;
    if (serie) p.series = serie;
    if (q) p.q = q;
    api.get("/products", { params: p }).then((r) => { setProducts(r.data); setLoading(false); });
  }, [category, serie, q]);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next);
  };

  return (
    <div>
      <div className="border-b-2 border-ink">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-12 sm:py-16">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-comicred mb-2">Le stock</p>
          <h1 className="font-display font-black tracking-tighter text-4xl sm:text-5xl lg:text-6xl">BOUTIQUE</h1>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
        <div className="flex flex-wrap items-center gap-6 mb-8 border-b border-ink/15 pb-6">
          <input data-testid="search-input" defaultValue={q} placeholder="Rechercher un titre, une série…"
            onKeyDown={(e) => { if (e.key === "Enter") setParam("q", e.target.value); }}
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
              className={`font-mono text-[11px] uppercase px-3 py-1.5 border border-ink ${!serie ? "bg-comicyellow" : ""}`}>Toutes séries</button>
            {series.map((s) => (
              <button key={s} data-testid={`filter-series-${s}`} onClick={() => setParam("series", s)}
                className={`font-mono text-[11px] uppercase px-3 py-1.5 border border-ink transition-colors ${serie === s ? "bg-comicyellow" : "hover:bg-papersoft"}`}>{s}</button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="font-mono text-sm text-inksoft py-20 text-center">Chargement…</p>
        ) : products.length === 0 ? (
          <p className="font-mono text-sm text-inksoft py-20 text-center">Aucun résultat.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}
