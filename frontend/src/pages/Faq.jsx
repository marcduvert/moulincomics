import { Link } from "react-router-dom";
import { useContent } from "../context/ContentContext";
import { useLang } from "../context/LanguageContext";
import { Seo } from "../components/Seo";
import { sanitizeHtml } from "../lib/richText";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../components/ui/accordion";

// Page publique FAQ. Les entrées viennent de site_content.faq.items (admin :
// Contenu du site → FAQ) et portent leurs 3 langues : la langue active
// détermine dynamiquement le champ affiché (repli FR si traduction vide).
const CATS = ["Les comics", "Commande & paiement", "Livraison", "Retours & remboursements", "Moulin Comics"];

export default function Faq() {
  const { content } = useContent();
  const { lang, t } = useLang();
  const p = t.pages || {};
  const items = (content?.faq?.items || [])
    .filter((it) => it.active !== false)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const q = (it) => it[`question_${lang}`] || it.question_fr || "";
  const a = (it) => it[`answer_${lang}`] || it.answer_fr || "";
  const catLabel = (cat) => p.faqCats?.[cat] || cat;
  const byCat = CATS
    .map((cat) => ({ cat, list: items.filter((it) => it.category === cat) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="max-w-3xl mx-auto px-5 py-14" data-testid="page-faq">
      <Seo title={p.faqSeoTitle || "FAQ | Moulin Comics"} description={p.faqSeoDesc || ""} path="/faq" />
      <h1 className="font-display font-black tracking-tighter text-3xl sm:text-4xl mb-4" data-testid="faq-title">
        {p.faqTitle || "FAQ"}
      </h1>
      <p className="font-mono text-sm leading-relaxed text-inksoft mb-10" data-testid="faq-subtitle">{p.faqSub}</p>

      {byCat.map((g, gi) => (
        <section key={g.cat} className="mb-8" data-testid={`faq-category-${gi}`}>
          <h2 className="font-display font-black tracking-tight text-xl mt-10 mb-3">{catLabel(g.cat)}</h2>
          <Accordion type="single" collapsible>
            {g.list.map((it, i) => (
              <AccordionItem key={i} value={`${gi}-${i}`}
                className="border-2 border-ink rounded-md mb-2 px-4 bg-paper">
                <AccordionTrigger data-testid={`faq-question-${gi}-${i}`}
                  className="font-display font-bold text-sm sm:text-base py-4 hover:no-underline hover:text-comicred transition-colors">
                  {q(it)}
                </AccordionTrigger>
                <AccordionContent data-testid={`faq-answer-${gi}-${i}`}
                  className="font-mono text-sm leading-relaxed text-inksoft [&_a]:underline [&_a]:text-comicblue">
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(a(it)) }} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ))}

      <div className="border-2 border-ink rounded-md p-6 mt-12 text-center" data-testid="faq-cta">
        <p className="font-display font-bold text-lg mb-4">{p.faqCtaText}</p>
        <Link to="/contact" data-testid="faq-cta-link"
          className="inline-block bg-ink text-paper font-mono text-xs uppercase tracking-widest px-6 py-3 rounded-md border-2 border-ink hover:bg-comicred transition-colors">
          {p.faqCtaLink}
        </Link>
      </div>
    </div>
  );
}
