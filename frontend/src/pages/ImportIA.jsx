import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { UploadCloud, X, Loader2, Check, AlertTriangle, Trash2, ArrowLeft, Sparkles, CheckCircle2, History, FileDown } from "lucide-react";
import { api } from "../lib/api";
import { Seo } from "../components/Seo";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const CONC = 5;
let SEQ = 0;

const confBadge = (c) => {
  if (c >= 95) return { cls: "bg-green-200 border-ink", label: `🟢 ${c}%` };
  if (c >= 80) return { cls: "bg-comicyellow border-ink", label: `🟡 ${c}%` };
  return { cls: "bg-comicred text-paper border-ink", label: `🔴 ${c}%` };
};

const emptyResult = (data) => ({
  title: data.title === "INCONNU" ? "" : (data.title || ""),
  series: ["INCONNU", "À VÉRIFIER"].includes(data.series) ? "" : (data.series || ""),
  issue: data.issue === "INCONNU" ? "" : (data.issue || ""),
  publisher: data.publisher === "INCONNU" ? "" : (data.publisher || ""),
  author: data.author === "INCONNU" ? "" : (data.author || ""),
  year: data.year === "INCONNU" ? "" : (data.year || ""),
  language: data.language || "À vérifier",
  category: data.category === "VF" ? "VF" : "VO",
  price: "", stock: 1, condition: "Bon état",
  description: data.description || "", description_en: data.description_en || "", description_es: data.description_es || "",
  model_used: data.model_used || "", cropped: !!data.cropped,
  cover_image: data.cover_url ? `${BACKEND}${data.cover_url}` : "",
});

const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function ImportIA() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [files, setFiles] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [autoImport, setAutoImport] = useState(false);
  const [autocrop, setAutocrop] = useState(true);
  const [economic, setEconomic] = useState(true);
  const [withDesc, setWithDesc] = useState(true);
  const [defaultPrice, setDefaultPrice] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [sessions, setSessions] = useState([]);
  const [showLog, setShowLog] = useState(false);
  const [zoomSrc, setZoomSrc] = useState(null);
  const [seriesList, setSeriesList] = useState([]);
  const [catList, setCatList] = useState([]);
  const filesRef = useRef([]);
  const autoRef = useRef(false);
  const priceRef = useRef("");
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { autoRef.current = autoImport; }, [autoImport]);
  useEffect(() => { priceRef.current = defaultPrice; }, [defaultPrice]);

  const loadSessions = useCallback(() => {
    api.get("/admin/import/sessions").then((r) => setSessions(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    api.get("/auth/me").then(() => { setReady(true); loadSessions(); }).catch(() => nav("/admin/login"));
  }, [nav, loadSessions]);
  useEffect(() => {
    api.get("/admin/series").then((r) => setSeriesList((r.data || []).map((s) => s.name ?? s))).catch(() => {});
    api.get("/content").then((r) => setCatList(r.data?.categories || [])).catch(() => {});
  }, []);
  // Popup couverture : fermeture via Échap (croix + clic extérieur gérés dans le JSX)
  useEffect(() => {
    if (!zoomSrc) return;
    const onKey = (e) => { if (e.key === "Escape") setZoomSrc(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomSrc]);

  const addFiles = (fileList) => {
    const arr = Array.from(fileList).filter((f) => ACCEPT.includes(f.type));
    const rejected = fileList.length - arr.length;
    if (rejected > 0) toast.error(`${rejected} fichier(s) ignoré(s) (format non supporté)`);
    const mapped = arr.map((f) => ({ id: ++SEQ, file: f, url: URL.createObjectURL(f),
      status: "pending", result: null, duplicate: null, confidence: 0, selected: true }));
    setFiles((prev) => [...prev, ...mapped]);
  };

  const onDrop = (e) => { e.preventDefault(); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); };
  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));
  const patch = (id, obj) => setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...obj } : f)));
  const patchResult = (id, k, v) => setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, result: { ...f.result, [k]: v } } : f)));

  const analyzeAll = async () => {
    const ids = filesRef.current.filter((f) => f.status === "pending" || f.status === "error").map((f) => f.id);
    if (!ids.length) { toast.info("Aucune photo à analyser"); return; }
    setAnalyzing(true);
    const totalDoneStart = filesRef.current.filter((f) => f.status === "done").length;
    setProgress({ done: totalDoneStart, total: filesRef.current.length });
    let idx = 0, done = totalDoneStart;
    const worker = async () => {
      while (idx < ids.length) {
        const myId = ids[idx++];
        const f = filesRef.current.find((x) => x.id === myId);
        if (!f) continue;
        patch(myId, { status: "analyzing" });
        try {
          const fd = new FormData();
          fd.append("file", f.file);
          fd.append("autocrop", autocrop);
          fd.append("economic", economic);
          fd.append("with_desc", withDesc);
          const { data } = await api.post("/admin/import/analyze", fd, { headers: { "Content-Type": "multipart/form-data" } });
          const sel = autoRef.current ? (data.confidence >= 95 && !data.duplicate) : true;
          patch(myId, { status: "done", result: { ...emptyResult(data), price: priceRef.current }, duplicate: data.duplicate,
            confidence: data.confidence || 0, selected: sel });
        } catch (e) {
          patch(myId, { status: "error" });
        }
        done += 1;
        setProgress({ done, total: ids.length + totalDoneStart });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONC, ids.length) }, () => worker()));
    setAnalyzing(false);
    toast.success("Analyse terminée");
  };

  const doneFiles = files.filter((f) => f.status === "done");
  const selectedFiles = doneFiles.filter((f) => f.selected);
  const stats = {
    total: files.length,
    reliable: doneFiles.filter((f) => f.confidence >= 95).length,
    toVerify: doneFiles.filter((f) => f.confidence >= 80 && f.confidence < 95).length,
    uncertain: doneFiles.filter((f) => f.confidence < 80).length,
    errors: files.filter((f) => f.status === "error").length,
  };

  const selectAll = (v) => setFiles((prev) => prev.map((f) => (f.status === "done" ? { ...f, selected: v } : f)));
  const selectReliable = () => setFiles((prev) => prev.map((f) => (f.status === "done" ? { ...f, selected: f.confidence >= 95 && !f.duplicate } : f)));

  const exportCSV = () => {
    if (!doneFiles.length) { toast.error("Rien à exporter"); return; }
    const cols = ["fichier", "titre", "serie", "numero", "editeur", "auteur", "annee", "langue", "categorie",
      "prix", "stock", "etat", "confiance", "doublon", "modele", "recadree", "image_url"];
    const rows = doneFiles.map((f) => [
      f.file.name, f.result.title, f.result.series, f.result.issue, f.result.publisher, f.result.author,
      f.result.year, f.result.language, f.result.category, f.result.price || 0, f.result.stock,
      f.result.condition, f.confidence, f.duplicate ? "OUI" : "non", f.result.model_used,
      f.result.cropped ? "oui" : "non", f.result.cover_image,
    ]);
    const csv = [cols, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `import-bd-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importSelected = async () => {
    if (!selectedFiles.length) { toast.error("Aucun produit sélectionné"); return; }
    setImporting(true);
    try {
      const items = selectedFiles.map((f) => ({
        title: f.result.title, author: f.result.author, series: f.result.series,
        publisher: f.result.publisher, category: f.result.category,
        price: parseFloat(f.result.price) || 0, stock: parseInt(f.result.stock) || 1,
        condition: f.result.condition || "Bon état", year: f.result.year, issue: f.result.issue,
        description: f.result.description || "", description_en: f.result.description_en || "",
        description_es: f.result.description_es || "",
        cover_image: f.result.cover_image,
      }));
      const { data } = await api.post("/admin/import/bulk-create", { items });
      await api.post("/admin/import/session", {
        total_photos: files.length, analyzed: doneFiles.length, imported: data.created,
        errors: stats.errors, duplicates: doneFiles.filter((f) => f.duplicate).length,
      });
      toast.success(`${data.created} produit(s) importé(s) dans l'inventaire`);
      const importedIds = new Set(selectedFiles.map((f) => f.id));
      setFiles((prev) => prev.filter((f) => !importedIds.has(f.id)));
      loadSessions();
    } catch (e) { toast.error(e.response?.data?.detail || "Échec de l'import"); }
    finally { setImporting(false); }
  };

  if (!ready) return <div className="min-h-screen bg-ink text-paper flex items-center justify-center font-mono text-sm">Chargement…</div>;

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-papersoft">
      <Seo title="Import intelligent | Moulin Comics" noindex />
      <header className="bg-ink text-paper border-b-2 border-ink sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-comicred font-anton px-2 py-0.5">MC</span>
            <span className="font-mono text-sm uppercase tracking-widest">Import intelligent (IA)</span>
          </div>
          <button onClick={() => nav("/admin")} data-testid="back-to-admin" className="flex items-center gap-2 border border-paper/40 px-3 py-1.5 font-mono text-xs uppercase hover:bg-comicred transition-colors">
            <ArrowLeft size={14} /> Admin
          </button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-5 py-8">
        <h1 className="font-display font-black tracking-tighter text-3xl sm:text-4xl mb-2">Import intelligent de BD</h1>
        <p className="font-mono text-sm text-inksoft mb-6">Photos → Analyse IA → Vérification → Import. La photo analysée devient automatiquement la couverture du produit.</p>

        {/* STATS */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6 font-mono">
          {[["photos", stats.total, "bg-paper"], ["fiables 🟢", stats.reliable, "bg-green-200"],
            ["à vérifier 🟡", stats.toVerify, "bg-comicyellow"], ["incertains 🔴", stats.uncertain, "bg-comicred text-paper"],
            ["erreurs", stats.errors, "bg-paper"]].map(([l, v, cls]) => (
            <div key={l} className={`border-2 border-ink rounded-md p-3 ${cls}`}>
              <div className="font-anton text-3xl leading-none">{v}</div>
              <div className="text-[10px] uppercase tracking-widest mt-1">{l}</div>
            </div>
          ))}
        </div>

        {/* DROP ZONE */}
        <div data-testid="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
          className="border-2 border-dashed border-ink rounded-md bg-paper p-8 text-center mb-4">
          <UploadCloud size={36} className="mx-auto mb-3" />
          <p className="font-display font-bold text-lg">Ajouter des photos</p>
          <p className="font-mono text-xs text-inksoft mt-1">Glissez-déposez ou sélectionnez. JPG, JPEG, PNG, WEBP — plusieurs centaines possibles.</p>
          <label className="inline-block mt-4 cursor-pointer bg-ink text-paper font-mono text-xs uppercase tracking-widest px-5 py-3 rounded-md border-2 border-ink hover:bg-comicred transition-colors">
            Sélectionner des photos
            <input data-testid="import-file-input" type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {files.length > 0 && <p className="font-mono text-sm mt-4 font-bold" data-testid="photo-count">{files.length} photo(s) sélectionnée(s)</p>}
        </div>

        {/* THUMBNAILS (before analysis) */}
        {files.some((f) => f.status === "pending") && (
          <div className="flex flex-wrap gap-2 mb-4">
            {files.filter((f) => f.status === "pending").slice(0, 60).map((f) => (
              <div key={f.id} className="relative w-16 h-20 border-2 border-ink group">
                <img src={f.url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => removeFile(f.id)} className="absolute -top-2 -right-2 bg-comicred text-paper rounded-full p-0.5 opacity-0 group-hover:opacity-100">
                  <X size={12} />
                </button>
              </div>
            ))}
            {files.filter((f) => f.status === "pending").length > 60 && (
              <div className="w-16 h-20 border-2 border-ink flex items-center justify-center font-mono text-xs">+{files.filter((f) => f.status === "pending").length - 60}</div>
            )}
          </div>
        )}

        {/* CONTROLS */}
        <datalist id="ia-condition-choices">
          <option value="Bon état" />
          <option value="Très bon état" />
          <option value="Neuf" />
        </datalist>
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <label className="flex items-center gap-2 font-mono text-xs uppercase" title="Prix appliqué par défaut à chaque BD analysée (modifiable ensuite ligne par ligne)">
            Prix par défaut €
            <input data-testid="default-price-input" type="number" step="any" min="0" value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)} placeholder="0"
              className="w-24 border-2 border-ink rounded-md px-2 py-2 bg-paper outline-none" />
          </label>
          <button onClick={analyzeAll} disabled={analyzing || !files.length} data-testid="analyze-btn"
            className="flex items-center gap-2 bg-comicred text-paper font-mono text-xs uppercase tracking-widest px-5 py-3 rounded-md border-2 border-ink hover:bg-ink transition-colors disabled:opacity-40">
            {analyzing ? <><Loader2 size={14} className="animate-spin" /> Analyse…</> : <><Sparkles size={14} /> Analyser les BD</>}
          </button>
          <label className="flex items-center gap-2 font-mono text-xs uppercase cursor-pointer">
            <input type="checkbox" checked={autoImport} onChange={(e) => setAutoImport(e.target.checked)} data-testid="auto-import-toggle" />
            Importer auto les identifications ≥ 95 %
          </label>
          <label className="flex items-center gap-2 font-mono text-xs uppercase cursor-pointer" title="Détecte et redresse la couverture sur les photos prises de travers">
            <input type="checkbox" checked={autocrop} onChange={(e) => setAutocrop(e.target.checked)} data-testid="autocrop-toggle" />
            Recadrage auto
          </label>
          <label className="flex items-center gap-2 font-mono text-xs uppercase cursor-pointer" title="Modèle rapide et moins cher d'abord ; modèle puissant seulement si la confiance est faible">
            <input type="checkbox" checked={economic} onChange={(e) => setEconomic(e.target.checked)} data-testid="economic-toggle" />
            Mode économique
          </label>
          <label className="flex items-center gap-2 font-mono text-xs uppercase cursor-pointer" title="Génère les descriptions FR/EN/ES pendant l'analyse">
            <input type="checkbox" checked={withDesc} onChange={(e) => setWithDesc(e.target.checked)} data-testid="withdesc-toggle" />
            Descriptions FR/EN/ES
          </label>
          <button onClick={() => setShowLog(!showLog)} className="ml-auto flex items-center gap-2 font-mono text-xs uppercase border-2 border-ink px-3 py-2 rounded-md hover:bg-paper">
            <History size={14} /> Journal ({sessions.length})
          </button>
        </div>

        {/* PROGRESS */}
        {(analyzing || progress.done > 0) && progress.total > 0 && (
          <div className="mb-6 font-mono">
            <div className="flex justify-between text-xs mb-1"><span>Analyse en cours</span><span>{progress.done} / {progress.total} · {pct}%</span></div>
            <div className="h-3 border-2 border-ink bg-paper rounded"><div className="h-full bg-comicblue" style={{ width: `${pct}%` }} /></div>
          </div>
        )}

        {/* JOURNAL */}
        {showLog && (
          <div className="bg-paper border-2 border-ink rounded-md overflow-x-auto mb-6">
            <table className="w-full font-mono text-xs min-w-[560px]">
              <thead className="bg-ink text-paper uppercase tracking-widest"><tr>
                <th className="text-left p-2">Date</th><th className="text-right p-2">Photos</th><th className="text-right p-2">Analysées</th>
                <th className="text-right p-2">Importées</th><th className="text-right p-2">Erreurs</th><th className="text-right p-2">Doublons</th>
              </tr></thead>
              <tbody>
                {sessions.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-inksoft">Aucun import.</td></tr>}
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-ink/15">
                    <td className="p-2">{new Date(s.date).toLocaleString("fr-FR")}</td>
                    <td className="p-2 text-right">{s.total_photos}</td><td className="p-2 text-right">{s.analyzed}</td>
                    <td className="p-2 text-right font-bold">{s.imported}</td><td className="p-2 text-right">{s.errors}</td><td className="p-2 text-right">{s.duplicates}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* RESULTS TABLE */}
        {doneFiles.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3 font-mono text-xs">
              <span className="uppercase font-bold">BD analysées</span>
              <button onClick={() => selectAll(true)} className="border border-ink px-2 py-1 hover:bg-paper">Tout sélectionner</button>
              <button onClick={() => selectAll(false)} className="border border-ink px-2 py-1 hover:bg-paper">Tout désélectionner</button>
              <button onClick={selectReliable} className="border border-ink px-2 py-1 hover:bg-paper">Uniquement fiables (≥95%)</button>
              <button onClick={exportCSV} data-testid="export-csv-btn" className="flex items-center gap-1 border border-ink px-2 py-1 hover:bg-paper"><FileDown size={13} /> Export CSV</button>
              <button onClick={importSelected} disabled={importing || !selectedFiles.length} data-testid="import-selected-btn"
                className="ml-auto flex items-center gap-2 bg-ink text-paper uppercase tracking-widest px-4 py-2 rounded-md border-2 border-ink hover:bg-comicred transition-colors disabled:opacity-40">
                {importing ? <><Loader2 size={14} className="animate-spin" /> Import…</> : <><CheckCircle2 size={14} /> Importer {selectedFiles.length} produits</>}
              </button>
            </div>
            <div className="bg-paper border-2 border-ink rounded-md overflow-x-auto">
              <table className="w-full font-mono text-xs min-w-[1100px]">
                <thead className="bg-ink text-paper uppercase tracking-widest">
                  <tr>
                    <th className="p-2"></th><th className="p-2 text-left">Photo</th><th className="p-2 text-left">Titre</th>
                    <th className="p-2 text-left">Série</th><th className="p-2 text-left">N°</th><th className="p-2 text-left">Éditeur</th>
                    <th className="p-2 text-left">Année</th><th className="p-2 text-left">Langue</th><th className="p-2 text-left">Cat</th>
                    <th className="p-2 text-left">Prix €</th><th className="p-2 text-left">Stock</th><th className="p-2 text-left">État</th>
                    <th className="p-2 text-left">Confiance</th><th className="p-2 text-left">Statut</th><th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {doneFiles.map((f) => {
                    const b = confBadge(f.confidence);
                    const inp = "border border-ink rounded px-1 py-1 bg-papersoft w-full";
                    return (
                      <tr key={f.id} className="border-b border-ink/15 align-top" data-testid={`result-row-${f.id}`}>
                        <td className="p-2"><input type="checkbox" checked={f.selected} onChange={(e) => patch(f.id, { selected: e.target.checked })} data-testid={`row-check-${f.id}`} /></td>
                        <td className="p-2"><img src={f.url} alt="" onClick={() => setZoomSrc(f.url)} data-testid={`cover-thumb-${f.id}`} title="Agrandir"
                          className="w-10 h-14 object-cover border border-ink cursor-zoom-in hover:opacity-80 transition-opacity" /></td>
                        <td className="p-2 min-w-[180px]"><input className={inp} value={f.result.title} onChange={(e) => patchResult(f.id, "title", e.target.value)} /></td>
                        <td className="p-2 min-w-[120px]">
                          <select className={inp} value={f.result.series} data-testid={`series-select-${f.id}`}
                            onChange={(e) => patchResult(f.id, "series", e.target.value)}>
                            <option value="">Sans série</option>
                            {f.result.series && !seriesList.includes(f.result.series) && <option value={f.result.series}>{f.result.series}</option>}
                            {seriesList.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="p-2 w-16"><input className={inp} value={f.result.issue} onChange={(e) => patchResult(f.id, "issue", e.target.value)} /></td>
                        <td className="p-2 min-w-[100px]"><input className={inp} value={f.result.publisher} onChange={(e) => patchResult(f.id, "publisher", e.target.value)} /></td>
                        <td className="p-2 w-16"><input className={inp} value={f.result.year} onChange={(e) => patchResult(f.id, "year", e.target.value)} /></td>
                        <td className="p-2 w-24">
                          <select className={inp} value={f.result.language} onChange={(e) => patchResult(f.id, "language", e.target.value)}>
                            <option>Anglais</option><option>Français</option><option>À vérifier</option>
                          </select>
                        </td>
                        <td className="p-2 w-16">
                          <select className={inp} value={f.result.category} onChange={(e) => patchResult(f.id, "category", e.target.value)}>
                            <option value="">Sans catégorie</option>
                            {f.result.category && !catList.includes(f.result.category) && <option value={f.result.category}>{f.result.category}</option>}
                            {catList.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        </td>
                        <td className="p-2 w-16"><input type="number" step="any" min="0" className={inp} value={f.result.price} placeholder="0" onChange={(e) => patchResult(f.id, "price", e.target.value)} /></td>
                        <td className="p-2 w-14"><input type="number" step="1" min="0" className={inp} value={f.result.stock} onChange={(e) => patchResult(f.id, "stock", e.target.value)} /></td>
                        <td className="p-2 min-w-[90px]"><input list="ia-condition-choices" className={inp} value={f.result.condition} onChange={(e) => patchResult(f.id, "condition", e.target.value)} /></td>
                        <td className="p-2"><span className={`px-2 py-1 border rounded ${b.cls}`}>{b.label}</span></td>
                        <td className="p-2">
                          {f.duplicate
                            ? <span className="text-comicred flex items-center gap-1"><AlertTriangle size={12} /> Doublon possible</span>
                            : <span className="text-green-700 flex items-center gap-1"><Check size={12} /> Nouveau</span>}
                          {f.result.series === "" && <div className="text-comicred">Série à vérifier</div>}
                        </td>
                        <td className="p-2"><button onClick={() => removeFile(f.id)} className="text-comicred"><Trash2 size={14} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ERRORS with retry note */}
        {stats.errors > 0 && !analyzing && (
          <p className="font-mono text-xs text-comicred mt-4">{stats.errors} image(s) en erreur. Cliquez à nouveau sur « Analyser les BD » pour reprendre uniquement celles-ci.</p>
        )}

        {/* POPUP COUVERTURE : image originale déjà chargée, proportions conservées */}
        {zoomSrc && (
          <div data-testid="cover-zoom-modal" onClick={() => setZoomSrc(null)}
            className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-4">
            <button onClick={() => setZoomSrc(null)} data-testid="cover-zoom-close" aria-label="Fermer"
              className="absolute top-4 right-4 bg-paper text-ink border-2 border-ink rounded-full p-2 hover:bg-comicred hover:text-paper transition-colors">
              <X size={18} />
            </button>
            <img src={zoomSrc} alt="Couverture" onClick={(e) => e.stopPropagation()}
              className="max-w-[90vw] max-h-[85vh] object-contain border-2 border-paper bg-paper" />
          </div>
        )}
      </div>
    </div>
  );
}
