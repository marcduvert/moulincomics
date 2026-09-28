import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { fmtPrice } from "../lib/api";
import { useLang } from "../context/LanguageContext";

export const ProductCard = ({ product, index = 0, showMoulinEye = false }) => {
  const { t } = useLang();
  const eye = showMoulinEye && product.moulin_eye_type && product.moulin_eye_type !== "Aucun"
    ? product.moulin_eye_type : null;
  return (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-40px" }}
    transition={{ duration: 0.5, delay: (index % 4) * 0.06 }}
  >
    <Link to={`/product/${product.slug || product.id}`} data-testid={`product-card-${product.id}`}
      className="group block border-2 border-ink bg-papersoft hover:shadow-hard transition-shadow duration-300">
      <div className="relative aspect-[3/4] overflow-hidden bg-papersoft border-b-2 border-ink">
        {product.cover_image
          ? <img src={product.cover_image} loading="lazy"
              alt={`${product.title}${product.series ? ` — ${product.series}` : ""}${product.publisher ? ` ${product.publisher}` : ""}`}
              className="w-full h-full object-cover blend-ink transition-transform duration-500 group-hover:scale-105 group-hover:rotate-1" />
          : <div className="w-full h-full bg-papersoft flex items-center justify-center font-mono text-[10px] text-inksoft">Sans couverture</div>}
        <span className="absolute top-0 left-0 bg-ink text-paper font-mono text-[10px] uppercase tracking-widest px-2 py-1">
          {product.category}
        </span>
        {product.stock > 0 ? (
          <span data-testid={`stock-badge-${product.id}`} className="absolute top-0 right-0 bg-green-600 text-paper font-mono text-[10px] uppercase px-2 py-1">
            {t.card.inStock}
          </span>
        ) : (
          <span data-testid={`stock-badge-${product.id}`} className="absolute top-0 right-0 bg-comicred text-paper font-mono text-[10px] uppercase px-2 py-1">
            {t.card.soldOut}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-inksoft">
          {product.series || product.publisher}{product.issue ? ` · #${product.issue}` : ""}
        </p>
        <h3 className="font-display font-bold text-base leading-tight mt-1 line-clamp-2">{product.title}</h3>
        <div className="flex items-center justify-between mt-3">
          <span className="font-anton text-xl">{fmtPrice(product.price)}</span>
          <span className="font-mono text-[10px] uppercase text-inksoft">{product.condition}</span>
        </div>
        {eye && (
          <p data-testid={`moulin-eye-marker-${product.id}`}
            className="mt-3 pt-3 border-t border-ink/15 font-mono text-[10px] leading-snug uppercase tracking-[0.15em]">
            <span className="text-comicred">L'œil du Moulin</span>
            <span className="text-ink"> — {eye}</span>
          </p>
        )}
      </div>
    </Link>
  </motion.div>
  );
};
