import { Link } from "react-router-dom";
import { useLang } from "../context/LanguageContext";
import { useContent } from "../context/ContentContext";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";

// Footer — refonte ciblée : accroche contact, identité, menus EXPLORER / INFOS /
// SUIVRE (colonnes desktop, accordéons mobile), barre légale discrète.
// Les liens Nouveautés / Petits prix réutilisent le filtre catégorie existant de
// la Boutique (query param ?category=, strictement identique à une sélection manuelle).
// Textes CTA / présentation / URL Instagram administrables (Contenu du site > Footer).

export const Footer = () => {
  const { t, lang } = useLang();
  const { content } = useContent();
  const f = t.footer;
  const fb = content?.footer || {};
  const cms = (k, fallback) => (lang === "fr" ? fb[k] : fb[lang]?.[k]) || fallback;
  const INSTAGRAM_URL = fb.instagram_url || "https://www.instagram.com/moulin_comics/";
  const linkCls = "hover:text-comicyellow transition-colors";
  const menus = [
    {
      title: f.explore, tid: "explore",
      links: [
        { to: "/shop", label: t.nav.shop, tid: "footer-explore-shop" },
        { to: "/shop?category=Nouveauté", label: f.newArrivals, tid: "footer-explore-nouveautes" },
        { to: "/shop?category=Petits prix", label: f.cheap, tid: "footer-explore-petits-prix" },
        { to: "/conventions", label: f.agenda, tid: "footer-explore-salons" },
      ],
    },
    {
      title: f.infos, tid: "infos",
      links: [
        { to: "/politique-livraison", label: f.delivery, tid: "footer-info-livraison" },
        { to: "/faq", label: "FAQ", tid: "footer-info-faq" },
        { to: "/contact", label: t.nav.contact, tid: "footer-info-contact" },
      ],
    },
    { title: f.follow, tid: "follow", instagram: true },
  ];

  const MenuLinks = ({ links }) => (
    <ul className="space-y-2 font-mono text-sm">
      {links.map((l) => <li key={l.tid}><Link to={l.to} data-testid={l.tid} className={linkCls}>{l.label}</Link></li>)}
    </ul>
  );
  const InstagramLink = () => (
    <ul className="space-y-2 font-mono text-sm">
      <li><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" data-testid="footer-instagram" className={linkCls}>Instagram ↗</a></li>
    </ul>
  );

  return (
  <footer className="bg-ink text-paper mt-24">
    {/* Bloc d'accroche */}
    <div className="border-b border-paper/15" data-testid="footer-cta">
      <div className="max-w-[1400px] mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="font-display font-black tracking-tight text-2xl sm:text-3xl" data-testid="footer-cta-title">{cms("cta_title", f.ctaTitle)}</p>
          <p className="font-mono text-sm text-paper/60 mt-2" data-testid="footer-cta-text">{cms("cta_text", f.ctaSub)}</p>
        </div>
        <Link to="/contact" data-testid="footer-cta-contact"
          className="shrink-0 font-mono text-xs uppercase tracking-widest border-2 border-paper px-5 py-3 hover:bg-comicyellow hover:text-ink hover:border-comicyellow transition-colors">
          {cms("cta_button", f.ctaLink)} →
        </Link>
      </div>
    </div>

    <div className="max-w-[1400px] mx-auto px-6 py-12">
      <div className="mb-10">
        <h3 className="font-anton text-4xl leading-none">MOULIN<br/>COMICS</h3>
        <p className="font-mono text-sm text-paper/60 mt-3" data-testid="footer-baseline">{cms("baseline", f.baseline)}</p>
      </div>

      {/* Desktop : 3 colonnes */}
      <div className="hidden sm:grid sm:grid-cols-3 gap-10" data-testid="footer-menus-desktop">
        {menus.map((m) => (
          <nav key={m.tid}>
            <p className="font-mono uppercase tracking-[0.2em] text-paper/40 text-xs mb-4">{m.title}</p>
            {m.instagram ? <InstagramLink /> : <MenuLinks links={m.links} />}
          </nav>
        ))}
      </div>

      {/* Mobile : accordéons (composant accordéon existant du projet) */}
      <div className="sm:hidden" data-testid="footer-menus-mobile">
        <Accordion type="multiple">
          {menus.map((m) => (
            <AccordionItem key={m.tid} value={m.tid} className="border-paper/15">
              <AccordionTrigger data-testid={`footer-acc-${m.tid}`}
                className="font-mono uppercase tracking-[0.2em] text-xs text-paper/70 hover:no-underline py-3">
                {m.title}
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                {m.instagram ? <InstagramLink /> : <MenuLinks links={m.links} />}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>

    {/* Barre légale */}
    <div className="border-t border-paper/15 py-4 text-center font-mono text-xs text-paper/40">
      © {new Date().getFullYear()} MOULIN COMICS
      {" · "}
      <Link to="/mentions-legales" data-testid="footer-legal" className="hover:text-comicyellow">{f.legalMentions}</Link>
      {" · "}
      <Link to="/cgv" data-testid="footer-cgv" className="hover:text-comicyellow">CGV</Link>
      {" · "}
      <Link to="/politique-livraison" data-testid="footer-shipping-policy" className="hover:text-comicyellow">{t.pages?.shippingTitle || "Politique de livraison"}</Link>
      {" · "}
      <button onClick={() => window.dispatchEvent(new Event("open-cookie-consent"))}
        data-testid="cookie-reopen" className="hover:text-comicyellow">
        {t.cookie.reopen}
      </button>
      {" · "}
      <Link to="/admin" data-testid="footer-admin" className="hover:text-comicyellow">ADMIN</Link>
    </div>
  </footer>
  );
};
