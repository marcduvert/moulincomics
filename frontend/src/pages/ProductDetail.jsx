import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingBag, Check } from "lucide-react";import { api, fmtPrice } from "../lib/api";
import { useLang } from "../context/LanguageContext";
import { useCart } from "../context/CartContext";
import { ProductCard } from "../components/ProductCard";
import { Seo } from "../components/Seo";
import { absUrl } from "../lib/seo";

export default function ProductDetail() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const [p, setP] = useState(null);
  const [related, setRelated] = useState([]);
  const { add } = useCart();

  useEffect(() => {
    window.scrollTo(0, 0);
    api.get(`/products/${id}`).then((r) => {
      setP(r.data);
      if (r.data.series) {
        api.get("/products", { params: { series: r.data.series } })
          .then((rr) => setRelated(rr.data.filter((x) => x.id !== id).slice(0, 4)));
      } else {
        setRelated([]);
      }
    });
  }, [id]);

  if (!p) return <div className="min-h-[60vh] flex items-center justify-center font-mono text-sm">{t.shop.loading}</div>;

  const localizedDesc = (lang === "en" && p.description_en) ? p.description_en
    : (lang === "es" && p.description_es) ? p.description_es
    : p.description;

  // --- SEO dynamique (données réelles du produit uniquement) ---
  const titleParts = [p.title];
  if (p.series && !p.title.toLowerCase().includes(p.series.toLowerCase())) titleParts.push(p.series);
  else if (p.publisher && !p.title.toLowerCase().includes(p.publisher.toLowerCase())) titleParts.push(`Comic ${p.publisher}`);
  titleParts.push("Moulin Comics");
  const seoTitle = titleParts.join(" — ");
  const descBits = [p.title + (p.issue && !p.title.includes(`#${p.issue}`) ? ` #${p.issue}` : "")];
  if (p.series) descBits.push(`série ${p.series}`);
  if (p.publisher) descBits.push(`édité par ${p.publisher}`);
  if (p.year) descBits.push(`(${p.year})`);
  if (p.condition) descBits.push(`état : ${p.condition}`);
  descBits.push(p.stock > 0 ? `disponible à ${fmtPrice(p.price)}` : "actuellement épuisé");
  const seoDesc = descBits.join(", ") + ".";
  const productLd = {
    "@context": "https://schema.org", "@type": "Product",
    name: p.title + (p.issue && !p.title.includes(`#${p.issue}`) ? ` #${p.issue}` : ""),
    image: [p.cover_image],
    description: localizedDesc || seoDesc,
    sku: p.id,
    ...(p.publisher && { brand: { "@type": "Brand", name: p.publisher } }),
    offers: {
      "@type": "Offer",
      url: absUrl(`/product/${p.id}`),
      priceCurrency: "EUR",
      price: Number(p.price || 0).toFixed(2),
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: (p.condition || "").toLowerCase().includes("neuf")
        ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition",
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t.nav.home || "Accueil", item: absUrl("/") },
      { "@type": "ListItem", position: 2, name: t.nav.shop, item: absUrl("/shop") },
      ...(p.series ? [{ "@type": "ListItem", position: 3, name: p.series,
        item: absUrl(`/shop?series=${encodeURIComponent(p.series)}`) }] : []),
      { "@type": "ListItem", position: p.series ? 4 : 3, name: p.title },
    ],
  };

  return (
    <div>
      <Seo title={seoTitle} description={seoDesc} path={`/product/${p.id}`}
        image={p.cover_image} type="product" jsonLd={[productLd, breadcrumbLd]} />
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 pt-6">
        <nav aria-label="Fil d'Ariane" data-testid="breadcrumb"
          className="font-mono text-xs uppercase tracking-widest flex items-center gap-2 flex-wrap">
          <Link to="/" className="hover:text-comicred">{t.nav.home || "Accueil"}</Link>
          <span className="text-inksoft">›</span>
          <Link to="/shop" className="hover:text-comicred">{t.nav.shop}</Link>
          {p.series && (<>
            <span className="text-inksoft">›</span>
            <Link to={`/shop?series=${encodeURIComponent(p.series)}`} className="hover:text-comicred">{p.series}</Link>
          </>)}
          <span className="text-inksoft">›</span>
          <span className="text-inksoft line-clamp-1">{p.title}</span>
        </nav>
      </div>
      <section className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 grid lg:grid-cols-2 gap-8 lg:gap-16">
        <div className="lg:sticky lg:top-24 self-start">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}
            className="border-2 border-ink bg-papersoft p-4 shadow-hardlg">
            <img src={p.cover_image} alt={seoTitle.replace(" | Moulin Comics", "")} className="w-full aspect-[3/4] object-cover blend-ink" />
          </motion.div>
        </div>
        <div>
          <div className="flex gap-2 mb-5">
            <span className="bg-ink text-paper font-mono text-[10px] uppercase tracking-widest px-2 py-1">{p.category}</span>
            {p.series && <span className="border border-ink font-mono text-[10px] uppercase px-2 py-1">{p.series}</span>}
          </div>
          <h1 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl leading-[0.95]">{p.title}</h1>
          {p.author && <p className="font-mono text-sm text-ink mt-2 uppercase tracking-wide">{t.product.by} {p.author}</p>}
          <p className="font-mono text-sm text-inksoft mt-3">
            {p.publisher}{p.issue ? ` · #${p.issue}` : ""}{p.year ? ` · ${p.year}` : ""}
          </p>
          <p className="font-anton text-4xl sm:text-5xl mt-8">{fmtPrice(p.price)}</p>

          <div className="grid grid-cols-2 gap-px bg-ink/15 border-2 border-ink mt-8 font-mono text-sm">
            <div className="bg-paper p-3"><span className="text-inksoft text-[10px] uppercase block">{t.product.condition}</span>{p.condition}</div>
            <div className="bg-paper p-3"><span className="text-inksoft text-[10px] uppercase block">{t.product.stock}</span>{p.stock > 0 ? `${p.stock} ${t.product.copies}` : t.product.soldOut}</div>
            <div className="bg-paper p-3"><span className="text-inksoft text-[10px] uppercase block">{t.product.publisher}</span>{p.publisher || "—"}</div>
            <div className="bg-paper p-3"><span className="text-inksoft text-[10px] uppercase block">{t.product.year}</span>{p.year || "—"}</div>
          </div>

          <p className="font-mono text-sm leading-relaxed text-inksoft mt-8">{localizedDesc}</p>

          <button data-testid="add-to-cart-button" disabled={p.stock <= 0} onClick={() => add(p)}
            className="w-full mt-8 bg-comicred text-paper font-mono uppercase tracking-[0.2em] text-sm py-5 border-2 border-ink flex items-center justify-center gap-3 hover:bg-ink transition-colors disabled:opacity-40">
            {p.stock > 0 ? <><ShoppingBag size={16} /> {t.product.addToCart}</> : <><Check size={16} /> {t.product.soldOut}</>}
          </button>
        </div>
      </section>

      {related.length > 0 && (
        <section className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16">
          <h2 className="font-anton text-2xl sm:text-3xl uppercase mb-8">{t.product.sameShelf}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {related.map((r, i) => <ProductCard key={r.id} product={r} index={i} />)}
          </div>
        </section>
      )}
    </div>
  );
}
