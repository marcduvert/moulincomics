import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Marquee } from "../components/Marquee";
import { Reveal } from "../components/Reveal";
import { MapPin } from "lucide-react";

const CONV = "https://images.pexels.com/photos/36398813/pexels-photo-36398813.jpeg?auto=compress&cs=tinysrgb&w=1200";
const CROWD = "https://images.unsplash.com/photo-1578434972378-e3c393d983db?crop=entropy&cs=srgb&fm=jpg&q=85&w=1000";

export default function Conventions() {
  const [events, setEvents] = useState([]);
  useEffect(() => { api.get("/salons").then((r) => setEvents(r.data)).catch(() => {}); }, []);
  return (
    <div>
      <section className="relative border-b-2 border-ink overflow-hidden">
        <img src={CONV} alt="Convention" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-ink/60" />
        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-8 py-24 sm:py-32 text-paper">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-comicyellow mb-4">Moulin Comics en tournée</p>
            <h1 className="font-display font-black tracking-tighter text-4xl sm:text-5xl lg:text-6xl max-w-3xl leading-[0.9]">
              ON DÉBALLE NOS CAISSES PARTOUT EN EUROPE
            </h1>
          </Reveal>
        </div>
      </section>

      <Marquee items={["Rencontres", "Dédicaces", "Chine", "Collector", "VO", "VF", "Salons"]} />

      <section className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16 sm:py-24">
        <h2 className="font-anton text-3xl sm:text-4xl uppercase mb-10">Agenda 2026</h2>
        <div className="border-2 border-ink">
          {events.length === 0 && (
            <div className="p-8 text-center font-mono text-sm text-inksoft">Aucun salon programmé pour le moment.</div>
          )}
          {events.map((e, i) => (
            <Reveal key={e.id || i} delay={i * 0.05}>
              <div className={`grid md:grid-cols-12 gap-2 md:gap-6 items-center p-5 sm:p-6 font-mono ${i < events.length - 1 ? "border-b-2 border-ink" : ""} hover:bg-papersoft transition-colors`}>
                <div className="md:col-span-3 text-comicred text-sm uppercase tracking-wider">{e.date_label}</div>
                <div className="md:col-span-3 flex items-center gap-2 font-display font-bold text-lg">
                  <MapPin size={16} /> {e.city}{e.country ? `, ${e.country}` : ""}
                </div>
                <div className="md:col-span-4 text-sm">{e.name}</div>
                <div className="md:col-span-2 text-xs uppercase text-inksoft">{e.note}</div>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mt-16 items-center">
          <Reveal>
            <img src={CROWD} alt="Foule salon" className="w-full aspect-[4/3] object-cover border-2 border-ink" />
          </Reveal>
          <Reveal delay={0.1}>
            <h3 className="font-display font-black tracking-tighter text-3xl sm:text-4xl">VENEZ CHINER À NOTRE STAND</h3>
            <p className="font-mono text-sm text-inksoft mt-5 leading-relaxed max-w-md">
              Chaque salon est l'occasion de sortir des pièces rares de nos réserves. Comics VO fraîchement importés,
              mensuels VF d'époque et éditions collector introuvables en ligne. Passez nous voir, on parle cases.
            </p>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
