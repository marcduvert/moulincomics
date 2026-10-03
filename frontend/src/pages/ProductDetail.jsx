import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingBag, Check, ArrowLeft, ArrowRight } from "lucide-react";import { api, fmtPrice } from "../lib/api";
import { useLang } from "../context/LanguageContext";
import { useCart } from "../context/CartContext";
import { ProductCard } from "../components/ProductCard";
import { Seo } from "../components/Seo";
import { absUrl } from "../lib/seo";

export default function ProductDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { t, lang } = useLang();
  const [p, setP] = useState(null);
  const [related, setRelated] = useState([]);
  const { add } = useCart();

  useEffect(() => {
    window.scrollTo(0, 0);
    api.get(`/products/${id}`).then((r) => {
      // Redirection 301 côté client : ancienne URL technique ou ancien slug → URL SEO canonique
      if (r.data.slug && r.data.slug !== id) {
        nav(`/product/${r.data.slug}`, { replace: true });
        return;
      }
      setP(r.data);
      if (r.data.category) {
        api.get("/products", { params: { category: r.data.category } })
          .then((rr) => setRelated(rr.data.filter((x) => x.id !== r.data.id)));
      } else {
        setRelated([]);
      }
    }).catch(() => setP(null));
  }, [id]);

  if (!p) return <div className="min-h-[60vh] flex items-center justify-center font-mono text-sm">{t.shop.loading}</div>;

  const localizedDesc = (lang === "en" && p.description_en) ? p.description_en
    : (lang === "es" && p.description_es) ? p.description_es
    : p.description;

  // --- Navigation précédent / suivant dans la même série (réutilise `related` déjà chargé) ---
  const seriesNav = (() => {
    if (!p.series) return { prev: null, next: null };
    const mates = related.filter((x) => x.series === p.series);
    if (mates.length === 0) return { prev: null, next: null };
    const num = (x) => {
      const n = parseFloat(String(x.issue || "").replace(",", "."));
      return isNaN(n) ? null : n;
    };
    const all = [...mates, p].sort((a, b) => {
      const na = num(a), nb = num(b);
      if (na != null && nb != null && na !== nb) return na - nb;
      if (na != null && nb == null) return -1;
      if (na == null && nb != null) return 1;
      return String(a.title).localeCompare(String(b.title));
    });
    const idx = all.findIndex((x) => x.id === p.id);
    return { prev: idx > 0 ? all[idx - 1] : null, next: idx < all.length - 1 ? all[idx + 1] : null };
  })();
  const navLabel = (x) => `${x.series}${x.issue ? ` #${x.issue}` : ""}`;

  // --- « Dans le même rayon » : priorité forte à la série (numéros les plus proches),
  // complété par la catégorie jusqu'à 8. Réutilise `related` déjà chargé. ---
  const shelf = (() => {
    if (related.length === 0) return [];
    if (!p.series) return related.slice(0, 8);
    const num = (x) => {
      const n = parseFloat(String(x.issue || "").replace(",", "."));
      return isNaN(n) ? null : n;
    };
    const cur = num(p);
    const mates = related.filter((x) => x.series === p.series);
    const withNum = mates.filter((x) => num(x) != null);
    const noNum = mates.filter((x) => num(x) == null);
    withNum.sort((a, b) => {
      if (cur != null) {
        const da = Math.abs(num(a) - cur), db = Math.abs(num(b) - cur);
        if (da !== db) return da - db;
      }
      return num(a) - num(b);
    });
    const ordered = [...withNum, ...noNum, ...related.filter((x) => x.series !== p.series)];
    const seen = new Set();
    const out = [];
    for (const x of ordered) {
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      out.push(x);
      if (out.length >= 8) break;
    }
    return out;
  })();

  // --- SEO dynamique : <title> court (~60 car. max) à partir des données produit ---
  const SEO_SUFFIX = " | Moulin Comics";
  const SEO_MAX = 60;
  const seoTitle = (() => {
    const full = p.title;
    if ((full + SEO_SUFFIX).length <= SEO_MAX) return full + SEO_SUFFIX;
    let name;
    if (p.series) {
      let base = p.series.includes("#") || !p.issue ? p.series : `${p.series} #${p.issue}`;
      const withPub = p.publisher ? `${base} – ${p.publisher}` : base;
      name = (withPub + SEO_SUFFIX).length <= SEO_MAX ? withPub : base;
    } else {
      name = p.publisher || full;
    }
    if ((name + SEO_SUFFIX).length > SEO_MAX) {
      let cut = name.slice(0, SEO_MAX - SEO_SUFFIX.length);
      const sp = cut.lastIndexOf(" ");
      if (sp > 20) cut = cut.slice(0, sp);
      name = cut.replace(/[\s–\-,|]+$/, "").trimEnd();
    }
    return name + SEO_SUFFIX;
  })();
  const descBits = [p.title + (p.issue && !p.title.includes(`#${p.issue}`) ? ` #${p.issue}` : "")];
  if (p.series) descBits.push(`série ${p.series}`);
  if (p.publisher) descBits.push(`édité par ${p.publisher}`);
  if (p.year) descBits.push(`(${p.year})`);
  if (p.condition) descBits.push(`état : ${p.condition}`);
  descBits.push(p.stock > 0 ? `disponible à ${fmtPrice(p.price)}` : "actuellement épuisé");
  const seoDesc = localizedDesc
    ? (localizedDesc.length > 158 ? localizedDesc.slice(0, 155).trimEnd() + "…" : localizedDesc)
    : descBits.join(", ") + ".";
  const pslug = p.slug || p.id;
  const productLd = {
    "@context": "https://schema.org", "@type": "Product",
    name: p.title + (p.issue && !p.title.includes(`#${p.issue}`) ? ` #${p.issue}` : ""),
    image: [p.cover_image],
    description: localizedDesc || seoDesc,
    sku: p.id,
    ...(p.publisher && { brand: { "@type": "Brand", name: p.publisher } }),
    offers: {
      "@type": "Offer",
      url: absUrl(`/product/${pslug}`),
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
      <Seo title={seoTitle} description={seoDesc} path={`/product/${pslug}`}
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
            {p.cover_image
              ? <img src={p.cover_image} alt={seoTitle.replace(" | Moulin Comics", "")} className="w-full aspect-[3/4] object-cover blend-ink" />
              : <div className="w-full aspect-[3/4] bg-papersoft flex items-center justify-center font-mono text-xs text-inksoft">Sans couverture</div>}
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
          <p data-testid="product-reassurance"
            className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.15em] text-inksoft text-center mt-3">
            {t.product.reassurance}
          </p>
        </div>
      </section>

      {p.moulin_eye_text && (
        <section data-testid="moulin-eye" className="max-w-[1400px] mx-auto px-4 sm:px-8 pb-4">
          <div className="border-2 border-ink bg-papersoft p-5 sm:p-6">
            <p className="font-mono text-[10px] sm:text-xs uppercase tracking-[0.2em] text-comicred mb-3">
              L'œil du Moulin{p.moulin_eye_type ? ` — ${p.moulin_eye_type}` : ""}
            </p>
            <p className="font-mono text-sm sm:text-base leading-relaxed text-ink">{p.moulin_eye_text}</p>
          </div>
        </section>
      )}

      {(seriesNav.prev || seriesNav.next) && (
        <section data-testid="series-nav" className="max-w-[1400px] mx-auto px-4 sm:px-8">
          <div className="border-t-2 border-ink grid grid-cols-1 sm:grid-cols-2 font-mono text-xs sm:text-sm uppercase tracking-[0.15em]">
            {seriesNav.prev ? (
              <Link to={`/product/${seriesNav.prev.slug || seriesNav.prev.id}`} data-testid="series-prev"
                className="flex items-center gap-3 py-5 hover:text-comicred transition-colors">
                <ArrowLeft size={16} className="shrink-0" />
                <span className="line-clamp-1">{navLabel(seriesNav.prev)}</span>
              </Link>
            ) : <div className="hidden sm:block" />}
            {seriesNav.next ? (
              <Link to={`/product/${seriesNav.next.slug || seriesNav.next.id}`} data-testid="series-next"
                className="flex items-center sm:justify-end gap-3 py-5 border-t-2 sm:border-t-0 border-ink/15 hover:text-comicred transition-colors">
                <span className="line-clamp-1">{navLabel(seriesNav.next)}</span>
                <ArrowRight size={16} className="shrink-0" />
              </Link>
            ) : <div />}
          </div>
        </section>
      )}

      {shelf.length > 0 && (
        <section className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16">
          <h2 className="font-anton text-2xl sm:text-3xl uppercase mb-8">{t.product.sameShelf}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {shelf.map((r, i) => <ProductCard key={r.id} product={r} index={i} />)}
          </div>
        </section>
      )}
    </div>
  );
}
