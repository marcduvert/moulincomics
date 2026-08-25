import { Link } from "react-router-dom";

export const Footer = () => (
  <footer className="bg-ink text-paper mt-24">
    <div className="max-w-[1400px] mx-auto px-6 py-16 grid md:grid-cols-4 gap-10">
      <div className="md:col-span-2">
        <h3 className="font-anton text-4xl sm:text-5xl leading-none">MOULIN<br/>COMICS</h3>
        <p className="font-mono text-sm text-paper/60 mt-4 max-w-sm">
          Comic shop spécialisé en VO. Large stock de mensuels VF — Strange, Nova, Titans.
          De la case à la caisse depuis toujours.
        </p>
      </div>
      <div className="font-mono text-sm">
        <p className="uppercase tracking-[0.2em] text-paper/40 mb-4">Explorer</p>
        <ul className="space-y-2">
          <li><Link to="/shop" className="hover:text-comicyellow">Boutique</Link></li>
          <li><Link to="/shop?category=VO" className="hover:text-comicyellow">Comics VO</Link></li>
          <li><Link to="/shop?category=VF" className="hover:text-comicyellow">Mensuels VF</Link></li>
          <li><Link to="/conventions" className="hover:text-comicyellow">Salons en Europe</Link></li>
        </ul>
      </div>
      <div className="font-mono text-sm">
        <p className="uppercase tracking-[0.2em] text-paper/40 mb-4">Contact</p>
        <ul className="space-y-2 text-paper/70">
          <li>bonjour@moulincomics.fr</li>
          <li>Paris · France</li>
          <li><Link to="/admin/login" className="hover:text-comicyellow">Espace gérant</Link></li>
        </ul>
      </div>
    </div>
    <div className="border-t border-paper/15 py-4 text-center font-mono text-xs text-paper/40">
      © {new Date().getFullYear()} MOULIN COMICS — VO & VF · Paiement sécurisé Stripe
    </div>
  </footer>
);
