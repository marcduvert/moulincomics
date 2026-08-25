import { Link } from "react-router-dom";
import { useLang } from "../context/LanguageContext";

export const Footer = () => {
  const { t } = useLang();
  return (
  <footer className="bg-ink text-paper mt-24">
    <div className="max-w-[1400px] mx-auto px-6 py-16 grid md:grid-cols-4 gap-10">
      <div className="md:col-span-2">
        <h3 className="font-anton text-4xl sm:text-5xl leading-none">MOULIN<br/>COMICS</h3>
        <p className="font-mono text-sm text-paper/60 mt-4 max-w-sm">{t.footer.desc}</p>
      </div>
      <div className="font-mono text-sm">
        <p className="uppercase tracking-[0.2em] text-paper/40 mb-4">{t.footer.explore}</p>
        <ul className="space-y-2">
          <li><Link to="/shop" className="hover:text-comicyellow">{t.nav.shop}</Link></li>
          <li><Link to="/shop?category=VO" className="hover:text-comicyellow">{t.nav.vo}</Link></li>
          <li><Link to="/shop?category=VF" className="hover:text-comicyellow">{t.nav.vf}</Link></li>
          <li><Link to="/conventions" className="hover:text-comicyellow">{t.nav.salons}</Link></li>
        </ul>
      </div>
      <div className="font-mono text-sm">
        <p className="uppercase tracking-[0.2em] text-paper/40 mb-4">{t.footer.contact}</p>
        <ul className="space-y-2 text-paper/70">
          <li>bonjour@moulincomics.fr</li>
          <li>Paris · France</li>
          <li><Link to="/admin/login" className="hover:text-comicyellow">{t.footer.manager}</Link></li>
        </ul>
      </div>
    </div>
    <div className="border-t border-paper/15 py-4 text-center font-mono text-xs text-paper/40">
      © {new Date().getFullYear()} MOULIN COMICS — {t.footer.rights}
    </div>
  </footer>
  );
};
