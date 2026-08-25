import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, LogOut, Package, Receipt, Upload, Loader2, Tags } from "lucide-react";
import { api, fmtPrice, API } from "../lib/api";

const EMPTY = { title: "", author: "", series: "", publisher: "", category: "VO", price: "", stock: 1,
  condition: "Très bon état", year: "", issue: "", description: "", cover_image: "", featured: false };

export default function Admin() {
  const nav = useNavigate();
  const [tab, setTab] = useState("stock");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [newSeries, setNewSeries] = useState("");
  const [form, setForm] = useState(null);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const load = useCallback(() => {
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/admin/orders").then((r) => setOrders(r.data)).catch(() => {});
    api.get("/admin/series").then((r) => setSeriesList(r.data)).catch(() => {});
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

  const updateStatus = async (sessionId, status) => {
    try {
      await api.put(`/admin/orders/${sessionId}/status`, { fulfillment_status: status });
      setOrders((prev) => prev.map((o) => (o.session_id === sessionId ? { ...o, fulfillment_status: status } : o)));
      toast.success("Statut mis à jour");
    } catch (e) { toast.error(e.response?.data?.detail || "Erreur"); }
  };

  if (!ready) return <div className="min-h-screen bg-ink text-paper flex items-center justify-center font-mono text-sm">Chargement…</div>;

  return (
    <div className="min-h-screen bg-papersoft">
      <header className="bg-ink text-paper border-b-2 border-ink sticky top-0 z-40">
        <div className="max-w-[1300px] mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="bg-comicred font-anton px-2 py-0.5">MC</span>
            <span className="font-mono text-sm uppercase tracking-widest">Admin · Moulin Comics</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" target="_blank" rel="noreferrer" className="font-mono text-xs uppercase hover:text-comicyellow px-3">Voir le site ↗</a>
            <button onClick={logout} data-testid="admin-logout" className="flex items-center gap-2 border border-paper/40 px-3 py-1.5 font-mono text-xs uppercase hover:bg-comicred transition-colors">
              <LogOut size={14} /> Quitter
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1300px] mx-auto px-5 py-8">
        <div className="flex gap-2 mb-6">
          <button onClick={() => setTab("stock")} className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink ${tab === "stock" ? "bg-ink text-paper" : "bg-paper"}`}>
            <Package size={14} /> Stock ({products.length})
          </button>
          <button onClick={() => setTab("orders")} data-testid="tab-orders" className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink ${tab === "orders" ? "bg-ink text-paper" : "bg-paper"}`}>
            <Receipt size={14} /> Commandes ({orders.length})
          </button>
          <button onClick={() => setTab("series")} data-testid="tab-series" className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink ${tab === "series" ? "bg-ink text-paper" : "bg-paper"}`}>
            <Tags size={14} /> Séries ({seriesList.length})
          </button>
        </div>

        {tab === "stock" && (
          <>
            <div className="flex justify-between items-center mb-4">
              <h1 className="font-display font-black tracking-tighter text-2xl">Inventaire</h1>
              <button onClick={() => setForm({ ...EMPTY })} data-testid="add-product-btn"
                className="flex items-center gap-2 bg-comicred text-paper font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-md border-2 border-ink hover:bg-ink transition-colors">
                <Plus size={14} /> Ajouter une BD
              </button>
            </div>
            <div className="bg-paper border-2 border-ink rounded-md overflow-x-auto">
              <table className="w-full font-mono text-sm min-w-[720px]">
                <thead className="bg-ink text-paper text-[11px] uppercase tracking-widest">
                  <tr>
                    <th className="text-left p-3">Titre</th><th className="text-left p-3">Cat.</th>
                    <th className="text-left p-3">Série</th><th className="text-right p-3">Prix</th>
                    <th className="text-right p-3">Stock</th><th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b border-ink/15" data-testid={`row-${p.id}`}>
                      <td className="p-3 flex items-center gap-2">
                        <img src={p.cover_image} alt="" className="w-8 h-10 object-cover" />
                        <span className="line-clamp-1">{p.title}</span>
                      </td>
                      <td className="p-3">{p.category}</td>
                      <td className="p-3">{p.series || "—"}</td>
                      <td className="p-3 text-right">{fmtPrice(p.price)}</td>
                      <td className={`p-3 text-right ${p.stock <= 1 ? "text-comicred" : ""}`}>{p.stock}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button onClick={() => setForm({ ...p })} data-testid={`edit-${p.id}`} className="p-1.5 hover:text-comicblue"><Pencil size={15} /></button>
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
            <div className="bg-paper border-2 border-ink rounded-md overflow-x-auto">
              <table className="w-full font-mono text-sm min-w-[820px]">
                <thead className="bg-ink text-paper text-[11px] uppercase tracking-widest">
                  <tr>
                    <th className="text-left p-3">Réf.</th><th className="text-left p-3">Articles</th>
                    <th className="text-right p-3">Montant</th><th className="text-left p-3">Paiement</th>
                    <th className="text-left p-3">Traitement</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-inksoft">Aucune commande.</td></tr>}
                  {orders.map((o) => {
                    const fs = o.fulfillment_status || "en_attente";
                    const badge = { en_attente: "border-ink/30 text-inksoft", expediee: "bg-comicblue text-paper border-ink", livree: "bg-comicyellow border-ink" }[fs];
                    return (
                    <tr key={o.session_id} className="border-b border-ink/15" data-testid={`order-${o.session_id}`}>
                      <td className="p-3 text-xs text-inksoft">{o.session_id?.slice(-10)}</td>
                      <td className="p-3 text-xs max-w-[240px]">{(o.items || []).map((i) => `${i.title} ×${i.quantity}`).join(", ")}</td>
                      <td className="p-3 text-right">{fmtPrice(o.amount || 0)}</td>
                      <td className="p-3">
                        <span className={`text-[10px] uppercase px-2 py-1 border ${o.payment_status === "paid" ? "bg-green-200 border-ink" : "border-ink/30 text-inksoft"}`}>
                          {o.payment_status === "paid" ? "payé" : o.payment_status}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase px-2 py-1 border ${badge}`}>
                            {{ en_attente: "En attente", expediee: "Expédiée", livree: "Livrée" }[fs]}
                          </span>
                          <select data-testid={`order-status-${o.session_id}`} value={fs}
                            onChange={(e) => updateStatus(o.session_id, e.target.value)}
                            className="border-2 border-ink rounded-md px-2 py-1 text-xs bg-papersoft">
                            <option value="en_attente">En attente</option>
                            <option value="expediee">Expédiée</option>
                            <option value="livree">Livrée</option>
                          </select>
                        </div>
                      </td>
                    </tr>
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
                  className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft rounded-md">
                  <option value="VO">VO</option><option value="VF">VF</option>
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
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
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
    </div>
  );
}
