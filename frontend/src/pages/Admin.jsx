import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, LogOut, Package, Receipt, Upload, Loader2, Tags, MapPin, Sparkles, Copy, FileText, ArrowUpDown, ChevronUp, ChevronDown, Truck, X, Power, Layers } from "lucide-react";
import { api, fmtPrice, API } from "../lib/api";
import { Seo } from "../components/Seo";
import { AdminHelp } from "../components/AdminHelp";
import { RichEditor } from "../components/RichEditor";

const EMPTY = { title: "", author: "", series: "", publisher: "", category: "", price: "", stock: 1,
  condition: "Très bon état", year: "", issue: "", description: "", description_en: "", description_es: "",
  moulin_eye_type: "", moulin_eye_text: "", cover_image: "", featured: false };

const fmtAddr = (a) => a
  ? [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.country].filter(Boolean)
  : [];

const parsePriceField = (v) => {
  const n = parseFloat(String(v).trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return { ok: false, msg: "Prix invalide : nombre positif attendu (ex. 12,50)" };
  return { ok: true, value: Math.round(n * 100) / 100 };
};

const parseStockField = (v) => {
  const n = Number(String(v).trim().replace(",", "."));
  if (!Number.isInteger(n) || n < 0) return { ok: false, msg: "Stock invalide : entier supérieur ou égal à 0 attendu" };
  return { ok: true, value: n };
};

// Édition en ligne (table Stock) : enregistre à Entrée ou à la sortie du champ,
// indicateur discret + « Enregistré », restauration de l'ancienne valeur si erreur.
const InlineField = ({ value, onSave, parse, format, testid }) => {
  const fmt = format || ((x) => String(x ?? ""));
  const [v, setV] = useState(fmt(value));
  const [st, setSt] = useState("idle"); // idle | saving | saved | error
  const cancel = useRef(false);
  useEffect(() => { setV(fmt(value)); }, [value]);
  const commit = async () => {
    if (cancel.current) { cancel.current = false; return; }
    const r = parse(v);
    if (!r.ok) {
      setV(fmt(value)); setSt("error");
      toast.error(r.msg); setTimeout(() => setSt("idle"), 1800); return;
    }
    if (r.value === value) { setV(fmt(value)); return; }
    setSt("saving");
    try {
      await onSave(r.value);
      setSt("saved"); setTimeout(() => setSt("idle"), 1500);
    } catch (e) {
      setV(fmt(value)); setSt("error");
      toast.error(e.response?.data?.detail || "Erreur d'enregistrement");
      setTimeout(() => setSt("idle"), 1800);
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input value={v} data-testid={testid} disabled={st === "saving"}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { cancel.current = true; setV(fmt(value)); e.currentTarget.blur(); }
        }}
        className="w-16 bg-transparent border border-transparent hover:border-ink/30 focus:border-ink rounded px-1 py-0.5 font-mono text-xs text-right outline-none transition-colors" />
      <span className="inline-flex w-16 items-center font-mono text-[9px]">
        {st === "saving" && <Loader2 size={11} className="animate-spin text-inksoft" />}
        {st === "saved" && <span className="text-emerald-600">Enregistré</span>}
        {st === "error" && <span className="text-comicred">Erreur</span>}
      </span>
    </span>
  );
};

// Liste déroulante série/catégorie (table Stock) : enregistrement immédiat au choix.
const SeriesCell = ({ value, options, onSave, testid, emptyLabel = "Sans série" }) => {
  const [st, setSt] = useState("idle");
  return (
    <span className="inline-flex items-center gap-1">
      <select value={value || ""} data-testid={testid} disabled={st === "saving"}
        onChange={async (e) => {
          const nv = e.target.value;
          if (nv === (value || "")) return;
          setSt("saving");
          try { await onSave(nv); setSt("saved"); setTimeout(() => setSt("idle"), 1500); }
          catch (err) {
            setSt("error");
            toast.error(err.response?.data?.detail || "Erreur d'enregistrement");
            setTimeout(() => setSt("idle"), 1800);
          }
        }}
        className="bg-transparent border border-transparent hover:border-ink/30 focus:border-ink rounded px-1 py-0.5 font-mono text-xs outline-none max-w-[150px] cursor-pointer">
        <option value="">{emptyLabel}</option>
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <span className="inline-flex w-16 items-center font-mono text-[9px]">
        {st === "saving" && <Loader2 size={11} className="animate-spin text-inksoft" />}
        {st === "saved" && <span className="text-emerald-600">Enregistré</span>}
        {st === "error" && <span className="text-comicred">Erreur</span>}
      </span>
    </span>
  );
};

export default function Admin() {
  const nav = useNavigate();
  const [tab, setTab] = useState("stock");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [openOrder, setOpenOrder] = useState(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderPay, setOrderPay] = useState("all");
  const [orderFul, setOrderFul] = useState("all");
  const [orderSort, setOrderSort] = useState({ key: "created_at", dir: -1 });
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [shipCfg, setShipCfg] = useState({ mondial_relay_price: "", home_delivery_price: "", policy: "", policy_en: "", policy_es: "" });
  const [policyLang, setPolicyLang] = useState("fr");
  const [vacCfg, setVacCfg] = useState({ enabled: false, message: "" });
  const [mrStatus, setMrStatus] = useState(null);

  const [zoomImg, setZoomImg] = useState(null);

  // Édition inline (table Stock) : PATCH partiel + mise à jour locale, sans rechargement.
  const patchProduct = async (id, body) => {
    await api.patch(`/admin/products/${id}`, body);
    setProducts((prev) => prev.map((x) => (x.id === id ? { ...x, ...body } : x)));
  };

  const saveShippingCfg = async () => {
    try {
      const body = {
        mondial_relay_price: parseFloat(shipCfg.mondial_relay_price) || 0,
        home_delivery_price: parseFloat(shipCfg.home_delivery_price) || 0,
        policy: shipCfg.policy,
      };
      // Traductions EN/ES de la politique, renvoyées dans le même enregistrement :
      // le endpoint remplace toute la section, les omettre les effacerait.
      if (shipCfg.policy_en) body.en = { policy: shipCfg.policy_en };
      if (shipCfg.policy_es) body.es = { policy: shipCfg.policy_es };
      await api.put("/admin/content/shipping", body);
      toast.success("Paramètres de livraison enregistrés");
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const saveVacationCfg = async () => {
    try {
      await api.put("/admin/content/vacation", { enabled: !!vacCfg.enabled, message: vacCfg.message });
      toast.success(vacCfg.enabled ? "Mode vacances activé — boutique fermée" : "Mode vacances désactivé — boutique ouverte");
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  // États transporteur (informatifs, alimentés automatiquement par un futur suivi Mondial Relay)
  const CARRIER_STATUS_LABELS = {
    en_transit: "En transit", disponible_relais: "Disponible au Point Relais",
    livree: "Livrée", incident: "Incident",
  };

  const ORDER_LABELS = {
    a_traiter: "À préparer", prete_expedition: "Prête à expédier",
    expediee: "Expédiée", terminee: "Terminée", annulee: "Annulée / Remboursée",
  };
  const ORDER_BADGE = {
    a_traiter: "bg-comicred text-paper border-ink",
    prete_expedition: "bg-comicblue text-paper border-ink",
    expediee: "bg-comicblue text-paper border-ink",
    terminee: "bg-green-600 text-paper border-ink",
    annulee: "border-ink/30 text-inksoft",
  };
  const NEXT_ACTION = {
    a_traiter: { label: "Marquer comme prête", to: "prete_expedition" },
    prete_expedition: { label: "Marquer comme expédiée", to: "expediee" },
    expediee: { label: "Terminer la commande", to: "terminee" },
  };

  const updateStatus = async (sessionId, status) => {
    try {
      const { data } = await api.put(`/admin/orders/${sessionId}/status`, { fulfillment_status: status });
      setOrders((prev) => prev.map((o) => (o.session_id === sessionId
        ? { ...o, fulfillment_status: data.fulfillment_status, shipping_status: data.shipping_status } : o)));
      toast.success(data.email_sent ? "Commande mise à jour — email d'expédition envoyé au client" : "Commande mise à jour");
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const updateShipping = async (sessionId, patch) => {
    try {
      const { data } = await api.put(`/admin/orders/${sessionId}/shipping`, patch);
      setOrders((prev) => prev.map((o) => (o.session_id === sessionId
        ? { ...o, ...(patch.tracking_number !== undefined ? { tracking_number: data.tracking_number } : {}),
            ...(data.shipping_status ? { shipping_status: data.shipping_status } : {}),
            ...(data.fulfillment_status ? { fulfillment_status: data.fulfillment_status } : {}),
            ...(data.shipped_at ? { shipped_at: data.shipped_at } : {}) } : o)));
      toast.success(data.email_sent ? "Livraison mise à jour — email d'expédition envoyé au client" : "Livraison mise à jour");
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };
  const [seriesList, setSeriesList] = useState([]);
  const [catList, setCatList] = useState([]);
  const [newCat, setNewCat] = useState("");
  const [newSeries, setNewSeries] = useState("");
  const [salons, setSalons] = useState([]);
  const [salonForm, setSalonForm] = useState(null);
  const [form, setForm] = useState(null);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fTitle, setFTitle] = useState("");
  const [fSeries, setFSeries] = useState("");
  const [fDate, setFDate] = useState("");

  const filteredProducts = products.filter((p) => {
    if (fTitle && !p.title?.toLowerCase().includes(fTitle.toLowerCase())) return false;
    if (fSeries && (p.series || "") !== fSeries) return false;
    if (fDate && (p.created_at || "").slice(0, 10) !== fDate) return false;
    return true;
  });

  const [selectedIds, setSelectedIds] = useState([]);
  const toggleSelect = (id) => setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const allVisibleSelected = filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.includes(p.id));
  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) setSelectedIds((prev) => prev.filter((id) => !filteredProducts.some((p) => p.id === id)));
    else setSelectedIds((prev) => [...new Set([...prev, ...filteredProducts.map((p) => p.id)])]);
  };
  const bulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Supprimer définitivement ${selectedIds.length} produit(s) sélectionné(s) ?`)) return;
    try {
      const { data } = await api.post("/admin/products/bulk-delete", { ids: selectedIds });
      toast.success(`${data.deleted} produit(s) supprimé(s)`);
      setSelectedIds([]); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };
  const dedupe = async () => {
    if (!window.confirm("Supprimer les doublons ? Le plus ancien exemplaire de chaque BD (même série + n° + catégorie, ou même titre) est conservé.")) return;
    try {
      const { data } = await api.post("/admin/products/dedupe");
      toast.success(data.deleted > 0 ? `${data.deleted} doublon(s) supprimé(s) sur ${data.groups} groupe(s)` : "Aucun doublon trouvé");
      setSelectedIds([]); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const uploadCover = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, cover_image: `${API}/files/${data.path}` }));
      toast.success("Image chargée");
    } catch (e) { toast.error(e.response?.data?.detail || "Échec de l'upload"); }
    finally { setUploading(false); }
  };

  const [analyzing, setAnalyzing] = useState(false);
  const smartAdd = async (file) => {
    if (!file) return;
    setAnalyzing(true);
    toast.info("Analyse de la couverture par l'IA…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/analyze-cover", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm({
        ...EMPTY,
        title: data.title || "", author: data.author || "", series: data.series || "",
        publisher: data.publisher || "", category: data.category === "VF" ? "VF" : "VO",
        issue: data.issue || "", year: data.year || "", condition: data.condition || "Bon état",
        description: data.description || "", description_en: data.description_en || "", description_es: data.description_es || "",
        cover_image: data.cover_url ? `${API.replace(/\/api$/, "")}${data.cover_url}` : "",
        price: "", stock: 1, featured: false,
      });
      toast.success("Champs pré-remplis par l'IA — vérifiez puis enregistrez");
    } catch (e) { toast.error(e.response?.data?.detail || "L'analyse IA a échoué"); }
    finally { setAnalyzing(false); }
  };

  const load = useCallback(() => {
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/admin/orders").then((r) => setOrders(r.data)).catch(() => {});
    api.get("/admin/series").then((r) => setSeriesList(r.data)).catch(() => {});
    api.get("/salons").then((r) => setSalons(r.data)).catch(() => {});
    api.get("/content").then((r) => {
      setCatList(r.data?.categories || []);
      const s = r.data?.shipping || {};
      setShipCfg({
        mondial_relay_price: s.mondial_relay_price ?? "",
        home_delivery_price: s.home_delivery_price ?? "",
        policy: s.policy ?? "",
        policy_en: s.en?.policy ?? "",
        policy_es: s.es?.policy ?? "",
      });
      const v = r.data?.vacation || {};
      setVacCfg({ enabled: !!v.enabled, message: v.message ?? "" });
    }).catch(() => {});
    api.get("/admin/mondial-relay/status").then((r) => setMrStatus(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/auth/me").then(() => { setReady(true); load(); })
      .catch(() => nav("/admin/login"));
  }, [nav, load]);

  const logout = async () => { await api.post("/auth/logout"); nav("/admin/login"); };

  const addSeries = async (e) => {
    e.preventDefault();
    if (!newSeries.trim()) return;
    try {
      await api.post("/admin/series", { name: newSeries.trim() });
      setNewSeries(""); toast.success("Série ajoutée"); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const renameSeries = async (s) => {
    const name = window.prompt("Nouveau nom de la série :", s.name);
    if (!name || name === s.name) return;
    try { await api.put(`/admin/series/${s.id}`, { name }); toast.success("Renommée"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const delSeries = async (s) => {
    if (!window.confirm(`Supprimer la série "${s.name}" ? Les ${s.product_count} produit(s) associé(s) seront désaffectés.`)) return;
    await api.delete(`/admin/series/${s.id}`); toast.success("Supprimée"); load();
  };

  // Catégories produits (liste administrable, stockée dans site_content.categories).
  const refreshProducts = () => api.get("/products").then((r) => setProducts(r.data)).catch(() => {});
  const addCat = async (e) => {
    e.preventDefault();
    const name = newCat.trim();
    if (!name || catList.includes(name)) return;
    try {
      const { data } = await api.put("/admin/content/categories", [...catList, name]);
      setCatList(data.categories || []); setNewCat(""); toast.success("Catégorie ajoutée");
    } catch (err) { toast.error(err.response?.data?.detail || "Erreur"); }
  };
  const renameCat = async (name) => {
    const nn = window.prompt("Nouveau nom de la catégorie (les produits associés seront mis à jour) :", name);
    if (!nn || nn.trim() === name) return;
    try {
      const { data } = await api.post("/admin/categories/rename", { old: name, new: nn.trim() });
      setCatList(data.categories || []); toast.success("Catégorie renommée — produits mis à jour"); refreshProducts();
    } catch (err) { toast.error(err.response?.data?.detail || "Erreur"); }
  };
  const delCat = async (name) => {
    if (!window.confirm(`Supprimer la catégorie "${name}" ? Les produits associés passeront en « Sans catégorie » (ils ne seront pas supprimés).`)) return;
    try {
      const { data } = await api.post("/admin/categories/delete", { name });
      setCatList(data.categories || []); toast.success("Catégorie supprimée — produits passés en Sans catégorie"); refreshProducts();
    } catch (err) { toast.error(err.response?.data?.detail || "Erreur"); }
  };

  const SALON_EMPTY = { date_label: "", city: "", country: "", name: "", note: "", description: "", website: "", photo: "", ordre: null };
  const [salonUploading, setSalonUploading] = useState(false);
  const uploadSalonPhoto = async (file) => {
    if (!file) return;
    setSalonUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/admin/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setSalonForm((f) => ({ ...f, photo: `${API}/files/${data.path}` }));
      toast.success("Photo chargée");
    } catch (e) { toast.error(e.response?.data?.detail || "Échec de l'upload"); }
    finally { setSalonUploading(false); }
  };
  const saveSalon = async (e) => {
    e.preventDefault();
    try {
      if (salonForm.id) await api.put(`/admin/salons/${salonForm.id}`, salonForm);
      else await api.post("/admin/salons", salonForm);
      toast.success("Salon enregistré"); setSalonForm(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };
  const delSalon = async (id) => {
    if (!window.confirm("Supprimer ce salon ?")) return;
    await api.delete(`/admin/salons/${id}`); toast.success("Supprimé"); load();
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = { ...form, price: parseFloat(form.price), stock: parseInt(form.stock) };
    try {
      if (form.id) await api.put(`/admin/products/${form.id}`, payload);
      else await api.post("/admin/products", payload);
      toast.success("Enregistré");
      setForm(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const del = async (id) => {
    if (!window.confirm("Supprimer cette référence ?")) return;
    await api.delete(`/admin/products/${id}`);
    toast.success("Supprimé"); load();
  };

  const toggleSort = (k) => setOrderSort((p) => (p.key === k ? { key: k, dir: -p.dir } : { key: k, dir: 1 }));
  const toggleOrderSelect = (sid) => setSelectedOrders((p) => (p.includes(sid) ? p.filter((x) => x !== sid) : [...p, sid]));
  const viewOrders = orders
    .filter((o) => {
      if (orderPay === "paid" && o.payment_status !== "paid") return false;
      if (orderPay === "pending" && o.payment_status === "paid") return false;
      if (orderFul !== "all" && (o.fulfillment_status || "en_attente") !== orderFul) return false;
      if (orderSearch) {
        const hay = [o.session_id, o.customer?.name, o.customer?.email,
          ...(o.items || []).map((i) => i.title)].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(orderSearch.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const k = orderSort.key;
      const va = k === "customer" ? (a.customer?.name || "") : k === "amount" ? (a.amount || 0) : (a.created_at || "");
      const vb = k === "customer" ? (b.customer?.name || "") : k === "amount" ? (b.amount || 0) : (b.created_at || "");
      return (va > vb ? 1 : va < vb ? -1 : 0) * orderSort.dir;
    });
  const allSelected = viewOrders.length > 0 && viewOrders.every((o) => selectedOrders.includes(o.session_id));
  const toggleSelectAll = () => setSelectedOrders(allSelected ? [] : viewOrders.map((o) => o.session_id));
  const deleteSelected = async () => {
    if (!selectedOrders.length) return;
    if (!window.confirm(`Supprimer définitivement ${selectedOrders.length} commande(s) ?`)) return;
    try {
      const { data } = await api.post("/admin/orders/bulk-delete", { session_ids: selectedOrders });
      setOrders((prev) => prev.filter((o) => !selectedOrders.includes(o.session_id)));
      setSelectedOrders([]);
      toast.success(`${data.deleted} commande(s) supprimée(s)`);
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  const Th = ({ k, children, className = "" }) => (
    <th className={`text-left p-3 cursor-pointer select-none hover:text-comicyellow ${className}`}
      onClick={() => toggleSort(k)} data-testid={`orders-sort-${k}`}>
      <span className="inline-flex items-center gap-1">{children}
        {orderSort.key === k
          ? (orderSort.dir === 1 ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
          : <ArrowUpDown size={11} className="opacity-40" />}
      </span>
    </th>
  );

  if (!ready) return <div className="min-h-screen bg-ink text-paper flex items-center justify-center font-mono text-sm">Chargement…</div>;

  return (
    <div className="min-h-screen bg-papersoft">
      <Seo title="Administration | Moulin Comics" noindex />
      <header className="bg-ink text-paper border-b-2 border-ink sticky top-0 z-40">
        <div className="max-w-[1300px] mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-comicred font-anton px-2 py-0.5">MC</span>
            <span className="font-mono text-sm uppercase tracking-widest">Admin · Moulin Comics</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" target="_blank" rel="noreferrer" className="font-mono text-xs uppercase hover:text-comicyellow px-3">Voir le site ↗</a>
            <AdminHelp />
            <button onClick={() => nav("/admin/content")} data-testid="site-content-btn" className="flex items-center gap-2 border border-paper/40 px-3 py-1.5 font-mono text-xs uppercase hover:bg-comicblue transition-colors">
              <FileText size={14} /> Contenu du site
            </button>
            <button onClick={logout} data-testid="admin-logout" className="flex items-center gap-2 border border-paper/40 px-3 py-1.5 font-mono text-xs uppercase hover:bg-comicred transition-colors">
              <LogOut size={14} /> Quitter
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1300px] mx-auto px-5 py-8">
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setTab("stock")} className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink ${tab === "stock" ? "bg-ink text-paper" : "bg-paper"}`}>
            <Package size={14} /> Stock ({products.length})
          </button>
          <button onClick={() => setTab("orders")} data-testid="tab-orders" className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink ${tab === "orders" ? "bg-ink text-paper" : "bg-paper"}`}>
            <Receipt size={14} /> Commandes ({orders.length})
          </button>
          <button onClick={() => setTab("series")} data-testid="tab-series" className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink ${tab === "series" ? "bg-ink text-paper" : "bg-paper"}`}>
            <Tags size={14} /> Séries ({seriesList.length})
          </button>
          <button onClick={() => setTab("categories")} data-testid="tab-categories" className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink ${tab === "categories" ? "bg-ink text-paper" : "bg-paper"}`}>
            <Layers size={14} /> Catégories ({catList.length})
          </button>
          <button onClick={() => setTab("salons")} data-testid="tab-salons" className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink ${tab === "salons" ? "bg-ink text-paper" : "bg-paper"}`}>
            <MapPin size={14} /> Salons ({salons.length})
          </button>
          <button onClick={() => setTab("shipping")} data-testid="tab-shipping" className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink ${tab === "shipping" ? "bg-ink text-paper" : "bg-paper"}`}>
            <Truck size={14} /> Livraison
          </button>
          <button onClick={() => setTab("vacation")} data-testid="tab-vacation" className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink ${tab === "vacation" ? "bg-ink text-paper" : "bg-paper"}`}>
            <Power size={14} /> Vacances
          </button>
        </div>

        {tab === "shipping" && (
          <>
            <h1 className="font-display font-black tracking-tighter text-2xl mb-4">Paramètres — Livraison</h1>
            <div className="bg-paper border-2 border-ink rounded-md p-6 max-w-xl">
              <p className="font-mono text-xs text-inksoft mb-5 border-l-2 border-comicred pl-3">
                Ces tarifs s'affichent au checkout et sont vérifiés côté serveur à chaque commande.
              </p>
              <div className="border-2 border-ink rounded-md p-4 mb-4">
                <p className="font-display font-bold text-sm mb-1">Mondial Relay — Point Relais / Locker</p>
                <p className="font-mono text-[10px] text-inksoft uppercase mb-2">France métropolitaine</p>
                <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">Prix TTC (€)</label>
                <input type="number" step="0.10" min="0" value={shipCfg.mondial_relay_price} data-testid="shipping-relay-price"
                  onChange={(e) => setShipCfg((p) => ({ ...p, mondial_relay_price: e.target.value }))}
                  className="w-32 border-2 border-ink rounded-md px-3 py-2 bg-papersoft font-mono text-sm outline-none" />
              </div>
              <div className="border-2 border-ink rounded-md p-4 mb-4">
                <p className="font-display font-bold text-sm mb-1">Livraison à domicile</p>
                <p className="font-mono text-[10px] text-inksoft uppercase mb-2">À l'adresse du client</p>
                <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">Prix TTC (€)</label>
                <input type="number" step="0.10" min="0" value={shipCfg.home_delivery_price} data-testid="shipping-home-price"
                  onChange={(e) => setShipCfg((p) => ({ ...p, home_delivery_price: e.target.value }))}
                  className="w-32 border-2 border-ink rounded-md px-3 py-2 bg-papersoft font-mono text-sm outline-none" />
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-2" data-testid="shipping-policy-lang-switcher">
                <span className="font-mono text-[10px] uppercase tracking-widest text-inksoft">Langue du texte :</span>
                {[["fr", "FR"], ["en", "EN"], ["es", "ES"]].map(([code, label]) => (
                  <button key={code} type="button" onClick={() => setPolicyLang(code)} data-testid={`shipping-policy-lang-${code}`}
                    className={`font-mono text-xs uppercase px-2.5 py-1 rounded-md border-2 border-ink ${policyLang === code ? "bg-comicred text-paper" : "bg-paper"}`}>{label}</button>
                ))}
              </div>
              {policyLang !== "fr" && (
                <p className="font-mono text-xs text-inksoft mb-2 border-l-2 border-comicred pl-3" data-testid="shipping-policy-lang-note">
                  Vous éditez la traduction {policyLang.toUpperCase()}. Laissée vide, la page publique affiche automatiquement le texte français.
                </p>
              )}
              <RichEditor label={`Politique de livraison (${policyLang.toUpperCase()})`} testid="shipping-policy-editor"
                value={policyLang === "fr" ? shipCfg.policy : shipCfg[`policy_${policyLang}`]}
                onChange={(v) => setShipCfg((p) => ({ ...p, [policyLang === "fr" ? "policy" : `policy_${policyLang}`]: v }))}
                hint="Contenu affiché sur la page publique /politique-livraison (lien en pied de page). Titres, listes et liens possibles." />
              <button onClick={saveShippingCfg} data-testid="shipping-save"
                className="flex items-center gap-2 bg-ink text-paper font-mono text-xs uppercase tracking-widest px-5 py-3 rounded-md border-2 border-ink hover:bg-comicred transition-colors">
                Enregistrer les paramètres
              </button>
            </div>
          </>
        )}

        {tab === "vacation" && (
          <>
            <h1 className="font-display font-black tracking-tighter text-2xl mb-4">Mode vacances</h1>
            <div className="bg-paper border-2 border-ink rounded-md p-6 max-w-xl">
              <p className="font-mono text-xs text-inksoft mb-5 border-l-2 border-comicred pl-3">
                Quand la boutique est fermée, le catalogue et les fiches produits restent visibles, mais aucun nouvel achat ne peut être finalisé. Le blocage est appliqué côté serveur, avant toute création de paiement.
              </p>
              <div className="flex items-center justify-between gap-4 border-2 border-ink rounded-md p-4 mb-4">
                <p className="font-display font-bold text-sm" data-testid="vacation-status">
                  {vacCfg.enabled ? "🔴 Boutique fermée" : "🟢 Boutique ouverte"}
                </p>
                <button onClick={() => setVacCfg((p) => ({ ...p, enabled: !p.enabled }))} data-testid="vacation-toggle"
                  aria-pressed={vacCfg.enabled} aria-label="Mode vacances"
                  className={`relative shrink-0 w-14 h-8 rounded-full border-2 border-ink transition-colors ${vacCfg.enabled ? "bg-comicred" : "bg-papersoft"}`}>
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-paper border-2 border-ink transition-transform ${vacCfg.enabled ? "translate-x-6" : "translate-x-0.5"}`} />
                </button>
              </div>
              <div className="mb-4">
                <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">Message de fermeture</label>
                <textarea value={vacCfg.message} rows={4} data-testid="vacation-message"
                  onChange={(e) => setVacCfg((p) => ({ ...p, message: e.target.value }))}
                  placeholder="Notre boutique est actuellement fermée pour congés. Les commandes reprendront prochainement."
                  className="w-full border-2 border-ink rounded-md px-3 py-2 bg-papersoft font-mono text-sm outline-none" />
                <p className="font-mono text-[10px] text-inksoft mt-1">Affiché aux clients quand la boutique est fermée. Si le champ est vide, le message par défaut est utilisé.</p>
              </div>
              <button onClick={saveVacationCfg} data-testid="vacation-save"
                className="flex items-center gap-2 bg-ink text-paper font-mono text-xs uppercase tracking-widest px-5 py-3 rounded-md border-2 border-ink hover:bg-comicred transition-colors">
                Enregistrer
              </button>
            </div>
          </>
        )}

        {tab === "stock" && (
          <>
            <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
              <h1 className="font-display font-black tracking-tighter text-2xl">Inventaire</h1>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => nav("/admin/import")} data-testid="import-ia-btn"
                  className="flex items-center gap-2 bg-ink text-paper font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink hover:bg-comicblue transition-colors">
                  <Sparkles size={14} /> Import intelligent (IA)
                </button>
                <label data-testid="smart-add-btn"
                  className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink cursor-pointer transition-colors ${analyzing ? "bg-papersoft" : "bg-comicyellow hover:bg-ink hover:text-paper"}`}>
                  {analyzing ? <><Loader2 size={14} className="animate-spin" /> Analyse…</> : <><Sparkles size={14} /> Ajout intelligent (IA)</>}
                  <input data-testid="smart-add-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
                    disabled={analyzing} onChange={(e) => { smartAdd(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                <button onClick={() => setForm({ ...EMPTY })} data-testid="add-product-btn"
                  className="flex items-center gap-2 bg-comicred text-paper font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink hover:bg-ink transition-colors">
                  <Plus size={14} /> Ajouter une BD
                </button>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 mb-4 font-mono text-sm">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Rechercher un titre</label>
                <input data-testid="admin-filter-title" value={fTitle} onChange={(e) => setFTitle(e.target.value)}
                  placeholder="Titre du produit…"
                  className="w-full border-2 border-ink rounded-md px-3 py-2 mt-1 bg-paper outline-none" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Filtrer par série</label>
                <select data-testid="admin-filter-series" value={fSeries} onChange={(e) => setFSeries(e.target.value)}
                  className="w-full border-2 border-ink rounded-md px-3 py-2 mt-1 bg-paper">
                  <option value="">Toutes les séries</option>
                  {seriesList.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Date d'ajout</label>
                <input data-testid="admin-filter-date" type="date" value={fDate} onChange={(e) => setFDate(e.target.value)}
                  className="w-full border-2 border-ink rounded-md px-3 py-2 mt-1 bg-paper outline-none" />
              </div>
            </div>
            {(fTitle || fSeries || fDate) && (
              <div className="flex items-center gap-3 mb-3 font-mono text-xs">
                <span className="text-inksoft">{filteredProducts.length} résultat(s)</span>
                <button data-testid="admin-filter-reset" onClick={() => { setFTitle(""); setFSeries(""); setFDate(""); }}
                  className="underline hover:text-comicred">Réinitialiser les filtres</button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button onClick={bulkDelete} disabled={!selectedIds.length} data-testid="bulk-delete-btn"
                className="flex items-center gap-2 bg-comicred text-paper font-mono text-xs uppercase tracking-widest px-4 py-2 rounded-md border-2 border-ink hover:bg-ink transition-colors disabled:opacity-40">
                <Trash2 size={14} /> Supprimer la sélection ({selectedIds.length})
              </button>
              <button onClick={dedupe} data-testid="dedupe-btn"
                className="flex items-center gap-2 bg-paper font-mono text-xs uppercase tracking-widest px-4 py-2 rounded-md border-2 border-ink hover:bg-comicyellow transition-colors">
                <Copy size={14} /> Supprimer les doublons
              </button>
              {selectedIds.length > 0 && (
                <button onClick={() => setSelectedIds([])} className="font-mono text-xs uppercase underline hover:text-comicred">Désélectionner tout</button>
              )}
            </div>
            <div className="bg-paper border-2 border-ink rounded-md overflow-x-auto">
              <table className="w-full font-mono text-sm min-w-[840px]">
                <thead className="bg-ink text-paper text-[11px] uppercase tracking-widest">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} data-testid="select-all-checkbox" />
                    </th>
                    <th className="text-left p-3">Titre</th><th className="text-left p-3">Cat.</th>
                    <th className="text-left p-3">Série</th><th className="text-left p-3">Ajouté le</th>
                    <th className="text-right p-3">Prix</th>
                    <th className="text-right p-3">Stock</th><th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-inksoft">Aucun produit ne correspond.</td></tr>}
                  {filteredProducts.map((p) => (
                    <tr key={p.id} className={`border-b border-ink/15 ${selectedIds.includes(p.id) ? "bg-comicyellow/30" : ""}`} data-testid={`row-${p.id}`}>
                      <td className="p-3 text-center">
                        <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} data-testid={`select-${p.id}`} />
                      </td>
                      <td className="p-3 flex items-center gap-2">
                        <img src={p.cover_image} alt="" onClick={() => setZoomImg({ src: p.cover_image, alt: p.title })}
                          data-testid={`product-thumb-${p.id}`}
                          className="w-8 h-10 object-cover cursor-zoom-in hover:opacity-80 transition-opacity" />
                        <div className="min-w-0">
                          <a href={`/product/${p.slug || p.id}`} target="_blank" rel="noreferrer"
                            data-testid={`product-view-${p.id}`}
                            className="line-clamp-1 hover:text-comicblue hover:underline" title="Voir le produit ↗">{p.title}</a>
                          <a href={`/product/${p.slug || p.id}`} target="_blank" rel="noreferrer"
                            className="font-mono text-[9px] uppercase text-inksoft hover:text-comicblue">Voir le produit ↗</a>
                        </div>
                      </td>
                      <td className="p-3">
                        <SeriesCell value={p.category || ""} options={catList} emptyLabel="Sans catégorie"
                          onSave={(v) => patchProduct(p.id, { category: v })} testid={`inline-category-${p.id}`} />
                      </td>
                      <td className="p-3">
                        <SeriesCell value={p.series || ""} options={seriesList.map((s) => s.name)}
                          onSave={(v) => patchProduct(p.id, { series: v })} testid={`inline-series-${p.id}`} />
                      </td>
                      <td className="p-3 text-xs text-inksoft">{p.created_at ? new Date(p.created_at).toLocaleDateString("fr-FR") : "—"}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <InlineField value={p.price} parse={parsePriceField} format={(x) => String(x ?? "").replace(".", ",")}
                          onSave={(v) => patchProduct(p.id, { price: v })} testid={`inline-price-${p.id}`} /> €
                      </td>
                      <td className={`p-3 text-right whitespace-nowrap ${p.stock <= 1 ? "text-comicred" : ""}`}>
                        <InlineField value={p.stock} parse={parseStockField}
                          onSave={(v) => patchProduct(p.id, { stock: v })} testid={`inline-stock-${p.id}`} />
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button onClick={async () => {
                          // La liste est allégée (sans descriptions) : récupérer la fiche complète
                          // pour préremplir les traductions EN/ES existantes et ne jamais les écraser.
                          try {
                            const { data } = await api.get(`/products/${p.id}`);
                            setForm({ ...EMPTY, ...data });
                          } catch { setForm({ ...EMPTY, ...p }); }
                        }} data-testid={`edit-${p.id}`} className="p-1.5 hover:text-comicblue"><Pencil size={15} /></button>
                        <button onClick={() => del(p.id)} data-testid={`delete-${p.id}`} className="p-1.5 hover:text-comicred"><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "orders" && (
          <>
            <h1 className="font-display font-black tracking-tighter text-2xl mb-4">Commandes reçues</h1>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <input data-testid="orders-search" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="Rechercher (client, email, article, réf.)"
                className="border-2 border-ink rounded-md px-3 py-2 font-mono text-xs bg-paper outline-none w-64" />
              <select data-testid="orders-filter-pay" value={orderPay} onChange={(e) => setOrderPay(e.target.value)}
                className="border-2 border-ink rounded-md px-3 py-2 font-mono text-xs bg-paper">
                <option value="all">Paiement : tous</option>
                <option value="paid">Payées</option>
                <option value="pending">En attente</option>
              </select>
              <select data-testid="orders-filter-ful" value={orderFul} onChange={(e) => setOrderFul(e.target.value)}
                className="border-2 border-ink rounded-md px-3 py-2 font-mono text-xs bg-paper">
                <option value="all">Commande : toutes</option>
                {Object.entries(ORDER_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
              {selectedOrders.length > 0 && (
                <button onClick={deleteSelected} data-testid="orders-delete-selected"
                  className="flex items-center gap-2 bg-comicred text-paper font-mono text-xs uppercase tracking-widest px-4 py-2 rounded-md border-2 border-ink hover:bg-ink transition-colors">
                  <Trash2 size={13} /> Supprimer ({selectedOrders.length})
                </button>
              )}
            </div>
            <div className="bg-paper border-2 border-ink rounded-md overflow-x-auto">
              <table className="w-full font-mono text-sm min-w-[1080px]">
                <thead className="bg-ink text-paper text-[11px] uppercase tracking-widest">
                  <tr>
                    <th className="p-3 w-8">
                      <input type="checkbox" data-testid="orders-check-all" checked={allSelected} onChange={toggleSelectAll}
                        className="accent-comicred w-4 h-4 cursor-pointer" />
                    </th>
                    <th className="text-left p-3">Réf.</th>
                    <Th k="created_at">Date</Th>
                    <Th k="customer">Client</Th>
                    <th className="text-left p-3">Articles</th>
                    <Th k="amount" className="!text-right">Montant</Th>
                    <th className="text-left p-3">Paiement</th>
                    <th className="text-left p-3">Commande</th>
                  </tr>
                </thead>
                <tbody>
                  {viewOrders.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-inksoft">Aucune commande.</td></tr>}
                  {viewOrders.map((o) => {
                    const fs = o.fulfillment_status || "a_traiter";
                    const badge = ORDER_BADGE[fs] || "border-ink/30 text-inksoft";
                    const next = NEXT_ACTION[fs];
                    const open = openOrder === o.session_id;
                    return (
                    <Fragment key={o.session_id}>
                    <tr className="border-b border-ink/15 cursor-pointer hover:bg-papersoft/60 transition-colors"
                      onClick={() => setOpenOrder(open ? null : o.session_id)}
                      data-testid={`order-${o.session_id}`}>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" data-testid={`order-check-${o.session_id}`}
                          checked={selectedOrders.includes(o.session_id)} onChange={() => toggleOrderSelect(o.session_id)}
                          className="accent-comicred w-4 h-4 cursor-pointer" />
                      </td>
                      <td className="p-3 text-xs text-inksoft">{o.session_id?.slice(-10)}</td>
                      <td className="p-3 text-xs whitespace-nowrap">{o.created_at ? new Date(o.created_at).toLocaleDateString("fr-FR") : "—"}</td>
                      <td className="p-3 text-xs" data-testid={`order-customer-${o.session_id}`}>
                        {o.customer?.name
                          ? <><span className="font-bold">{o.customer.name}</span><br/><span className="text-inksoft">{o.customer.email || ""}</span></>
                          : <span className="text-inksoft">—</span>}
                      </td>
                      <td className="p-3 text-xs max-w-[240px]">{(o.items || []).map((i, idx) => (
                        <span key={idx}>
                          {idx > 0 && ", "}
                          {i.slug
                            ? <a href={`/product/${i.slug}`} target="_blank" rel="noreferrer"
                                data-testid={`order-item-link-${i.product_id}`}
                                className="hover:text-comicblue hover:underline">{i.title} ×{i.quantity}</a>
                            : <span>{i.title} ×{i.quantity}</span>}
                        </span>
                      ))}</td>
                      <td className="p-3 text-right">{fmtPrice(o.amount || 0)}</td>
                      <td className="p-3">
                        <span className={`text-[10px] uppercase px-2 py-1 border ${o.payment_status === "paid" ? "bg-green-200 border-ink" : "border-ink/30 text-inksoft"}`}>
                          {o.payment_status === "paid" ? "payé" : o.payment_status}
                        </span>
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <span className={`inline-block text-[10px] uppercase px-2 py-1 border ${badge}`}
                          data-testid={`order-state-${o.session_id}`}>
                          {ORDER_LABELS[fs] || fs}
                        </span>
                        {fs === "terminee" && (
                          <p className="font-mono text-[10px] text-green-700 mt-1">✓ Commande terminée</p>
                        )}
                        {fs === "expediee" && o.tracking_number && (
                          <p className="font-mono text-[10px] text-inksoft mt-1">Suivi : {o.tracking_number}</p>
                        )}
                        {next && (
                          <button onClick={() => updateStatus(o.session_id, next.to)}
                            data-testid={`order-action-${o.session_id}`}
                            className="mt-1.5 block font-mono text-[10px] uppercase tracking-wider text-comicblue underline hover:text-comicred">
                            → {next.label}
                          </button>
                        )}
                      </td>
                    </tr>
                    {open && (
                    <tr className="border-b border-ink/15 bg-papersoft/40" data-testid={`order-detail-${o.session_id}`}>
                      <td colSpan={8} className="p-5">
                        <div className="grid sm:grid-cols-3 gap-6 text-xs">
                          <div>
                            <p className="uppercase tracking-widest text-[10px] text-comicred mb-2">Client</p>
                            <p className="font-bold">{o.customer?.name || "—"}</p>
                            {o.customer?.email && <p><a className="underline" href={`mailto:${o.customer.email}`}>{o.customer.email}</a></p>}
                            {o.customer?.phone && <p>{o.customer.phone}</p>}
                            <p className="text-inksoft mt-2">Réf. complète : {o.session_id}</p>
                          </div>
                          <div>
                            <p className="uppercase tracking-widest text-[10px] text-comicred mb-2">Adresse de livraison</p>
                            {o.shipping?.address
                              ? <>{o.shipping.name && <p className="font-bold">{o.shipping.name}</p>}{fmtAddr(o.shipping.address).map((l, i) => <p key={i}>{l}</p>)}</>
                              : o.billing?.address
                                ? <>{o.billing.name && <p className="font-bold">{o.billing.name}</p>}{fmtAddr(o.billing.address).map((l, i) => <p key={i}>{l}</p>)}<p className="text-inksoft italic mt-1">Identique à la facturation</p></>
                                : <p className="text-inksoft">Non renseignée</p>}
                          </div>
                          <div>
                            <p className="uppercase tracking-widest text-[10px] text-comicred mb-2">Adresse de facturation</p>
                            {o.billing?.address
                              ? <>{o.billing.name && <p className="font-bold">{o.billing.name}</p>}{fmtAddr(o.billing.address).map((l, i) => <p key={i}>{l}</p>)}</>
                              : <p className="text-inksoft">Non renseignée</p>}
                          </div>
                        </div>
                        <div className="mt-4 border-t border-ink/15 pt-3" data-testid={`order-shipping-${o.session_id}`}>
                          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6 text-xs">
                            <div>
                              <p className="uppercase tracking-widest text-[10px] text-comicred mb-2">Paiement</p>
                              <span className={`text-[10px] uppercase px-2 py-1 border ${o.payment_status === "paid" ? "bg-green-200 border-ink" : "border-ink/30 text-inksoft"}`}>
                                {o.payment_status === "paid" ? "Payé" : o.payment_status}
                              </span>
                            </div>
                            <div>
                              <p className="uppercase tracking-widest text-[10px] text-comicred mb-2">Commande</p>
                              <span className={`inline-block text-[10px] uppercase px-2 py-1 border ${badge}`}>{ORDER_LABELS[fs] || fs}</span>
                              <select value={fs} data-testid={`order-status-${o.session_id}`}
                                onChange={(e) => updateStatus(o.session_id, e.target.value)}
                                className="mt-2 block border-2 border-ink rounded-md px-2 py-1 text-xs bg-papersoft">
                                {Object.entries(ORDER_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                              </select>
                              {next && (
                                <button onClick={() => updateStatus(o.session_id, next.to)}
                                  data-testid={`order-action-detail-${o.session_id}`}
                                  className="mt-2 block font-mono text-[10px] uppercase tracking-wider text-comicblue underline hover:text-comicred">
                                  → {next.label}
                                </button>
                              )}
                              {fs === "terminee" && <p className="font-mono text-[10px] text-green-700 mt-2">✓ Commande terminée</p>}
                            </div>
                            <div>
                              <p className="uppercase tracking-widest text-[10px] text-comicred mb-2">Livraison</p>
                              {o.shipping_method === "mondial_relay" ? (
                                <>
                                  <p className="font-bold mb-1"><span className="bg-comicblue text-paper px-2 py-0.5 uppercase text-[10px] border border-ink">Mondial Relay — {o.relay_point_type || "Point Relais"}</span></p>
                                  <p className="font-bold">{o.relay_point_name}</p>
                                  <p>{o.relay_point_address}</p>
                                  <p>{o.relay_point_postal_code} {o.relay_point_city}</p>
                                  <p className="text-inksoft mt-1">Identifiant : {o.relay_point_id}</p>
                                </>
                              ) : o.shipping_method === "home_delivery" ? (
                                <p className="font-bold"><span className="bg-comicyellow px-2 py-0.5 uppercase text-[10px] border border-ink">Livraison à domicile</span></p>
                              ) : (
                                <p className="text-inksoft">Mode non renseigné (commande antérieure)</p>
                              )}
                              {o.shipping_price != null && <p className="mt-1 text-inksoft">Frais : {fmtPrice(o.shipping_price)}</p>}
                            </div>
                            <div>
                              <p className="uppercase tracking-widest text-[10px] text-comicred mb-2">État transporteur</p>
                              {CARRIER_STATUS_LABELS[o.shipping_status]
                                ? <span className="inline-block text-[10px] uppercase px-2 py-1 border border-ink bg-papersoft"
                                    data-testid={`order-carrier-status-${o.session_id}`}>{CARRIER_STATUS_LABELS[o.shipping_status]}</span>
                                : <p className="text-inksoft text-[10px]">Disponible automatiquement une fois le suivi Mondial Relay connecté.</p>}
                            </div>
                            <div>
                              <p className="uppercase tracking-widest text-[10px] text-comicred mb-2">Suivi</p>
                              <p className="text-inksoft">Transporteur : {o.shipping_method === "mondial_relay" ? "Mondial Relay" : o.shipping_method === "home_delivery" ? "Courrier suivi" : "—"}</p>
                              <div className="mt-2 flex items-center gap-2">
                                <input placeholder="N° de suivi" defaultValue={o.tracking_number || ""}
                                  data-testid={`order-tracking-${o.session_id}`}
                                  onBlur={(e) => e.target.value.trim() !== (o.tracking_number || "") && updateShipping(o.session_id, { tracking_number: e.target.value })}
                                  className="border-2 border-ink rounded-md px-2 py-1 text-xs bg-papersoft w-32" />
                                {o.tracking_number && (
                                  <a href={`https://www.mondialrelay.fr/suivi-de-colis/?NumeroExpedition=${encodeURIComponent(o.tracking_number)}`}
                                    target="_blank" rel="noreferrer" data-testid={`order-tracking-link-${o.session_id}`}
                                    className="font-mono text-[10px] uppercase underline text-comicblue">Voir le suivi</a>
                                )}
                              </div>
                              {o.shipped_at && <p className="text-inksoft mt-1 text-[10px]">Expédiée le {new Date(o.shipped_at).toLocaleDateString("fr-FR")}</p>}
                              {o.shipping_method === "mondial_relay" && (
                                mrStatus?.api2_configured
                                  ? <button data-testid={`order-create-shipment-${o.session_id}`}
                                      onClick={() => api.post(`/admin/orders/${o.session_id}/create-shipment`).then(() => toast.success("Expédition créée")).catch((e) => toast.error(e.response?.data?.detail || "Erreur"))}
                                      className="mt-2 flex items-center gap-1.5 border-2 border-ink rounded-md px-3 py-1.5 font-mono text-[10px] uppercase hover:bg-papersoft">
                                      <Truck size={12} /> Créer l'expédition Mondial Relay
                                    </button>
                                  : <p className="mt-2 font-mono text-[10px] text-inksoft italic" data-testid={`order-shipment-unavailable-${o.session_id}`}>
                                      Création d'étiquette : disponible une fois le compte marchand Mondial Relay connecté
                                    </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 border-t border-ink/15 pt-3">
                          <p className="uppercase tracking-widest text-[10px] text-comicred mb-2">Détail des articles</p>
                          {(o.items || []).map((i, idx) => (
                            <p key={idx} className="text-xs">
                              {i.slug
                                ? <a href={`/product/${i.slug}`} target="_blank" rel="noreferrer"
                                    className="hover:text-comicblue hover:underline">{i.title}</a>
                                : i.title}
                              {" "}×{i.quantity} — {fmtPrice((i.price || 0) * i.quantity)}
                            </p>
                          ))}
                        </div>
                      </td>
                    </tr>
                    )}
                    </Fragment>
                  ); })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "series" && (
          <>
            <h1 className="font-display font-black tracking-tighter text-2xl mb-4">Séries</h1>
            <form onSubmit={addSeries} className="flex gap-2 mb-6 max-w-md">
              <input data-testid="new-series-input" value={newSeries} onChange={(e) => setNewSeries(e.target.value)}
                placeholder="Nom de la nouvelle série (ex. Spider-Man)"
                className="flex-1 border-2 border-ink rounded-md px-3 py-2.5 font-mono text-sm bg-paper outline-none" />
              <button type="submit" data-testid="add-series-btn"
                className="flex items-center gap-2 bg-comicred text-paper font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink hover:bg-ink transition-colors">
                <Plus size={14} /> Ajouter
              </button>
            </form>
            <div className="bg-paper border-2 border-ink rounded-md overflow-x-auto">
              <table className="w-full font-mono text-sm min-w-[480px]">
                <thead className="bg-ink text-paper text-[11px] uppercase tracking-widest">
                  <tr><th className="text-left p-3">Série</th><th className="text-right p-3">Produits</th><th className="text-right p-3">Actions</th></tr>
                </thead>
                <tbody>
                  {seriesList.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-inksoft">Aucune série. Ajoutez-en une ci-dessus.</td></tr>}
                  {seriesList.map((s) => (
                    <tr key={s.id} className="border-b border-ink/15" data-testid={`series-row-${s.id}`}>
                      <td className="p-3 font-display font-bold">{s.name}</td>
                      <td className="p-3 text-right">{s.product_count}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button onClick={() => renameSeries(s)} data-testid={`series-edit-${s.id}`} className="p-1.5 hover:text-comicblue"><Pencil size={15} /></button>
                        <button onClick={() => delSeries(s)} data-testid={`series-delete-${s.id}`} className="p-1.5 hover:text-comicred"><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "categories" && (
          <>
            <h1 className="font-display font-black tracking-tighter text-2xl mb-4">Catégories produits</h1>
            <p className="font-mono text-xs text-inksoft mb-5 border-l-2 border-comicred pl-3 max-w-2xl">
              Liste utilisée dans la table Stock, le formulaire produit et l'import IA.
              Renommer met à jour les produits associés ; supprimer les passe en « Sans catégorie » (jamais supprimés).
            </p>
            <form onSubmit={addCat} className="flex gap-2 mb-6 max-w-md">
              <input data-testid="new-category-input" value={newCat} onChange={(e) => setNewCat(e.target.value)}
                placeholder="Nom de la nouvelle catégorie (ex. Manga)"
                className="flex-1 border-2 border-ink rounded-md px-3 py-2.5 font-mono text-sm bg-paper outline-none" />
              <button type="submit" data-testid="add-category-btn"
                className="flex items-center gap-2 bg-comicred text-paper font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink hover:bg-ink transition-colors">
                <Plus size={14} /> Ajouter
              </button>
            </form>
            <div className="bg-paper border-2 border-ink rounded-md overflow-x-auto">
              <table className="w-full font-mono text-sm min-w-[480px]">
                <thead className="bg-ink text-paper text-[11px] uppercase tracking-widest">
                  <tr><th className="text-left p-3">Catégorie</th><th className="text-right p-3">Actions</th></tr>
                </thead>
                <tbody>
                  {catList.length === 0 && <tr><td colSpan={2} className="p-8 text-center text-inksoft">Aucune catégorie. Ajoutez-en une ci-dessus.</td></tr>}
                  {catList.map((cat) => (
                    <tr key={cat} className="border-b border-ink/15" data-testid={`category-row-${cat}`}>
                      <td className="p-3 font-display font-bold">{cat}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button onClick={() => renameCat(cat)} data-testid={`category-edit-${cat}`} className="p-1.5 hover:text-comicblue"><Pencil size={15} /></button>
                        <button onClick={() => delCat(cat)} data-testid={`category-delete-${cat}`} className="p-1.5 hover:text-comicred"><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "salons" && (
          <>
            <div className="flex justify-between items-center mb-4">
              <h1 className="font-display font-black tracking-tighter text-2xl">Salons & conventions</h1>
              <button onClick={() => setSalonForm({ ...SALON_EMPTY })} data-testid="add-salon-btn"
                className="flex items-center gap-2 bg-comicred text-paper font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink hover:bg-ink transition-colors">
                <Plus size={14} /> Ajouter un salon
              </button>
            </div>
            <div className="bg-paper border-2 border-ink rounded-md overflow-x-auto">
              <table className="w-full font-mono text-sm min-w-[720px]">
                <thead className="bg-ink text-paper text-[11px] uppercase tracking-widest">
                  <tr>
                    <th className="text-left p-3">Dates</th><th className="text-left p-3">Ville</th>
                    <th className="text-left p-3">Événement</th><th className="text-left p-3">Note</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {salons.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-inksoft">Aucun salon.</td></tr>}
                  {salons.map((s) => (
                    <tr key={s.id} className="border-b border-ink/15" data-testid={`salon-row-${s.id}`}>
                      <td className="p-3 text-comicred uppercase">{s.date_label}</td>
                      <td className="p-3 font-display font-bold">{s.city}{s.country ? `, ${s.country}` : ""}</td>
                      <td className="p-3">{s.name}</td>
                      <td className="p-3 text-xs text-inksoft">{s.note}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button onClick={() => setSalonForm({ ...s })} data-testid={`salon-edit-${s.id}`} className="p-1.5 hover:text-comicblue"><Pencil size={15} /></button>
                        <button onClick={() => delSalon(s.id)} data-testid={`salon-delete-${s.id}`} className="p-1.5 hover:text-comicred"><Trash2 size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4" onClick={() => setForm(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} data-testid="product-form"
            className="bg-paper border-2 border-ink rounded-md w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="font-display font-black text-xl mb-5">{form.id ? "Modifier" : "Nouvelle BD"}</h2>
            <div className="grid grid-cols-2 gap-3 font-mono text-sm">
              {[["title", "Titre", "col-span-2"], ["author", "Auteur", "col-span-2"], ["publisher", "Éditeur"],
                ["issue", "N°"], ["year", "Année"], ["price", "Prix €"], ["stock", "Stock"],
                ["condition", "État", "col-span-2"]].map(([k, l, cls]) => (
                <div key={k} className={cls || ""}>
                  <label className="text-[10px] uppercase tracking-widest text-inksoft">{l}</label>
                  <input data-testid={`field-${k}`} required={k === "title" || k === "price"} type={k === "price" || k === "stock" ? "number" : "text"} step="0.01"
                    value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft outline-none rounded-md" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Image de couverture</label>
                <div className="flex items-center gap-3 mt-1">
                  <div className="w-16 h-20 border-2 border-ink bg-papersoft shrink-0 overflow-hidden flex items-center justify-center">
                    {form.cover_image ? <img src={form.cover_image} alt="" className="w-full h-full object-cover" />
                      : <span className="text-[9px] text-inksoft text-center px-1">Aucune</span>}
                  </div>
                  <label data-testid="upload-cover-btn"
                    className="flex-1 cursor-pointer border-2 border-dashed border-ink rounded-md px-3 py-4 flex items-center justify-center gap-2 hover:bg-papersoft transition-colors text-xs uppercase tracking-widest">
                    {uploading ? <><Loader2 size={14} className="animate-spin" /> Chargement…</>
                      : <><Upload size={14} /> Charger depuis l'ordinateur</>}
                    <input data-testid="cover-file-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
                      disabled={uploading} onChange={(e) => uploadCover(e.target.files?.[0])} />
                  </label>
                </div>
                <p className="text-[10px] text-inksoft mt-1">JPG, PNG, GIF ou WEBP · 8 Mo max</p>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Catégorie</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  data-testid="product-form-category"
                  className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft rounded-md">
                  <option value="">Sans catégorie</option>
                  {form.category && !catList.includes(form.category) && <option value={form.category}>{form.category}</option>}
                  {catList.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Série</label>
                <select data-testid="field-series" value={form.series || ""} onChange={(e) => setForm({ ...form, series: e.target.value })}
                  className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft rounded-md">
                  <option value="">Aucune série</option>
                  {seriesList.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <p className="text-[10px] text-inksoft mt-1">Gérez la liste dans l'onglet « Séries ».</p>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-inksoft">L'œil du Moulin — Type</label>
                <select data-testid="field-moulin-eye-type" value={form.moulin_eye_type || ""} onChange={(e) => setForm({ ...form, moulin_eye_type: e.target.value })}
                  className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft rounded-md">
                  {["", "À LIRE", "BELLE COUVERTURE", "PETIT PRIX", "À DÉNICHER", "POUR COMMENCER", "CONSEIL DU MOULIN"].map((v) => (
                    <option key={v || "none"} value={v}>{v || "Aucun"}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-inksoft">L'œil du Moulin — Commentaire</label>
                <textarea data-testid="field-moulin-eye-text" value={form.moulin_eye_text || ""} onChange={(e) => setForm({ ...form, moulin_eye_text: e.target.value })} rows={3}
                  placeholder="Note éditoriale du Moulin (facultatif) — laisser vide pour ne rien afficher"
                  className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft outline-none rounded-md" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Description (FR)</label>
                <textarea data-testid="field-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
                  className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft outline-none rounded-md" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Description (EN)</label>
                <textarea data-testid="field-description-en" value={form.description_en || ""} onChange={(e) => setForm({ ...form, description_en: e.target.value })} rows={3}
                  placeholder="English description (optionnel)"
                  className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft outline-none rounded-md" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Description (ES)</label>
                <textarea data-testid="field-description-es" value={form.description_es || ""} onChange={(e) => setForm({ ...form, description_es: e.target.value })} rows={3}
                  placeholder="Descripción en español (opcional)"
                  className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft outline-none rounded-md" />
              </div>
              <label className="col-span-2 flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
                <span className="text-xs uppercase tracking-widest">Mettre en avant (sélection accueil)</span>
              </label>
            </div>
            <div className="flex gap-2 mt-6">
              <button type="button" onClick={() => setForm(null)} className="flex-1 border-2 border-ink py-3 font-mono text-xs uppercase rounded-md">Annuler</button>
              <button type="submit" data-testid="save-product-btn" className="flex-1 bg-ink text-paper py-3 font-mono text-xs uppercase rounded-md hover:bg-comicred transition-colors">Enregistrer</button>
            </div>
          </form>
        </div>
      )}

      {salonForm && (
        <div className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4" onClick={() => setSalonForm(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={saveSalon} data-testid="salon-form"
            className="bg-paper border-2 border-ink rounded-md w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display font-black text-xl mb-5">{salonForm.id ? "Modifier le salon" : "Nouveau salon"}</h2>
            <div className="grid grid-cols-2 gap-3 font-mono text-sm">
              {[["date_label", "Dates (ex. 24–27 JAN 2026)", "col-span-2"], ["city", "Ville"], ["country", "Pays"],
                ["name", "Événement", "col-span-2"], ["website", "Site officiel (URL)", "col-span-2"],
                ["ordre", "Ordre d'affichage (vide = automatique)", "col-span-2"], ["note", "Note", "col-span-2"]].map(([k, l, cls]) => (
                <div key={k} className={cls || ""}>
                  <label className="text-[10px] uppercase tracking-widest text-inksoft">{l}</label>
                  <input data-testid={`salon-field-${k}`} required={k === "city" || k === "name"}
                    type={k === "ordre" ? "number" : "text"}
                    value={salonForm[k] ?? ""}
                    onChange={(e) => setSalonForm({ ...salonForm, [k]: k === "ordre" ? (e.target.value === "" ? null : parseInt(e.target.value, 10)) : e.target.value })}
                    className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft outline-none rounded-md" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Description</label>
                <textarea data-testid="salon-field-description" rows={3} value={salonForm.description || ""}
                  onChange={(e) => setSalonForm({ ...salonForm, description: e.target.value })}
                  className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft outline-none rounded-md" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Photo</label>
                <div className="flex items-center gap-3 mt-1">
                  <div className="w-16 h-20 border-2 border-ink bg-papersoft shrink-0 overflow-hidden flex items-center justify-center">
                    {salonForm.photo ? <img src={salonForm.photo} alt="" className="w-full h-full object-cover" />
                      : <span className="text-[9px] text-inksoft text-center px-1">Aucune</span>}
                  </div>
                  <label data-testid="salon-photo-upload"
                    className="flex-1 cursor-pointer border-2 border-dashed border-ink rounded-md px-3 py-4 flex items-center justify-center gap-2 hover:bg-papersoft transition-colors text-xs uppercase tracking-widest">
                    {salonUploading ? <><Loader2 size={14} className="animate-spin" /> Chargement…</>
                      : <><Upload size={14} /> {salonForm.photo ? "Remplacer la photo" : "Charger une photo"}</>}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={salonUploading}
                      onChange={(e) => uploadSalonPhoto(e.target.files?.[0])} />
                  </label>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button type="button" onClick={() => setSalonForm(null)} className="flex-1 border-2 border-ink py-3 font-mono text-xs uppercase rounded-md">Annuler</button>
              <button type="submit" data-testid="save-salon-btn" className="flex-1 bg-ink text-paper py-3 font-mono text-xs uppercase rounded-md hover:bg-comicred transition-colors">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
      {zoomImg && (
        <div className="fixed inset-0 bg-ink/80 z-[90] flex items-center justify-center p-4" onClick={() => setZoomImg(null)}
          data-testid="image-zoom-modal">
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setZoomImg(null)} data-testid="image-zoom-close" aria-label="Fermer"
              className="absolute -top-3 -right-3 bg-comicred text-paper border-2 border-ink rounded-full p-2 z-10 hover:bg-ink transition-colors">
              <X size={16} />
            </button>
            <img src={zoomImg.src} alt={zoomImg.alt} className="w-full max-h-[80vh] object-contain border-2 border-ink bg-paper" />
          </div>
        </div>
      )}
    </div>
  );
}
