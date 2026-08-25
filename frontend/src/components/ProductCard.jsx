import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { fmtPrice } from "../lib/api";

export const ProductCard = ({ product, index = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-40px" }}
    transition={{ duration: 0.5, delay: (index % 4) * 0.06 }}
  >
    <Link to={`/product/${product.id}`} data-testid={`product-card-${product.id}`}
      className="group block border-2 border-ink bg-papersoft hover:shadow-hard transition-shadow duration-300">
      <div className="relative aspect-[3/4] overflow-hidden bg-papersoft border-b-2 border-ink">
        <img src={product.cover_image} alt={product.title}
          className="w-full h-full object-cover blend-ink transition-transform duration-500 group-hover:scale-105 group-hover:rotate-1" />
        <span className="absolute top-0 left-0 bg-ink text-paper font-mono text-[10px] uppercase tracking-widest px-2 py-1">
          {product.category}
        </span>
        {product.stock <= 1 && (
          <span className="absolute top-0 right-0 bg-comicred text-paper font-mono text-[10px] uppercase px-2 py-1">
            Dernier ex.
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
      </div>
    </Link>
  </motion.div>
);
