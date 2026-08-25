import { Link } from "react-router-dom";
import { XCircle } from "lucide-react";

export default function PaymentCancel() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-20">
      <div className="max-w-lg w-full border-2 border-ink bg-papersoft p-8 sm:p-12 text-center shadow-hardlg">
        <XCircle size={48} className="mx-auto text-inksoft mb-6" />
        <h1 className="font-display font-black tracking-tighter text-3xl sm:text-4xl">PAIEMENT ANNULÉ</h1>
        <p className="font-mono text-sm text-inksoft mt-4">Aucun montant n'a été débité. Votre panier vous attend toujours.</p>
        <Link to="/shop" className="inline-block mt-8 bg-ink text-paper font-mono uppercase text-sm tracking-widest px-6 py-3 hover:bg-comicred transition-colors">
          Retour à la boutique
        </Link>
      </div>
    </div>
  );
}
