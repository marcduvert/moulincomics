import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useLang } from "../context/LanguageContext";
import { Marquee } from "../components/Marquee";
import { Reveal } from "../components/Reveal";
import { MapPin } from "lucide-react";
import { Seo } from "../components/Seo";

const CONV = "https://images.pexels.com/photos/36398813/pexels-photo-36398813.jpeg?auto=compress&cs=tinysrgb&w=1200";
const CROWD = "https://images.unsplash.com/photo-1578434972378-e3c393d983db?crop=entropy&cs=srgb&fm=jpg&q=85&w=1000";

export default function Conventions() {
  const { t } = useLang();
  const [events, setEvents] = useState([]);
  useEffect(() => { api.get("/salons").then((r) => setEvents(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (window.location.hash === "#agenda") {
      const timer = setTimeout(() => {
        document.getElementById("agenda")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, []);
  return (
    <div>
      <Seo
        title="Salons & conventions BD — Moulin Comics en tournée | Moulin Comics"
        description="Moulin Comics sillonne les salons et conventions BD en Europe : Angoulême, Paris, Bruxelles, Lucca. Venez chiner comics VO et mensuels VF à notre stand."
        path="/conventions"
      />
      <section className="relative border-b-2 border-ink overflow-hidden">
        <img src={CONV} alt="Stand Moulin Comics en convention BD" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-ink/60" />
        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-8 py-24 sm:py-32 text-paper">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-comicyellow mb-4">{t.conventions.eyebrow}</p>
            <h1 className="font-display font-black tracking-tighter text-4xl sm:text-5xl lg:text-6xl max-w-3xl leading-[0.9]">
              {t.conventions.title}
            </h1>
          </Reveal>
        </div>
      </section>

      <Marquee items={["Rencontres", "Dédicaces", "Chine", "Collector", "VO", "VF", "Salons"]} />

      <section id="agenda" className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16 sm:py-24 scroll-mt-20">
        <h2 className="font-anton text-3xl sm:text-4xl uppercase mb-10">{t.conventions.agenda}</h2>
        <div className="border-2 border-ink">
          {events.length === 0 && (
            <div className="p-8 text-center font-mono text-sm text-inksoft">{t.conventions.empty}</div>
          )}
          {events.map((e, i) => (
            <Reveal key={e.id || i} delay={i * 0.05}>
              <div data-testid={`salon-${e.id}`} className={`grid md:grid-cols-12 gap-2 md:gap-6 md:items-center p-5 sm:p-6 font-mono ${i < events.length - 1 ? "border-b-2 border-ink" : ""} hover:bg-papersoft transition-colors`}>
                {e.photo && (
                  <img src={e.photo} alt={`${e.name} — ${e.city}`} loading="lazy"
                    className="md:col-span-1 w-24 md:w-full aspect-[4/3] object-cover border-2 border-ink" />
                )}
                <div className={`${e.photo ? "md:col-span-2" : "md:col-span-3"} text-comicred text-sm uppercase tracking-wider`}>{e.date_label}</div>
                <div className="md:col-span-3 flex items-center gap-2 font-display font-bold text-lg">
                  <MapPin size={16} /> {e.city}{e.country ? `, ${e.country}` : ""}
                </div>
                <div className={`${e.photo ? "md:col-span-4" : "md:col-span-4"} text-sm`}>
                  {e.name}
                  {e.description && <p className="text-xs text-inksoft mt-1 leading-relaxed">{e.description}</p>}
                </div>
                <div className="md:col-span-2 text-xs uppercase text-inksoft">
                  {e.note}
                  {e.website && (
                    <a href={e.website} target="_blank" rel="noreferrer" data-testid={`salon-website-${e.id}`}
                      className="block mt-2 text-comicblue underline hover:text-comicred">
                      {t.conventions.officialSite} ↗
                    </a>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mt-16 items-center">
          <Reveal>
            <img src={CROWD} alt="Foule salon" className="w-full aspect-[4/3] object-cover border-2 border-ink" />
          </Reveal>
          <Reveal delay={0.1}>
            <h3 className="font-display font-black tracking-tighter text-3xl sm:text-4xl">{t.conventions.standTitle}</h3>
            <p className="font-mono text-sm text-inksoft mt-5 leading-relaxed max-w-md">
              {t.conventions.standP}
            </p>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
