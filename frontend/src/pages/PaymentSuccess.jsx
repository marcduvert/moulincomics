import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { api, fmtPrice } from "../lib/api";
import { useCart } from "../context/CartContext";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
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
      <div className="max-w-lg w-full border-2 border-ink bg-papersoft p-8 sm:p-12 text-center shadow-hardlg">
        {status === "checking" && <p className="font-mono text-sm">Vérification du paiement…</p>}
        {status === "paid" && (
          <>
            <CheckCircle2 size={48} className="mx-auto text-comicred mb-6" />
            <h1 className="font-display font-black tracking-tighter text-3xl sm:text-4xl">MERCI !</h1>
            <p className="font-mono text-sm text-inksoft mt-4">
              Votre commande de {fmtPrice(data?.amount || 0)} est confirmée. Nous préparons vos comics avec soin.
            </p>
            <div className="mt-6 border-t border-ink/15 pt-6 text-left font-mono text-xs space-y-2">
              {data?.items?.map((it, i) => (
                <div key={i} className="flex justify-between"><span>{it.title} × {it.quantity}</span><span>{fmtPrice(it.price * it.quantity)}</span></div>
              ))}
            </div>
            <Link to="/shop" className="inline-block mt-8 bg-ink text-paper font-mono uppercase text-sm tracking-widest px-6 py-3 hover:bg-comicred transition-colors">
              Continuer mes achats
            </Link>
          </>
        )}
        {status === "pending" && <p className="font-mono text-sm">Paiement en cours de traitement. Vous recevrez une confirmation sous peu.</p>}
        {status === "error" && (
          <>
            <p className="font-mono text-sm">Impossible de vérifier le paiement.</p>
            <Link to="/" className="inline-block mt-6 underline font-mono text-sm">Retour à l'accueil</Link>
          </>
        )}
      </div>
    </div>
  );
}
