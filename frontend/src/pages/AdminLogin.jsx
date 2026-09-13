import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Seo } from "../components/Seo";

export default function AdminLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      await api.post("/auth/login", { email, password });
      nav("/admin");
    } catch (e) {
      const d = e.response?.data?.detail;
      setErr(typeof d === "string" ? d : "Connexion impossible");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <Seo title="Espace gérant | Moulin Comics" noindex />
      <form onSubmit={submit} className="w-full max-w-sm bg-paper border-2 border-ink p-8 shadow-hardlg" data-testid="admin-login-form">
        <span className="bg-ink text-paper font-anton text-xl px-2 py-0.5">MC</span>
        <h1 className="font-display font-black tracking-tighter text-2xl mt-5">Espace gérant</h1>
        <p className="font-mono text-xs text-inksoft mt-1 mb-6">Gestion du stock Moulin Comics</p>
        {err && <p className="font-mono text-xs text-comicred border border-comicred p-2 mb-4">{err}</p>}
        <label className="font-mono text-[11px] uppercase tracking-widest">Email</label>
        <input data-testid="admin-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
          className="w-full border-2 border-ink px-3 py-2.5 font-mono text-sm mt-1 mb-4 bg-papersoft outline-none" />
        <label className="font-mono text-[11px] uppercase tracking-widest">Mot de passe</label>
        <input data-testid="admin-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
          className="w-full border-2 border-ink px-3 py-2.5 font-mono text-sm mt-1 mb-6 bg-papersoft outline-none" />
        <button data-testid="admin-login-submit" disabled={loading}
          className="w-full bg-comicred text-paper font-mono uppercase text-sm tracking-widest py-3 border-2 border-ink hover:bg-ink transition-colors disabled:opacity-50">
          {loading ? "…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
