import { Link } from "react-router-dom";
import { useLang } from "../context/LanguageContext";
import { useContent } from "../context/ContentContext";

export const Footer = () => {
  const { t, lang } = useLang();
  const { content } = useContent();
  const base = content?.footer || {};
  const clean = (o) => Object.fromEntries(Object.entries(o || {})
    .filter(([k, v]) => v !== "" && v != null && k !== "en" && k !== "es"));
  const defaults = { description: t.footer.desc, address: "", email: "", phone: "", social: "", links: [] };
  const f = lang === "fr"
    ? { ...defaults, ...clean(base) }
    : { ...defaults, address: base.address || "", email: base.email || "", phone: base.phone || "",
        links: base.links || [], ...clean(base[lang]) };
  return (
  <footer className="bg-ink text-paper mt-24">
    <div className="max-w-[1400px] mx-auto px-6 py-16 grid md:grid-cols-4 gap-10">
      <div className="md:col-span-2">
        <h3 className="font-anton text-4xl sm:text-5xl leading-none">MOULIN<br/>COMICS</h3>
        <p className="font-mono text-sm text-paper/60 mt-4 max-w-sm">{f.description || t.footer.desc}</p>
      </div>
      <div className="font-mono text-sm">
        <p className="uppercase tracking-[0.2em] text-paper/40 mb-4">{t.footer.explore}</p>
        <ul className="space-y-2">
          <li><Link to="/shop" className="hover:text-comicyellow">{t.nav.shop}</Link></li>
          <li><Link to="/shop?category=VO" className="hover:text-comicyellow">{t.nav.vo}</Link></li>
          <li><Link to="/shop?category=VF" className="hover:text-comicyellow">{t.nav.vf}</Link></li>
          <li><Link to="/conventions" className="hover:text-comicyellow">{t.nav.salons}</Link></li>
          {(f.links || []).map((l, i) => (
            <li key={i}><a href={l.url} className="hover:text-comicyellow">{l.label}</a></li>
          ))}
        </ul>
      </div>
      <div className="font-mono text-sm">
        <p className="uppercase tracking-[0.2em] text-paper/40 mb-4">{t.footer.contact}</p>
        <ul className="space-y-2 text-paper/70">
          {f.email && <li>{f.email}</li>}
          {f.phone && <li>{f.phone}</li>}
          {f.address && <li>{f.address}</li>}
          {f.social && <li className="text-paper/50">{f.social}</li>}
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
