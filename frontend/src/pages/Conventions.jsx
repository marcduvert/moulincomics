import { useEffect, useState, useRef } from "react";
import { api } from "../lib/api";
import { useLang } from "../context/LanguageContext";
import { useContent } from "../context/ContentContext";
import { Marquee } from "../components/Marquee";
import { Reveal } from "../components/Reveal";
import { MapPin, X } from "lucide-react";
import { Seo } from "../components/Seo";

const CONV = "https://images.pexels.com/photos/36398813/pexels-photo-36398813.jpeg?auto=compress&cs=tinysrgb&w=1200";
const CROWD = "https://images.unsplash.com/photo-1578434972378-e3c393d983db?crop=entropy&cs=srgb&fm=jpg&q=85&w=1000";

export default function Conventions() {
  const { t, lang } = useLang();
  const { content } = useContent();
  const sBase = content?.salons || {};
  const sc = lang === "fr" ? sBase : { ...sBase, ...(sBase[lang] || {}) };
  const showVideo = !!sc.video_enabled && !!sc.video_url;
  const [events, setEvents] = useState([]);
  const [zoomImg, setZoomImg] = useState(null);
  const [videoIn, setVideoIn] = useState(false);
  const videoWrapRef = useRef(null);
  useEffect(() => { api.get("/salons").then((r) => setEvents(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (!showVideo) return;
    const el = videoWrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVideoIn(true); io.disconnect(); }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [showVideo, sc.video_url]);
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

      <section id="agenda" className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16 sm:py-24 scroll-mt-24">
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
                    onClick={() => setZoomImg({ src: e.photo, alt: `${e.name} — ${e.city}` })}
                    data-testid={`salon-photo-${e.id}`}
                    className="md:col-span-1 w-24 md:w-full aspect-[4/3] object-cover border-2 border-ink cursor-zoom-in hover:opacity-80 transition-opacity" />
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

      {showVideo && (
        <section data-testid="salons-video" className="border-t-2 border-ink bg-papersoft">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16 sm:py-24 grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            <Reveal>
              <div ref={videoWrapRef} className="w-full max-w-[340px] mx-auto lg:mx-0 aspect-[9/16] border-2 border-ink bg-ink overflow-hidden shadow-hardlg">
                {videoIn ? (
                  <video data-testid="salons-video-player" src={sc.video_url}
                    poster={sc.video_poster || undefined}
                    muted playsInline loop autoPlay preload="metadata"
                    className="w-full h-full object-cover" />
                ) : (
                  sc.video_poster
                    ? <img src={sc.video_poster} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full" />
                )}
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              {sc.video_eyebrow && <p className="font-mono text-xs uppercase tracking-[0.3em] text-comicred mb-3">{sc.video_eyebrow}</p>}
              {sc.video_title && <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl leading-[0.95]">{sc.video_title}</h2>}
              {sc.video_text && <p className="font-mono text-sm text-inksoft mt-5 leading-relaxed max-w-md">{sc.video_text}</p>}
              {sc.video_instagram && (
                <a href={sc.video_instagram} target="_blank" rel="noreferrer" data-testid="salons-video-instagram"
                  className="inline-block mt-6 font-mono text-xs uppercase tracking-[0.2em] border-2 border-ink px-6 py-3 hover:bg-ink hover:text-paper transition-colors">
                  {t.conventions.seeInstagram || "Voir sur Instagram"} ↗
                </a>
              )}
            </Reveal>
          </div>
        </section>
      )}

      {zoomImg && (
        <div className="fixed inset-0 bg-ink/80 z-[90] flex items-center justify-center p-4" onClick={() => setZoomImg(null)}
          data-testid="salon-photo-modal">
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setZoomImg(null)} data-testid="salon-photo-close" aria-label="Fermer"
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
