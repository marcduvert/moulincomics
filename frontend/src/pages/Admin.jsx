import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, LogOut, Package, Receipt } from "lucide-react";
import { api, fmtPrice } from "../lib/api";

const EMPTY = { title: "", series: "", publisher: "", category: "VO", price: "", stock: 1,
  condition: "Très bon état", year: "", issue: "", description: "", cover_image: "", featured: false };

export default function Admin() {
  const nav = useNavigate();
  const [tab, setTab] = useState("stock");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(() => {
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/admin/orders").then((r) => setOrders(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/auth/me").then(() => { setReady(true); load(); })
      .catch(() => nav("/admin/login"));
  }, [nav, load]);

  const logout = async () => { await api.post("/auth/logout"); nav("/admin/login"); };

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
          <div className="bg-paper border-2 border-ink rounded-md overflow-x-auto">
            <table className="w-full font-mono text-sm min-w-[640px]">
              <thead className="bg-ink text-paper text-[11px] uppercase tracking-widest">
                <tr><th className="text-left p-3">Session</th><th className="text-left p-3">Articles</th><th className="text-right p-3">Montant</th><th className="text-left p-3">Statut</th></tr>
              </thead>
              <tbody>
                {orders.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-inksoft">Aucune commande.</td></tr>}
                {orders.map((o) => (
                  <tr key={o.session_id} className="border-b border-ink/15">
                    <td className="p-3 text-xs text-inksoft">{o.session_id?.slice(-10)}</td>
                    <td className="p-3 text-xs">{(o.items || []).map((i) => `${i.title} ×${i.quantity}`).join(", ")}</td>
                    <td className="p-3 text-right">{fmtPrice(o.amount || 0)}</td>
                    <td className="p-3">
                      <span className={`text-[10px] uppercase px-2 py-1 border ${o.payment_status === "paid" ? "bg-comicyellow border-ink" : "border-ink/30 text-inksoft"}`}>
                        {o.payment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 bg-ink/60 z-50 flex items-center justify-center p-4" onClick={() => setForm(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} data-testid="product-form"
            className="bg-paper border-2 border-ink rounded-md w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="font-display font-black text-xl mb-5">{form.id ? "Modifier" : "Nouvelle BD"}</h2>
            <div className="grid grid-cols-2 gap-3 font-mono text-sm">
              {[["title", "Titre", "col-span-2"], ["series", "Série"], ["publisher", "Éditeur"],
                ["issue", "N°"], ["year", "Année"], ["price", "Prix €"], ["stock", "Stock"],
                ["condition", "État"], ["cover_image", "URL image", "col-span-2"]].map(([k, l, cls]) => (
                <div key={k} className={cls || ""}>
                  <label className="text-[10px] uppercase tracking-widest text-inksoft">{l}</label>
                  <input data-testid={`field-${k}`} required={k === "title" || k === "price"} type={k === "price" || k === "stock" ? "number" : "text"} step="0.01"
                    value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft outline-none rounded-md" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-widest text-inksoft">Catégorie</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full border-2 border-ink px-2 py-2 mt-1 bg-papersoft rounded-md">
                  <option value="VO">VO</option><option value="VF">VF</option>
                </select>
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
