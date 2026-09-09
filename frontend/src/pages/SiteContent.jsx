import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Save, Upload, Loader2, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { api } from "../lib/api";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const TABS = [["hero", "Accueil"], ["maison", "La Maison"], ["salons", "Salons"], ["footer", "Footer"]];

const Field = ({ label, value, onChange, textarea, placeholder }) => (
  <div className="mb-4">
    <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">{label}</label>
    {textarea
      ? <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={4} placeholder={placeholder}
          className="w-full border-2 border-ink rounded-md px-3 py-2 bg-papersoft font-mono text-sm outline-none" />
      : <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full border-2 border-ink rounded-md px-3 py-2 bg-papersoft font-mono text-sm outline-none" />}
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

export default function SiteContent() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("hero");
  const [c, setC] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/auth/me").then(() => {
      setReady(true);
      api.get("/content").then((r) => setC(r.data));
    }).catch(() => nav("/admin/login"));
  }, [nav]);

  const setSection = (sec, obj) => setC((prev) => ({ ...prev, [sec]: obj }));
  const patch = (sec, k, v) => setC((prev) => ({ ...prev, [sec]: { ...prev[sec], [k]: v } }));

  const save = async (sec) => {
    setSaving(true);
    try {
      const { data } = await api.put(`/admin/content/${sec}`, c[sec]);
      setC(data);
      toast.success("Modifications enregistrées");
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
    finally { setSaving(false); }
  };

  if (!ready || !c) return <div className="min-h-screen bg-ink text-paper flex items-center justify-center font-mono text-sm">Chargement…</div>;

  const SaveBar = ({ sec }) => (
    <div className="flex gap-2 mt-2">
      <button onClick={() => save(sec)} disabled={saving} data-testid={`save-${sec}`}
        className="flex items-center gap-2 bg-ink text-paper font-mono text-xs uppercase tracking-widest px-5 py-3 rounded-md border-2 border-ink hover:bg-comicred transition-colors disabled:opacity-40">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Enregistrer
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

  return (
    <div className="min-h-screen bg-papersoft">
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
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`content-tab-${k}`}
              className={`font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink ${tab === k ? "bg-ink text-paper" : "bg-paper"}`}>{l}</button>
          ))}
        </div>

        <div className="bg-paper border-2 border-ink rounded-md p-6">
          {tab === "hero" && (
            <>
              <h2 className="font-display font-black text-xl mb-4">Page d'accueil — Hero</h2>
              <Field label="Petit texte au-dessus du titre (eyebrow)" value={c.hero.eyebrow} onChange={(v) => patch("hero", "eyebrow", v)} />
              <Field label="Grand titre (une ligne = un retour à la ligne ; la dernière ligne est en rouge)" textarea value={c.hero.title} onChange={(v) => patch("hero", "title", v)} />
              <Field label="Texte de présentation" textarea value={c.hero.description} onChange={(v) => patch("hero", "description", v)} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Bouton principal — texte" value={c.hero.primary_text} onChange={(v) => patch("hero", "primary_text", v)} />
                <Field label="Bouton principal — lien" value={c.hero.primary_url} onChange={(v) => patch("hero", "primary_url", v)} placeholder="/shop" />
                <Field label="Deuxième bouton — texte" value={c.hero.secondary_text} onChange={(v) => patch("hero", "secondary_text", v)} />
                <Field label="Deuxième bouton — lien" value={c.hero.secondary_url} onChange={(v) => patch("hero", "secondary_url", v)} placeholder="/shop?series=..." />
              </div>
              <ImageField label="Image principale" value={c.hero.image} onChange={(v) => patch("hero", "image", v)} />
              <SaveBar sec="hero" />
            </>
          )}

          {tab === "maison" && (
            <>
              <h2 className="font-display font-black text-xl mb-4">Section « La Maison » — 3 blocs</h2>
              {(c.maison.blocks || []).map((b, i) => (
                <div key={i} className="border-2 border-ink rounded-md p-4 mb-4">
                  <p className="font-mono text-[10px] uppercase text-comicred mb-2">Bloc {i + 1}</p>
                  <div className="grid sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-1"><Field label="Numéro" value={b.n} onChange={(v) => { const bl = [...c.maison.blocks]; bl[i] = { ...bl[i], n: v }; setSection("maison", { blocks: bl }); }} /></div>
                    <div className="sm:col-span-3"><Field label="Titre" value={b.title} onChange={(v) => { const bl = [...c.maison.blocks]; bl[i] = { ...bl[i], title: v }; setSection("maison", { blocks: bl }); }} /></div>
                  </div>
                  <Field label="Texte" textarea value={b.text} onChange={(v) => { const bl = [...c.maison.blocks]; bl[i] = { ...bl[i], text: v }; setSection("maison", { blocks: bl }); }} />
                </div>
              ))}
              <SaveBar sec="maison" />
            </>
          )}

          {tab === "salons" && (
            <>
              <h2 className="font-display font-black text-xl mb-4">Section « Salons » (accueil)</h2>
              <Field label="Petit texte (eyebrow)" value={c.salons.eyebrow} onChange={(v) => patch("salons", "eyebrow", v)} />
              <Field label="Titre principal" textarea value={c.salons.title} onChange={(v) => patch("salons", "title", v)} />
              <Field label="Texte de présentation" textarea value={c.salons.description} onChange={(v) => patch("salons", "description", v)} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Bouton — texte" value={c.salons.button_text} onChange={(v) => patch("salons", "button_text", v)} />
                <Field label="Bouton — lien" value={c.salons.button_url} onChange={(v) => patch("salons", "button_url", v)} placeholder="/conventions" />
              </div>
              <ImageField label="Image principale" value={c.salons.image} onChange={(v) => patch("salons", "image", v)} />

              <div className="border-t-2 border-ink/15 mt-6 pt-6">
                <h3 className="font-display font-bold text-lg mb-3">Bandeau des villes</h3>
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
              </div>
              <div className="mt-6"><SaveBar sec="salons" /></div>
            </>
          )}

          {tab === "footer" && (
            <>
              <h2 className="font-display font-black text-xl mb-4">Footer</h2>
              <Field label="Présentation courte" textarea value={c.footer.description} onChange={(v) => patch("footer", "description", v)} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Adresse" value={c.footer.address} onChange={(v) => patch("footer", "address", v)} />
                <Field label="Email" value={c.footer.email} onChange={(v) => patch("footer", "email", v)} />
                <Field label="Téléphone" value={c.footer.phone} onChange={(v) => patch("footer", "phone", v)} />
                <Field label="Réseaux sociaux (texte)" value={c.footer.social} onChange={(v) => patch("footer", "social", v)} />
              </div>
              <SaveBar sec="footer" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
