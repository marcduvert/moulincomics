import { useState } from "react";
import { HelpCircle, X, FileText } from "lucide-react";

const GUIDES = [
  {
    title: "Guide Administration",
    desc: "Stock, Commandes, Séries, Catégories, Salons, Livraison et Vacances.",
    href: "/guides/Guide_Administration_Moulin_Comics.pdf",
    testid: "help-open-admin-guide",
  },
  {
    title: "Guide Contenu du site",
    desc: "Accueil, La Maison, Salons, Footer, Contact, pages légales, FAQ et SEO.",
    href: "/guides/Guide_Administration_contenu_Moulin_Comics.pdf",
    testid: "help-open-content-guide",
  },
];

export const AdminHelp = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} data-testid="admin-help-btn"
        className="flex items-center gap-2 border border-paper/40 px-3 py-1.5 font-mono text-xs uppercase hover:bg-comicyellow hover:text-ink transition-colors">
        <HelpCircle size={14} /> Aide
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] bg-ink/60 flex items-center justify-center p-4"
          data-testid="admin-help-modal" onClick={() => setOpen(false)}>
          <div className="bg-paper text-ink border-2 border-ink rounded-md w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between bg-ink text-paper px-5 py-3">
              <span className="font-mono text-sm uppercase tracking-widest">Aide — Guides d'administration</span>
              <button onClick={() => setOpen(false)} data-testid="admin-help-close" className="hover:text-comicyellow">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {GUIDES.map((g) => (
                <div key={g.href} className="border-2 border-ink rounded-md p-4">
                  <p className="font-display font-black text-lg uppercase">{g.title}</p>
                  <p className="font-mono text-xs text-inksoft mt-1 mb-3">{g.desc}</p>
                  <a href={g.href} target="_blank" rel="noreferrer" data-testid={g.testid}
                    className="inline-flex items-center gap-2 bg-ink text-paper font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink hover:bg-comicred transition-colors">
                    <FileText size={14} /> Ouvrir le guide
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
