import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ShoppingBag, Check } from "lucide-react";
import { api, fmtPrice } from "../lib/api";
import { useCart } from "../context/CartContext";
import { ProductCard } from "../components/ProductCard";

export default function ProductDetail() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [related, setRelated] = useState([]);
  const { add } = useCart();

  useEffect(() => {
    window.scrollTo(0, 0);
    api.get(`/products/${id}`).then((r) => {
      setP(r.data);
      api.get("/products", { params: { category: r.data.category } })
        .then((rr) => setRelated(rr.data.filter((x) => x.id !== id).slice(0, 4)));
    });
  }, [id]);

  if (!p) return <div className="min-h-[60vh] flex items-center justify-center font-mono text-sm">Chargement…</div>;

  return (
    <div>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 pt-6">
        <Link to="/shop" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest hover:text-comicred">
          <ArrowLeft size={14} /> Retour
        </Link>
      </div>
      <section className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 grid lg:grid-cols-2 gap-8 lg:gap-16">
        <div className="lg:sticky lg:top-24 self-start">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}
            className="border-2 border-ink bg-papersoft p-4 shadow-hardlg">
            <img src={p.cover_image} alt={p.title} className="w-full aspect-[3/4] object-cover blend-ink" />
          </motion.div>
        </div>
        <div>
          <div className="flex gap-2 mb-5">
            <span className="bg-ink text-paper font-mono text-[10px] uppercase tracking-widest px-2 py-1">{p.category}</span>
            {p.series && <span className="border border-ink font-mono text-[10px] uppercase px-2 py-1">{p.series}</span>}
          </div>
          <h1 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl leading-[0.95]">{p.title}</h1>
          <p className="font-mono text-sm text-inksoft mt-3">
            {p.publisher}{p.issue ? ` · #${p.issue}` : ""}{p.year ? ` · ${p.year}` : ""}
          </p>
          <p className="font-anton text-4xl sm:text-5xl mt-8">{fmtPrice(p.price)}</p>

          <div className="grid grid-cols-2 gap-px bg-ink/15 border-2 border-ink mt-8 font-mono text-sm">
            <div className="bg-paper p-3"><span className="text-inksoft text-[10px] uppercase block">État</span>{p.condition}</div>
            <div className="bg-paper p-3"><span className="text-inksoft text-[10px] uppercase block">Stock</span>{p.stock > 0 ? `${p.stock} exemplaire(s)` : "Épuisé"}</div>
            <div className="bg-paper p-3"><span className="text-inksoft text-[10px] uppercase block">Éditeur</span>{p.publisher || "—"}</div>
            <div className="bg-paper p-3"><span className="text-inksoft text-[10px] uppercase block">Année</span>{p.year || "—"}</div>
          </div>

          <p className="font-mono text-sm leading-relaxed text-inksoft mt-8">{p.description}</p>

          <button data-testid="add-to-cart-button" disabled={p.stock <= 0} onClick={() => add(p)}
            className="w-full mt-8 bg-comicred text-paper font-mono uppercase tracking-[0.2em] text-sm py-5 border-2 border-ink flex items-center justify-center gap-3 hover:bg-ink transition-colors disabled:opacity-40">
            {p.stock > 0 ? <><ShoppingBag size={16} /> Ajouter au panier</> : <><Check size={16} /> Épuisé</>}
          </button>
        </div>
      </section>

      {related.length > 0 && (
        <section className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16">
          <h2 className="font-anton text-2xl sm:text-3xl uppercase mb-8">Dans le même rayon</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {related.map((r, i) => <ProductCard key={r.id} product={r} index={i} />)}
          </div>
        </section>
      )}
    </div>
  );
}
