import { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useLang } from "../context/LanguageContext";
import { useContent } from "../context/ContentContext";
import { Seo } from "../components/Seo";
import { Reveal } from "../components/Reveal";

export default function Contact() {
  const { t, lang } = useLang();
  const { content } = useContent();
  const cBase = content?.contact || {};
  const cc = lang === "fr" ? cBase : { ...cBase, ...(cBase[lang] || {}) };
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || !form.message.trim()) {
      toast.error(t.contact.required);
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      toast.error(t.contact.invalidEmail);
      return;
    }
    setSending(true);
    try {
      await api.post("/contact", {
        name: form.name.trim(), email: form.email.trim(),
        subject: form.subject.trim(), message: form.message.trim(),
      });
      toast.success(t.contact.success);
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      toast.error(err.response?.data?.detail || t.contact.error);
    } finally { setSending(false); }
  };

  const inputCls = "w-full border-2 border-ink rounded-md px-4 py-3 bg-papersoft font-mono text-sm outline-none focus:bg-paper";

  return (
    <div>
      <Seo title={`${t.contact.title} | Moulin Comics`}
        description="Contactez Moulin Comics — comics Marvel, DC et BD de collection." path="/contact" />
      <div className="border-b-2 border-ink">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-12 sm:py-16">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-comicred mb-2">Moulin Comics</p>
          <h1 className="font-display font-black tracking-tighter text-4xl sm:text-5xl lg:text-6xl">{t.contact.title}</h1>
        </div>
      </div>
      <div className="max-w-[640px] mx-auto px-4 sm:px-8 py-12 sm:py-16">
        <Reveal>
          {cc.photo && (
            <img src={cc.photo} alt="Moulin Comics — Contact" data-testid="contact-photo"
              className="w-full aspect-[16/9] object-cover border-2 border-ink mb-8" />
          )}
          <p className="font-mono text-sm text-inksoft mb-8" data-testid="contact-top-text">{cc.top_text || t.contact.intro}</p>
          <form onSubmit={submit} data-testid="contact-form" className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">{t.contact.name}</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  data-testid="contact-name" className={inputCls} />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">{t.contact.email}</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  data-testid="contact-email" className={inputCls} />
              </div>
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">{t.contact.subject}</label>
              <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                data-testid="contact-subject" className={inputCls} />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-inksoft block mb-1">{t.contact.message}</label>
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={6} data-testid="contact-message" className={inputCls} />
            </div>
            <button type="submit" disabled={sending} data-testid="contact-send"
              className="flex items-center gap-2 bg-comicred text-paper font-mono uppercase tracking-[0.2em] text-sm px-8 py-4 border-2 border-ink hover:bg-ink transition-colors disabled:opacity-40">
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {sending ? t.contact.sending : t.contact.send}
            </button>
          </form>
          {cc.bottom_text && (
            <p className="font-mono text-xs text-inksoft mt-6 leading-relaxed" data-testid="contact-bottom-text">{cc.bottom_text}</p>
          )}
        </Reveal>
      </div>
    </div>
  );
}
