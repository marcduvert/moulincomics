import { AnimatePresence, motion } from "framer-motion";
import { X, Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "../context/CartContext";
import { api, fmtPrice } from "../lib/api";
import { useLang } from "../context/LanguageContext";
import { useState } from "react";
import { toast } from "sonner";

export const CartDrawer = () => {
  const { items, open, setOpen, remove, setQty, total, count } = useCart();
  const { t } = useLang();
  const [loading, setLoading] = useState(false);

  const checkout = async () => {
    setLoading(true);
    try {
      const payload = { items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        origin_url: window.location.origin };
      const { data } = await api.post("/payments/checkout", payload);
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors du paiement");
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 bg-ink/50 z-[60]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)} />
          <motion.aside data-testid="cart-drawer"
            className="fixed right-0 top-0 h-full w-full sm:w-[440px] bg-paper z-[70] border-l-2 border-ink flex flex-col"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
            <div className="flex items-center justify-between p-5 border-b-2 border-ink">
              <h2 className="font-anton text-2xl uppercase">{t.cart.title} · {count}</h2>
              <button onClick={() => setOpen(false)} data-testid="cart-close"><X /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {items.length === 0 && (
                <p className="font-mono text-sm text-inksoft mt-10 text-center">{t.cart.empty}</p>
              )}
              {items.map((i) => (
                <div key={i.product_id} className="flex gap-3 border-2 border-ink p-2 bg-papersoft">
                  <img src={i.cover_image} alt={i.title} className="w-16 h-20 object-cover blend-ink" />
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-bold text-sm leading-tight line-clamp-2">{i.title}</p>
                    <p className="font-anton text-lg mt-1">{fmtPrice(i.price)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <button data-testid={`qty-dec-${i.product_id}`} onClick={() => setQty(i.product_id, Math.max(1, i.quantity - 1))}
                        className="border border-ink p-1"><Minus size={12} /></button>
                      <span className="font-mono text-xs w-5 text-center">{i.quantity}</span>
                      <button data-testid={`qty-inc-${i.product_id}`} onClick={() => setQty(i.product_id, Math.min(i.stock, i.quantity + 1))}
                        className="border border-ink p-1"><Plus size={12} /></button>
                      <button onClick={() => remove(i.product_id)} className="ml-auto text-comicred" data-testid={`remove-${i.product_id}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t-2 border-ink p-5">
              <div className="flex justify-between font-anton text-2xl mb-4">
                <span>{t.cart.total}</span><span>{fmtPrice(total)}</span>
              </div>
              <button data-testid="checkout-button" disabled={!items.length || loading} onClick={checkout}
                className="w-full bg-comicred text-paper font-mono uppercase tracking-[0.2em] text-sm py-4 border-2 border-ink hover:bg-ink transition-colors disabled:opacity-40">
                {loading ? t.cart.redirect : t.cart.pay}
              </button>
              <p className="font-mono text-[10px] text-inksoft mt-3 text-center uppercase">{t.cart.note}</p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
