import { AnimatePresence, motion } from "framer-motion";
import { X, Minus, Plus, Trash2, ArrowLeft, MapPin, Search, Loader2 } from "lucide-react";
import { useCart } from "../context/CartContext";
import { api, fmtPrice } from "../lib/api";
import { useLang } from "../context/LanguageContext";
import { useContent } from "../context/ContentContext";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const RelayPicker = ({ onSelect, t }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true); setError(""); setResults(null);
    try {
      const params = /^\d+$/.test(q) ? { postal_code: q } : { city: q };
      const { data } = await api.get("/mondial-relay/points", { params });
      setResults(data.points || []);
    } catch (e) {
      const d = e.response?.data?.detail;
      setError(d && d !== "MONDIAL_RELAY_NOT_CONFIGURED" ? d : t.cart.relayError);
      setResults([]);
    } finally { setSearching(false); }
  };

  return (
    <div data-testid="relay-picker" className="mt-3">
      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder={t.cart.relaySearchPh} data-testid="relay-search-input"
          className="flex-1 border-2 border-ink rounded-md px-3 py-2 bg-papersoft font-mono text-sm outline-none" />
        <button onClick={search} disabled={searching} data-testid="relay-search-button"
          className="flex items-center gap-1.5 bg-ink text-paper font-mono text-xs uppercase px-4 py-2 rounded-md border-2 border-ink hover:bg-comicred transition-colors disabled:opacity-40">
          {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} {t.cart.relaySearch}
        </button>
      </div>
      {error && <p className="font-mono text-xs text-comicred mt-2" data-testid="relay-error">{error}</p>}
      {results && results.length === 0 && !error && (
        <p className="font-mono text-xs text-inksoft mt-2" data-testid="relay-none">{t.cart.relayNone}</p>
      )}
      {results && results.length > 0 && (
        <div className="mt-2 max-h-64 overflow-y-auto space-y-2 pr-1" data-testid="relay-results">
          {results.map((p) => (
            <button key={p.id} onClick={() => onSelect(p)} data-testid={`relay-point-${p.id}`}
              className="w-full text-left border-2 border-ink rounded-md p-3 bg-papersoft hover:bg-paper transition-colors">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display font-bold text-sm leading-tight">{p.name}</p>
                <span className="shrink-0 font-mono text-[9px] uppercase px-1.5 py-0.5 border border-ink rounded">
                  {p.type}
                </span>
              </div>
              <p className="font-mono text-xs text-inksoft mt-1">{p.address} — {p.postal_code} {p.city}</p>
              <div className="flex items-center justify-between mt-1">
                {p.distance_m != null && (
                  <p className="font-mono text-[10px] text-comicblue">{(p.distance_m / 1000).toFixed(1)} km</p>
                )}
                {p.opening_hours?.monday && (
                  <p className="font-mono text-[10px] text-inksoft">{t.cart.hours} : {p.opening_hours.monday}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const CartDrawer = () => {
  const { items, open, setOpen, remove, setQty, total, count } = useCart();
  const { t } = useLang();
  const { content } = useContent();
  const vacation = content?.vacation;
  const shopClosed = !!vacation?.enabled;
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("cart");
  const [methods, setMethods] = useState(null);
  const [shippingMethod, setShippingMethod] = useState("home_delivery");
  const [relay, setRelay] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => { if (!open) { setStep("cart"); setPickerOpen(false); } }, [open]);

  const enterShipping = async () => {
    setStep("shipping");
    if (!methods) {
      try {
        const { data } = await api.get("/shipping/methods");
        setMethods(data.methods);
        const mr = data.methods.find((m) => m.id === "mondial_relay");
        setShippingMethod(mr?.available ? "mondial_relay" : "home_delivery");
      } catch { setMethods([]); }
    }
  };

  const mrMethod = methods?.find((m) => m.id === "mondial_relay");
  const homeMethod = methods?.find((m) => m.id === "home_delivery");
  const activeMethod = methods?.find((m) => m.id === shippingMethod);
  const shippingPrice = activeMethod?.price || 0;
  const grandTotal = total + (step === "shipping" ? shippingPrice : 0);

  const checkout = async () => {
    if (shopClosed) return;
    if (shippingMethod === "mondial_relay" && !relay) {
      toast.error(t.cart.relayRequired);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        items: items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        origin_url: window.location.origin,
        shipping_method: shippingMethod,
        ...(shippingMethod === "mondial_relay" && relay ? {
          relay_point: {
            id: relay.id, name: relay.name, type: relay.type, address: relay.address,
            postal_code: relay.postal_code, city: relay.city, country: relay.country,
            latitude: relay.latitude, longitude: relay.longitude,
          },
        } : {}),
      };
      const { data } = await api.post("/payments/checkout", payload);
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur lors du paiement");
      setLoading(false);
    }
  };

  const MethodCard = ({ m, disabled }) => (
    <button onClick={() => { if (disabled) return; setShippingMethod(m.id); if (m.id !== "mondial_relay") setPickerOpen(false); }}
      disabled={disabled} data-testid={`shipping-method-${m.id}`}
      className={`w-full text-left border-2 rounded-md p-3 transition-colors ${shippingMethod === m.id ? "border-comicred bg-paper" : "border-ink bg-papersoft"} ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-paper"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display font-bold text-sm">{m.id === "mondial_relay" ? t.cart.methodRelay : t.cart.methodHome}</span>
        <span className="font-anton text-lg">{fmtPrice(m.price)}</span>
      </div>
      <p className="font-mono text-xs text-inksoft mt-0.5">
        {disabled ? t.cart.methodUnavailable : (m.id === "mondial_relay" ? t.cart.methodRelayDesc : t.cart.methodHomeDesc)}
      </p>
    </button>
  );

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
              <h2 className="font-anton text-2xl uppercase">
                {step === "cart" ? `${t.cart.title} · ${count}` : t.cart.deliveryTitle}
              </h2>
              <button onClick={() => setOpen(false)} data-testid="cart-close"><X /></button>
            </div>

            {step === "cart" && (
              <>
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
                  {shopClosed && (
                    <p data-testid="vacation-notice" className="font-mono text-xs text-comicred border-2 border-comicred bg-papersoft p-3 mb-3">
                      {vacation.message}
                    </p>
                  )}
                  <button data-testid="checkout-button" disabled={!items.length || shopClosed} onClick={enterShipping}
                    className="w-full bg-comicred text-paper font-mono uppercase tracking-[0.2em] text-sm py-4 border-2 border-ink hover:bg-ink transition-colors disabled:opacity-40">
                    {t.cart.continueDelivery}
                  </button>
                  <p className="font-mono text-[10px] text-inksoft mt-3 text-center uppercase">{t.cart.note}</p>
                </div>
              </>
            )}

            {step === "shipping" && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {mrMethod && <MethodCard m={mrMethod} disabled={!mrMethod.available} />}
                  {mrMethod && !mrMethod.available && (
                    <p className="font-mono text-xs text-inksoft -mt-1" data-testid="relay-not-configured">{t.cart.relayNotConfigured}</p>
                  )}
                  {homeMethod && <MethodCard m={homeMethod} />}

                  {shippingMethod === "mondial_relay" && mrMethod?.available && (
                    <div className="border-2 border-ink rounded-md p-3 bg-paper" data-testid="relay-zone">
                      {!relay && !pickerOpen && (
                        <button onClick={() => setPickerOpen(true)} data-testid="relay-choose-button"
                          className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-ink rounded-md py-3 font-mono text-xs uppercase tracking-widest hover:bg-papersoft transition-colors">
                          <MapPin size={14} /> {t.cart.chooseRelay}
                        </button>
                      )}
                      {!relay && pickerOpen && (
                        <RelayPicker t={t} onSelect={(p) => { setRelay(p); setPickerOpen(false); }} />
                      )}
                      {relay && (
                        <div data-testid="relay-selected">
                          <p className="font-mono text-[10px] uppercase tracking-widest text-comicred mb-1">{t.cart.relaySelected}</p>
                          <p className="font-display font-bold text-sm">{relay.name}</p>
                          <p className="font-mono text-xs text-inksoft">{relay.address}</p>
                          <p className="font-mono text-xs text-inksoft">{relay.postal_code} {relay.city} — {relay.type} · n°{relay.id}</p>
                          {relay.opening_hours?.monday && (
                            <p className="font-mono text-[10px] text-inksoft mt-1">{t.cart.hours} : {relay.opening_hours.monday}</p>
                          )}
                          <button onClick={() => { setRelay(null); setPickerOpen(true); }} data-testid="relay-change-button"
                            className="mt-2 font-mono text-xs uppercase underline text-comicblue">
                            {t.cart.changeRelay}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="border-t-2 border-ink p-5">
                  <div className="space-y-1 font-mono text-sm mb-3">
                    <div className="flex justify-between"><span className="text-inksoft">{t.cart.subtotal}</span><span>{fmtPrice(total)}</span></div>
                    <div className="flex justify-between" data-testid="shipping-line">
                      <span className="text-inksoft">{t.cart.shipping}</span><span>{fmtPrice(shippingPrice)}</span>
                    </div>
                    <div className="flex justify-between font-anton text-2xl pt-1">
                      <span>{t.cart.total}</span><span data-testid="grand-total">{fmtPrice(grandTotal)}</span>
                    </div>
                  </div>
                  <button data-testid="checkout-pay-button" disabled={!items.length || loading || (shippingMethod === "mondial_relay" && !relay)} onClick={checkout}
                    className="w-full bg-comicred text-paper font-mono uppercase tracking-[0.2em] text-sm py-4 border-2 border-ink hover:bg-ink transition-colors disabled:opacity-40">
                    {loading ? t.cart.redirect : t.cart.pay}
                  </button>
                  <button onClick={() => setStep("cart")} data-testid="back-to-cart"
                    className="mt-2 w-full flex items-center justify-center gap-1.5 font-mono text-xs uppercase text-inksoft hover:text-ink">
                    <ArrowLeft size={12} /> {t.cart.backToCart}
                  </button>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
