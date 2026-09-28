import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Save, Upload, Loader2, Plus, Trash2, ArrowUp, ArrowDown, Languages } from "lucide-react";
import { api } from "../lib/api";
import { Seo } from "../components/Seo";
import { RichEditor } from "../components/RichEditor";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const TABS = [["hero", "Accueil"], ["maison", "La Maison"], ["salons", "Salons"], ["footer", "Footer"], ["contact", "Contact"], ["legal", "Pages légales"], ["faq", "FAQ"], ["seo", "SEO"]];
const FAQ_CATEGORIES = ["Les comics", "Commande & paiement", "Livraison", "Retours & remboursements", "Moulin Comics"];
const LANGS = [["fr", "Français"], ["en", "English"], ["es", "Español"]];

const Field = ({ label, value, onChange, textarea, placeholder, count, testid }) => (
  <div className="mb-4">
    <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">{label}</label>
    {textarea
      ? <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={4} placeholder={placeholder}
          data-testid={testid}
          className="w-full border-2 border-ink rounded-md px-3 py-2 bg-papersoft font-mono text-sm outline-none" />
      : <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          data-testid={testid}
          className="w-full border-2 border-ink rounded-md px-3 py-2 bg-papersoft font-mono text-sm outline-none" />}
    {count && (
      <p className={`font-mono text-[10px] mt-1 ${(value || "").length > count ? "text-comicred" : "text-inksoft"}`}>
        {(value || "").length} caractères (repère ~{count})
      </p>
    )}
  </div>
);

const ImageField = ({ label, value, onChange }) => {
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/admin/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange(`${BACKEND}${data.url}`);
      toast.success("Image chargée");
    } catch (e) { toast.error(e.response?.data?.detail || "Échec de l'upload"); }
    finally { setBusy(false); }
  };
  return (
    <div className="mb-4">
      <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-24 h-28 border-2 border-ink bg-papersoft overflow-hidden flex items-center justify-center shrink-0">
          {value ? <img src={value} alt="" className="w-full h-full object-cover" /> : <span className="text-[9px] text-inksoft text-center px-1">Image par défaut</span>}
        </div>
        <div>
          <label className="cursor-pointer inline-flex items-center gap-2 border-2 border-ink rounded-md px-4 py-2 font-mono text-xs uppercase hover:bg-papersoft transition-colors">
            {busy ? <><Loader2 size={14} className="animate-spin" /> …</> : <><Upload size={14} /> Changer l'image</>}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy}
              onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {value && <button onClick={() => onChange("")} className="block mt-2 font-mono text-[10px] uppercase underline text-comicred">Réinitialiser</button>}
        </div>
      </div>
    </div>
  );
};

const VideoField = ({ label, value, onChange }) => {
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/admin/upload-video", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange(`${BACKEND}${data.url}`);
      toast.success("Vidéo chargée");
    } catch (e) { toast.error(e.response?.data?.detail || "Échec de l'upload"); }
    finally { setBusy(false); }
  };
  return (
    <div className="mb-4">
      <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-24 h-28 border-2 border-ink bg-ink overflow-hidden flex items-center justify-center shrink-0">
          {value ? <video src={value} muted playsInline className="w-full h-full object-cover" /> : <span className="text-[9px] text-paper/70 text-center px-1">Aucune vidéo</span>}
        </div>
        <div>
          <label className="cursor-pointer inline-flex items-center gap-2 border-2 border-ink rounded-md px-4 py-2 font-mono text-xs uppercase hover:bg-papersoft transition-colors">
            {busy ? <><Loader2 size={14} className="animate-spin" /> …</> : <><Upload size={14} /> Charger une vidéo</>}
            <input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" className="hidden" disabled={busy}
              data-testid="salons-video-upload" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {value && <button onClick={() => onChange("")} className="block mt-2 font-mono text-[10px] uppercase underline text-comicred">Retirer la vidéo</button>}
          <p className="text-[10px] text-inksoft mt-1">mp4, webm, mov · max 60 Mo</p>
        </div>
      </div>
    </div>
  );
};

export default function SiteContent() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("hero");
  const [lang, setLang] = useState("fr");
  const [c, setC] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/auth/me").then(() => {
      setReady(true);
      api.get("/content").then((r) => setC(r.data));
    }).catch(() => nav("/admin/login"));
  }, [nav]);

  const patch = (sec, k, v) => setC((prev) => ({ ...prev, [sec]: { ...prev[sec], [k]: v } }));
  const val = (sec, k) => (lang === "fr" ? c?.[sec]?.[k] : c?.[sec]?.[lang]?.[k]) ?? "";
  const ph = (sec, k) => (lang === "fr" ? undefined : (c?.[sec]?.[k] || ""));
  const setField = (sec, k, v) => {
    if (lang === "fr") patch(sec, k, v);
    else patch(sec, lang, { ...(c[sec]?.[lang] || {}), [k]: v });
  };

  const save = async (sec) => {
    setSaving(true);
    try {
      const url = lang === "fr" ? `/admin/content/${sec}` : `/admin/content/${sec}/${lang}`;
      const body = lang === "fr" ? c[sec] : (c[sec]?.[lang] || {});
      const { data } = await api.put(url, body);
      setC(data);
      toast.success(lang === "fr" ? "Modifications enregistrées" : `Traduction ${lang.toUpperCase()} enregistrée`);
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    finally { setSaving(false); }
  };

  if (!ready || !c) return <div className="min-h-screen bg-ink text-paper flex items-center justify-center font-mono text-sm">Chargement…</div>;

  // FAQ : chaque entrée porte ses 3 langues (question_fr/en/es, answer_fr/en/es),
  // l'onglet ignore donc le sélecteur de langue et enregistre toujours la section complète.
  const faqItems = (c.faq?.items || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const setFaqItems = (items) => setC((p) => ({ ...p, faq: { ...(p.faq || {}), items } }));
  const updFaq = (i, k, v) => { const arr = faqItems.map((it) => ({ ...it })); arr[i][k] = v; setFaqItems(arr); };
  const moveFaq = (i, d) => {
    const arr = faqItems.map((it) => ({ ...it })); const j = i + d;
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i].order ?? i; arr[i].order = arr[j].order ?? j; arr[j].order = tmp;
    setFaqItems(arr);
  };
  const addFaq = () => setFaqItems([...faqItems, {
    category: FAQ_CATEGORIES[0], question_fr: "", answer_fr: "", question_en: "", answer_en: "",
    question_es: "", answer_es: "", order: faqItems.reduce((m, it) => Math.max(m, it.order ?? 0), 0) + 1, active: true,
  }]);
  const saveFaq = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/admin/content/faq", { items: c.faq?.items || [] });
      setC(data);
      toast.success("FAQ enregistrée");
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    finally { setSaving(false); }
  };

  const SaveBar = ({ sec }) => (
    <div className="flex gap-2 mt-2 flex-wrap">
      <button onClick={() => save(sec)} disabled={saving} data-testid={`save-${sec}`}
        className="flex items-center gap-2 bg-ink text-paper font-mono text-xs uppercase tracking-widest px-5 py-3 rounded-md border-2 border-ink hover:bg-comicred transition-colors disabled:opacity-40">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        Enregistrer{lang !== "fr" ? ` (${lang.toUpperCase()})` : ""}
      </button>
      <a href="/" target="_blank" rel="noreferrer" className="flex items-center font-mono text-xs uppercase px-4 py-3 border-2 border-ink rounded-md hover:bg-papersoft">Voir le site ↗</a>
    </div>
  );

  const villes = c.villes || [];
  const moveVille = (i, d) => {
    const arr = [...villes]; const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; setC((p) => ({ ...p, villes: arr }));
  };

  const mblocks = lang === "fr" ? (c.maison?.blocks || []) : (c.maison?.[lang]?.blocks || c.maison?.blocks || []);
  const setBlocks = (bl) => {
    if (lang === "fr") patch("maison", "blocks", bl);
    else patch("maison", lang, { ...(c.maison?.[lang] || {}), blocks: bl });
  };
  const frImg = (sec) => c?.[sec]?.image || "";

  return (
    <div className="min-h-screen bg-papersoft">
      <Seo title="Contenu du site | Moulin Comics" noindex />
      <header className="bg-ink text-paper border-b-2 border-ink sticky top-0 z-40">
        <div className="max-w-[1100px] mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-comicred font-anton px-2 py-0.5">MC</span>
            <span className="font-mono text-sm uppercase tracking-widest">Contenu du site</span>
          </div>
          <button onClick={() => nav("/admin")} data-testid="back-admin" className="flex items-center gap-2 border border-paper/40 px-3 py-1.5 font-mono text-xs uppercase hover:bg-comicred transition-colors">
            <ArrowLeft size={14} /> Admin
          </button>
        </div>
      </header>

      <div className="max-w-[1100px] mx-auto px-5 py-8">
        <div className="flex flex-wrap gap-2 mb-4">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`content-tab-${k}`}
              className={`font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink ${tab === k ? "bg-ink text-paper" : "bg-paper"}`}>{l}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6" data-testid="content-lang-switcher">
          <span className="font-mono text-[10px] uppercase tracking-widest text-inksoft flex items-center gap-1">
            <Languages size={12} /> Langue du contenu
          </span>
          {LANGS.map(([code, label]) => (
            <button key={code} onClick={() => setLang(code)} data-testid={`content-lang-${code}`}
              className={`font-mono text-xs uppercase tracking-widest px-3 py-1.5 rounded-md border-2 border-ink ${lang === code ? "bg-comicred text-paper" : "bg-paper"}`}>{label}</button>
          ))}
        </div>
        {lang !== "fr" && (
          <p className="font-mono text-xs text-inksoft mb-4 border-l-2 border-comicred pl-3" data-testid="lang-note">
            Vous éditez la traduction {lang.toUpperCase()}. Les champs laissés vides reprennent automatiquement le texte français, rappelé en grisé dans chaque champ.
          </p>
        )}

        <div className="bg-paper border-2 border-ink rounded-md p-6">
          {tab === "hero" && (
            <>
              <h2 className="font-display font-black text-xl mb-4">Page d'accueil — Hero</h2>
              <Field label="Petit texte au-dessus du titre (eyebrow)" value={val("hero", "eyebrow")} onChange={(v) => setField("hero", "eyebrow", v)} placeholder={ph("hero", "eyebrow")} />
              <Field label="Grand titre (une ligne = un retour à la ligne ; la dernière ligne est en rouge)" textarea value={val("hero", "title")} onChange={(v) => setField("hero", "title", v)} placeholder={ph("hero", "title")} />
              <Field label="Texte de présentation" textarea value={val("hero", "description")} onChange={(v) => setField("hero", "description", v)} placeholder={ph("hero", "description")} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Bouton principal — texte" value={val("hero", "primary_text")} onChange={(v) => setField("hero", "primary_text", v)} placeholder={ph("hero", "primary_text")} />
                <Field label="Bouton principal — lien" value={val("hero", "primary_url")} onChange={(v) => setField("hero", "primary_url", v)} placeholder={ph("hero", "primary_url") || "/shop"} />
                <Field label="Deuxième bouton — texte" value={val("hero", "secondary_text")} onChange={(v) => setField("hero", "secondary_text", v)} placeholder={ph("hero", "secondary_text")} />
                <Field label="Deuxième bouton — lien" value={val("hero", "secondary_url")} onChange={(v) => setField("hero", "secondary_url", v)} placeholder={ph("hero", "secondary_url") || "/shop?series=..."} />
              </div>
              <ImageField label="Image principale" value={val("hero", "image") || (lang !== "fr" ? frImg("hero") : "")} onChange={(v) => setField("hero", "image", v)} />
              <SaveBar sec="hero" />
            </>
          )}

          {tab === "maison" && (
            <>
              <h2 className="font-display font-black text-xl mb-4">Section « La Maison » — titre + 3 blocs</h2>
              <Field label="Titre de la section (affiché sur la home)" value={val("maison", "title")} onChange={(v) => setField("maison", "title", v)} placeholder={ph("maison", "title")} />
              {mblocks.map((b, i) => (
                <div key={i} className="border-2 border-ink rounded-md p-4 mb-4">
                  <p className="font-mono text-[10px] uppercase text-comicred mb-2">Bloc {i + 1}</p>
                  <div className="grid sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-1"><Field label="Numéro" value={b.n} onChange={(v) => { const bl = [...mblocks]; bl[i] = { ...bl[i], n: v }; setBlocks(bl); }} /></div>
                    <div className="sm:col-span-3"><Field label="Titre" value={b.title} onChange={(v) => { const bl = [...mblocks]; bl[i] = { ...bl[i], title: v }; setBlocks(bl); }} /></div>
                  </div>
                  <Field label="Texte" textarea value={b.text} onChange={(v) => { const bl = [...mblocks]; bl[i] = { ...bl[i], text: v }; setBlocks(bl); }} />
                </div>
              ))}
              <SaveBar sec="maison" />
            </>
          )}

          {tab === "salons" && (
            <>
              <h2 className="font-display font-black text-xl mb-4">Section « Salons » (accueil)</h2>
              <Field label="Petit texte (eyebrow)" value={val("salons", "eyebrow")} onChange={(v) => setField("salons", "eyebrow", v)} placeholder={ph("salons", "eyebrow")} />
              <Field label="Titre principal" textarea value={val("salons", "title")} onChange={(v) => setField("salons", "title", v)} placeholder={ph("salons", "title")} />
              <Field label="Texte de présentation" textarea value={val("salons", "description")} onChange={(v) => setField("salons", "description", v)} placeholder={ph("salons", "description")} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Bouton — texte" value={val("salons", "button_text")} onChange={(v) => setField("salons", "button_text", v)} placeholder={ph("salons", "button_text")} />
                <Field label="Bouton — lien" value={val("salons", "button_url")} onChange={(v) => setField("salons", "button_url", v)} placeholder={ph("salons", "button_url") || "/conventions"} />
              </div>
              <ImageField label="Image principale" value={val("salons", "image") || (lang !== "fr" ? frImg("salons") : "")} onChange={(v) => setField("salons", "image", v)} />

              <div className="border-t-2 border-ink/15 mt-6 pt-6">
                <h3 className="font-display font-bold text-lg mb-3">Bandeau des villes</h3>
                {lang === "fr" ? (
                  <>
                    {villes.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <input value={v} onChange={(e) => { const arr = [...villes]; arr[i] = e.target.value; setC((p) => ({ ...p, villes: arr })); }}
                          data-testid={`ville-${i}`} className="flex-1 border-2 border-ink rounded-md px-3 py-2 bg-papersoft font-mono text-sm outline-none" />
                        <button onClick={() => moveVille(i, -1)} className="border border-ink p-2 rounded"><ArrowUp size={12} /></button>
                        <button onClick={() => moveVille(i, 1)} className="border border-ink p-2 rounded"><ArrowDown size={12} /></button>
                        <button onClick={() => setC((p) => ({ ...p, villes: villes.filter((_, j) => j !== i) }))} className="text-comicred p-2"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <button onClick={() => setC((p) => ({ ...p, villes: [...villes, "NOUVELLE VILLE"] }))} data-testid="add-ville"
                      className="flex items-center gap-2 mt-2 font-mono text-xs uppercase border-2 border-ink px-3 py-2 rounded-md hover:bg-papersoft"><Plus size={13} /> Ajouter une ville</button>
                    <div className="mt-4"><button onClick={() => save("villes")} disabled={saving} data-testid="save-villes"
                      className="flex items-center gap-2 bg-comicblue text-paper font-mono text-xs uppercase tracking-widest px-5 py-3 rounded-md border-2 border-ink hover:bg-ink transition-colors disabled:opacity-40">
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Enregistrer les villes</button></div>
                  </>
                ) : (
                  <p className="font-mono text-xs text-inksoft" data-testid="villes-shared-note">
                    Le bandeau des villes est commun à toutes les langues. Passez en « Français » pour le modifier.
                  </p>
                )}
              </div>
              <div className="border-t-2 border-ink mt-6 pt-6">
                <h3 className="font-display font-black text-lg mb-1">Vidéo — L'œil du Moulin</h3>
                <p className="font-mono text-[10px] text-inksoft mb-4">Section éditoriale affichée sous l'agenda de la page Salons.</p>
                {lang === "fr" ? (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer mb-4">
                      <input type="checkbox" data-testid="salons-video-enabled" checked={!!c.salons?.video_enabled}
                        onChange={(e) => patch("salons", "video_enabled", e.target.checked)} />
                      <span className="font-mono text-xs uppercase tracking-widest">Afficher la vidéo</span>
                    </label>
                    <VideoField label="Vidéo (verticale recommandée)" value={c.salons?.video_url || ""} onChange={(v) => patch("salons", "video_url", v)} />
                    <ImageField label="Image d'aperçu / poster (facultatif)" value={c.salons?.video_poster || ""} onChange={(v) => patch("salons", "video_poster", v)} />
                    <Field label="Lien Instagram (facultatif — s'ouvre dans un nouvel onglet)" value={c.salons?.video_instagram || ""} onChange={(v) => patch("salons", "video_instagram", v)} placeholder="https://www.instagram.com/…" />
                  </>
                ) : (
                  <p className="font-mono text-xs text-inksoft mb-4" data-testid="salons-video-shared-note">
                    La vidéo, le poster, le réglage d'affichage et le lien Instagram sont communs à toutes les langues. Passez en « Français » pour les modifier.
                  </p>
                )}
                <Field label="Surtitre" value={val("salons", "video_eyebrow")} onChange={(v) => setField("salons", "video_eyebrow", v)} placeholder={ph("salons", "video_eyebrow")} />
                <Field label="Titre" value={val("salons", "video_title")} onChange={(v) => setField("salons", "video_title", v)} placeholder={ph("salons", "video_title")} />
                <Field label="Texte" textarea value={val("salons", "video_text")} onChange={(v) => setField("salons", "video_text", v)} placeholder={ph("salons", "video_text")} />
              </div>
              <div className="mt-6"><SaveBar sec="salons" /></div>
            </>
          )}

          {tab === "contact" && (
            <>
              <h2 className="font-display font-black text-xl mb-2">Page Contact</h2>
              <p className="font-mono text-xs text-inksoft mb-5 border-l-2 border-comicred pl-3">
                Photo et textes affichés sur la page Contact. Laissés vides, le texte par défaut du site est utilisé.
              </p>
              <ImageField label="Photo (affichée en haut du formulaire)" value={val("contact", "photo") || (lang !== "fr" ? frImg("contact") : "")} onChange={(v) => setField("contact", "photo", v)} />
              <Field label="Texte en haut du formulaire" textarea value={val("contact", "top_text")} onChange={(v) => setField("contact", "top_text", v)} placeholder={ph("contact", "top_text")} />
              <Field label="Texte en bas du formulaire" textarea value={val("contact", "bottom_text")} onChange={(v) => setField("contact", "bottom_text", v)} placeholder={ph("contact", "bottom_text")} />
              <SaveBar sec="contact" />
            </>
          )}

          {tab === "legal" && (
            <>
              <h2 className="font-display font-black text-xl mb-2">Pages légales</h2>
              <p className="font-mono text-xs text-inksoft mb-5 border-l-2 border-comicred pl-3">
                Contenus affichés sur les pages publiques /mentions-legales et /cgv (liens discrets en pied de page). Les éléments [À COMPLÉTER : …] sont à renseigner avant la mise en ligne définitive.
              </p>
              <RichEditor label="Mentions légales & Politique de confidentialité" testid="legal-mentions-editor"
                value={val("legal", "mentions")} onChange={(v) => setField("legal", "mentions", v)}
                hint="Page publique : /mentions-legales. Titres, sous-titres, gras, listes et liens possibles ; le contenu est sécurisé automatiquement avant affichage." />
              <RichEditor label="Conditions générales de vente (CGV)" testid="legal-cgv-editor"
                value={val("legal", "cgv")} onChange={(v) => setField("legal", "cgv", v)}
                hint="Page publique : /cgv" />
              <SaveBar sec="legal" />
            </>
          )}

          {tab === "faq" && (
            <>
              <h2 className="font-display font-black text-xl mb-2">FAQ — page publique /faq</h2>
              <p className="font-mono text-xs text-inksoft mb-5 border-l-2 border-comicred pl-3">
                Chaque question porte ses trois langues ci-dessous (le sélecteur de langue en haut ne s'applique pas à cet onglet).
                Sur le site, seules les entrées « actives » sont affichées, par catégorie puis par ordre.
              </p>
              {faqItems.map((it, i) => (
                <div key={i} className="border-2 border-ink rounded-md p-4 mb-4" data-testid={`faq-item-${i}`}>
                  <div className="flex flex-wrap items-end gap-3 mb-3">
                    <div>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">Catégorie</label>
                      <select value={it.category} onChange={(e) => updFaq(i, "category", e.target.value)} data-testid={`faq-category-${i}`}
                        className="border-2 border-ink rounded-md px-3 py-2 bg-papersoft font-mono text-sm outline-none">
                        {FAQ_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">Ordre</label>
                      <input type="number" value={it.order ?? 0} onChange={(e) => updFaq(i, "order", parseInt(e.target.value) || 0)}
                        data-testid={`faq-order-${i}`}
                        className="w-20 border-2 border-ink rounded-md px-3 py-2 bg-papersoft font-mono text-sm outline-none" />
                    </div>
                    <label className="flex items-center gap-2 font-mono text-xs uppercase cursor-pointer pb-2">
                      <input type="checkbox" checked={it.active !== false} onChange={(e) => updFaq(i, "active", e.target.checked)}
                        data-testid={`faq-active-${i}`} className="w-4 h-4 accent-comicred" /> Actif
                    </label>
                    <div className="flex gap-1 ml-auto pb-1">
                      <button onClick={() => moveFaq(i, -1)} data-testid={`faq-up-${i}`} className="border border-ink p-2 rounded hover:bg-papersoft"><ArrowUp size={12} /></button>
                      <button onClick={() => moveFaq(i, 1)} data-testid={`faq-down-${i}`} className="border border-ink p-2 rounded hover:bg-papersoft"><ArrowDown size={12} /></button>
                      <button onClick={() => setFaqItems(faqItems.filter((_, j) => j !== i))} data-testid={`faq-delete-${i}`} className="text-comicred p-2"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="grid lg:grid-cols-3 gap-4">
                    {["fr", "en", "es"].map((L) => (
                      <div key={L} className="border border-ink/20 rounded-md p-3">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-comicred mb-2">{L === "fr" ? "Français" : L === "en" ? "English" : "Español"}</p>
                        <Field label={`Question ${L.toUpperCase()}`} value={it[`question_${L}`]} onChange={(v) => updFaq(i, `question_${L}`, v)} testid={`faq-q${L}-${i}`} />
                        <RichEditor label={`Réponse ${L.toUpperCase()}`} testid={`faq-a${L}-${i}`}
                          value={it[`answer_${L}`]} onChange={(v) => updFaq(i, `answer_${L}`, v)}
                          hint="Liens internes possibles : /contact, /cgv, /politique-livraison, /conventions" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={addFaq} data-testid="faq-add"
                className="flex items-center gap-2 font-mono text-xs uppercase border-2 border-ink px-4 py-2.5 rounded-md hover:bg-papersoft mb-4">
                <Plus size={13} /> Ajouter une question
              </button>
              <div className="flex gap-2 mt-2 flex-wrap">
                <button onClick={saveFaq} disabled={saving} data-testid="save-faq"
                  className="flex items-center gap-2 bg-ink text-paper font-mono text-xs uppercase tracking-widest px-5 py-3 rounded-md border-2 border-ink hover:bg-comicred transition-colors disabled:opacity-40">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Enregistrer la FAQ
                </button>
                <a href="/faq" target="_blank" rel="noreferrer" className="flex items-center font-mono text-xs uppercase px-4 py-3 border-2 border-ink rounded-md hover:bg-papersoft">Voir la page ↗</a>
              </div>
            </>
          )}

          {tab === "seo" && (
            <>
              <h2 className="font-display font-black text-xl mb-2">SEO — Page d'accueil</h2>
              <p className="font-mono text-xs text-inksoft mb-5 border-l-2 border-comicred pl-3">
                Balises titre et description vues par Google et les réseaux sociaux. Laissés vides, les valeurs par défaut du site sont utilisées.
                Les compteurs sont indicatifs : l'enregistrement n'est jamais bloqué.
              </p>
              <Field label="SEO Title" count={55} testid="seo-title-input" value={val("seo", "seo_title")} onChange={(v) => setField("seo", "seo_title", v)} placeholder={ph("seo", "seo_title")} />
              <Field label="Meta description" textarea count={155} testid="seo-description-input" value={val("seo", "meta_description")} onChange={(v) => setField("seo", "meta_description", v)} placeholder={ph("seo", "meta_description")} />
              <Field label="OG Title (partage réseaux sociaux)" count={55} testid="seo-og-title-input" value={val("seo", "og_title")} onChange={(v) => setField("seo", "og_title", v)} placeholder={ph("seo", "og_title") || "Par défaut : SEO Title"} />
              <Field label="OG Description" textarea count={155} testid="seo-og-description-input" value={val("seo", "og_description")} onChange={(v) => setField("seo", "og_description", v)} placeholder={ph("seo", "og_description") || "Par défaut : Meta description"} />
              <ImageField label="OG Image (partage réseaux sociaux)" value={val("seo", "og_image") || (lang !== "fr" ? frImg("seo") : "")} onChange={(v) => setField("seo", "og_image", v)} />
              <SaveBar sec="seo" />
            </>
          )}

          {tab === "footer" && (
            <>
              <h2 className="font-display font-black text-xl mb-4">Footer</h2>
              <p className="font-mono text-[10px] uppercase tracking-widest text-comicred mb-2">Identité</p>
              <Field label="Texte de présentation" textarea testid="footer-baseline-input" value={val("footer", "baseline")} onChange={(v) => setField("footer", "baseline", v)} placeholder={ph("footer", "baseline")} />
              <p className="font-mono text-[10px] uppercase tracking-widest text-comicred mb-2 mt-6">Bloc contact / accroche</p>
              <Field label="Titre" testid="footer-cta-title-input" value={val("footer", "cta_title")} onChange={(v) => setField("footer", "cta_title", v)} placeholder={ph("footer", "cta_title")} />
              <Field label="Texte" testid="footer-cta-text-input" value={val("footer", "cta_text")} onChange={(v) => setField("footer", "cta_text", v)} placeholder={ph("footer", "cta_text")} />
              <Field label="Texte du bouton (lien vers la page Contact)" testid="footer-cta-button-input" value={val("footer", "cta_button")} onChange={(v) => setField("footer", "cta_button", v)} placeholder={ph("footer", "cta_button")} />
              <p className="font-mono text-[10px] uppercase tracking-widest text-comicred mb-2 mt-6">Coordonnées & Instagram</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Adresse" value={val("footer", "address")} onChange={(v) => setField("footer", "address", v)} placeholder={ph("footer", "address")} />
                <Field label="Email" value={val("footer", "email")} onChange={(v) => setField("footer", "email", v)} placeholder={ph("footer", "email")} />
                <Field label="Téléphone" value={val("footer", "phone")} onChange={(v) => setField("footer", "phone", v)} placeholder={ph("footer", "phone")} />
                <Field label="Instagram — URL (s'ouvre dans un nouvel onglet)" testid="footer-instagram-input" value={val("footer", "instagram_url")} onChange={(v) => setField("footer", "instagram_url", v)} placeholder={ph("footer", "instagram_url") || "https://www.instagram.com/…"} />
              </div>
              <SaveBar sec="footer" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
