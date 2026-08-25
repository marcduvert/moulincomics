import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Menu, Globe } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useLang, LANGS } from "../context/LanguageContext";
import { useState } from "react";

export const Header = () => {
  const { count, setOpen } = useCart();
  const { t, lang, setLang } = useLang();
  const nav = useNavigate();
  const [m, setM] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const links = [
    { to: "/shop", label: t.nav.shop },
    { to: "/shop?category=VO", label: t.nav.vo },
    { to: "/shop?category=VF", label: t.nav.vf },
    { to: "/conventions", label: t.nav.salons },
  ];
  return (
    <header className="sticky top-0 z-50 bg-paper border-b-2 border-ink">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" data-testid="logo-link" className="flex items-center gap-2.5 shrink-0">
          <img src="/logo.png" alt="Moulin Comics" className="h-11 w-auto object-contain" />
          <span className="font-display font-black tracking-tighter text-lg hidden sm:block">MOULIN COMICS</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 font-mono text-xs uppercase tracking-[0.15em]">
          {links.map((l) => (
            <Link key={l.label} to={l.to} data-testid={`nav-${l.label}`}
              className="hover:text-comicred transition-colors">{l.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button data-testid="lang-toggle" onClick={() => setLangOpen(!langOpen)}
              className="border-2 border-ink px-2.5 py-1.5 flex items-center gap-1.5 font-mono text-xs uppercase hover:bg-ink hover:text-paper transition-colors">
              <Globe size={14} /> {lang}
            </button>
            {langOpen && (
              <div className="absolute right-0 mt-1 bg-paper border-2 border-ink z-50" onMouseLeave={() => setLangOpen(false)}>
                {LANGS.map((l) => (
                  <button key={l.code} data-testid={`lang-${l.code}`}
                    onClick={() => { setLang(l.code); setLangOpen(false); }}
                    className={`block w-full text-left px-4 py-2 font-mono text-xs uppercase hover:bg-comicyellow transition-colors ${lang === l.code ? "bg-ink text-paper" : ""}`}>
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button data-testid="cart-toggle" onClick={() => setOpen(true)}
            className="relative border-2 border-ink px-3 py-1.5 flex items-center gap-2 hover:bg-ink hover:text-paper transition-colors group">
            <ShoppingBag size={16} />
            <span className="font-mono text-xs">{count}</span>
          </button>
          <button className="md:hidden" onClick={() => setM(!m)} data-testid="mobile-menu">
            <Menu size={22} />
          </button>
        </div>
      </div>
      {m && (
        <div className="md:hidden border-t-2 border-ink bg-paper px-6 py-4 flex flex-col gap-4 font-mono text-sm uppercase">
          {links.map((l) => (
            <button key={l.label} onClick={() => { nav(l.to); setM(false); }} className="text-left">{l.label}</button>
          ))}
        </div>
      )}
    </header>
  );
};
