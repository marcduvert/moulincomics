import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { api, fmtPrice } from "../lib/api";
import { useLang } from "../context/LanguageContext";
import { useCart } from "../context/CartContext";
import { Seo } from "../components/Seo";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const { t } = useLang();
  const { clear } = useCart();
  const [status, setStatus] = useState("checking");
  const [data, setData] = useState(null);
  const sessionId = params.get("session_id");

  useEffect(() => {
    if (!sessionId) { setStatus("error"); return; }
    let tries = 0;
    const poll = async () => {
      try {
        const { data } = await api.get(`/payments/status/${sessionId}`);
        if (data.payment_status === "paid") { setData(data); setStatus("paid"); clear(); return; }
        if (tries++ < 6) setTimeout(poll, 2000); else setStatus("pending");
      } catch { setStatus("error"); }
    };
    poll();
    // eslint-disable-next-line
  }, [sessionId]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-20">
      <Seo title="Paiement confirmé | Moulin Comics" noindex />
      <div className="max-w-lg w-full border-2 border-ink bg-papersoft p-8 sm:p-12 text-center shadow-hardlg">
        {status === "checking" && <p className="font-mono text-sm">{t.pay.checking}</p>}
        {status === "paid" && (
          <>
            <CheckCircle2 size={48} className="mx-auto text-comicred mb-6" />
            <h1 className="font-display font-black tracking-tighter text-3xl sm:text-4xl">{t.pay.thanks}</h1>
            <p className="font-mono text-sm text-inksoft mt-4">
              {t.pay.confirmed(fmtPrice(data?.amount || 0))}
            </p>
            <div className="mt-6 border-t border-ink/15 pt-6 text-left font-mono text-xs space-y-2">
              {data?.items?.map((it, i) => (
                <div key={i} className="flex justify-between"><span>{it.title} × {it.quantity}</span><span>{fmtPrice(it.price * it.quantity)}</span></div>
              ))}
            </div>
            <Link to="/shop" className="inline-block mt-8 bg-ink text-paper font-mono uppercase text-sm tracking-widest px-6 py-3 hover:bg-comicred transition-colors">
              {t.pay.continue}
            </Link>
          </>
        )}
        {status === "pending" && <p className="font-mono text-sm">{t.pay.processing}</p>}
        {status === "error" && (
          <>
            <p className="font-mono text-sm">{t.pay.cannotVerify}</p>
            <Link to="/" className="inline-block mt-6 underline font-mono text-sm">{t.pay.home}</Link>
          </>
        )}
      </div>
    </div>
  );
}
