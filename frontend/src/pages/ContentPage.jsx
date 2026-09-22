import { useContent } from "../context/ContentContext";
import { Seo } from "../components/Seo";
import { sanitizeHtml } from "../lib/richText";

// Pages publiques de contenu administrable. Le HTML provient de site_content
// (modifiable dans l'admin) et est assaini avant affichage (sanitizeHtml).
const PAGES = {
  "mentions-legales": {
    title: "Mentions légales & Politique de confidentialité",
    seoTitle: "Mentions légales & Politique de confidentialité | Moulin Comics",
    seoDesc: "Mentions légales et politique de confidentialité de Moulin Comics : éditeur, hébergement, données personnelles, cookies et droits RGPD.",
    get: (c) => c?.legal?.mentions,
  },
  "cgv": {
    title: "Conditions générales de vente",
    seoTitle: "Conditions générales de vente | Moulin Comics",
    seoDesc: "Conditions générales de vente de Moulin Comics : commande, paiement sécurisé, livraison, rétractation et garanties légales.",
    get: (c) => c?.legal?.cgv,
  },
  "politique-livraison": {
    title: "Politique de livraison",
    seoTitle: "Politique de livraison | Moulin Comics",
    seoDesc: "Politique de livraison de Moulin Comics : livraison à domicile et Point Relais Mondial Relay, tarifs, zones, délais et suivi.",
    get: (c) => c?.shipping?.policy,
  },
};

export const ContentPage = ({ pageKey }) => {
  const { content } = useContent();
  const page = PAGES[pageKey];
  if (!page) return null;
  const html = page.get(content) || "";
  return (
    <div className="max-w-3xl mx-auto px-5 py-14" data-testid={`page-${pageKey}`}>
      <Seo title={page.seoTitle} description={page.seoDesc} path={`/${pageKey}`} />
      <h1 className="font-display font-black tracking-tighter text-3xl sm:text-4xl mb-8">{page.title}</h1>
      <div data-testid="content-page-body"
        className="font-mono text-sm leading-relaxed text-ink [&_h2]:font-display [&_h2]:font-black [&_h2]:tracking-tight [&_h2]:text-xl [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_li]:mb-1 [&_a]:underline [&_a]:text-comicblue"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
    </div>
  );
};
