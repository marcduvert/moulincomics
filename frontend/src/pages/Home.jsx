import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { useLang } from "../context/LanguageContext";
import { ProductCard } from "../components/ProductCard";
import { Marquee } from "../components/Marquee";
import { Reveal, LineReveal } from "../components/Reveal";

const HERO = "https://images.unsplash.com/photo-1618519764620-7403abdbdfe9?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400";
const CONV = "https://images.pexels.com/photos/36398813/pexels-photo-36398813.jpeg?auto=compress&cs=tinysrgb&w=1200";

export default function Home() {
  const { t } = useLang();
  const [featured, setFeatured] = useState([]);
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.15]);
  const chapters = [
    { n: "01", t: t.manifesto.c1t, d: t.manifesto.c1d },
    { n: "02", t: t.manifesto.c2t, d: t.manifesto.c2d },
    { n: "03", t: t.manifesto.c3t, d: t.manifesto.c3d },
  ];

  useEffect(() => {
    api.get("/products", { params: { featured: true } }).then((r) => setFeatured(r.data.slice(0, 8)));
  }, []);

  return (
    <div>
      {/* HERO */}
      <section ref={heroRef} className="relative border-b-2 border-ink overflow-hidden">
        <div className="max-w-[1400px] mx-auto grid lg:grid-cols-12">
          <div className="lg:col-span-7 px-4 sm:px-8 py-16 sm:py-24 lg:py-32 flex flex-col justify-center">
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
              className="font-mono text-xs uppercase tracking-[0.3em] text-comicred mb-6">
              {t.hero.eyebrow}
            </motion.p>
            <h1 className="font-display font-black tracking-tighter leading-[0.88] text-5xl sm:text-6xl lg:text-[5.5rem]">
              <LineReveal lines={[t.hero.l1, t.hero.l2, ""]} />
              <span className="block overflow-hidden">
                <motion.span className="block text-comicred" initial={{ y: "110%" }} animate={{ y: 0 }}
                  transition={{ duration: 0.85, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}>{t.hero.l3}</motion.span>
              </span>
            </h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
              className="font-mono text-sm sm:text-base text-inksoft max-w-md mt-8 leading-relaxed">
              {t.hero.p}
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05 }}
              className="flex flex-wrap gap-3 mt-10">
              <Link to="/shop" data-testid="hero-shop-btn"
                className="group bg-ink text-paper font-mono uppercase tracking-[0.15em] text-sm px-7 py-4 flex items-center gap-3 hover:bg-comicred transition-colors">
                {t.hero.cta1} <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/shop?series=Spider-Man" data-testid="hero-vf-btn"
                className="border-2 border-ink font-mono uppercase tracking-[0.15em] text-sm px-7 py-4 hover:bg-comicyellow transition-colors">
                {t.hero.cta2}
              </Link>
            </motion.div>
          </div>
          <div className="lg:col-span-5 relative min-h-[320px] border-t-2 lg:border-t-0 lg:border-l-2 border-ink overflow-hidden">
            <motion.img src={HERO} alt="Comics vintage" style={{ y, scale }}
              className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-ink/10" />
            <div className="absolute bottom-0 left-0 right-0 bg-ink text-paper font-mono text-[11px] uppercase tracking-[0.2em] px-4 py-2 flex justify-between">
              <span>{t.hero.badgeL}</span><span>{t.hero.badgeR}</span>
            </div>
          </div>
        </div>
      </section>

      <Marquee items={["Strange", "Nova", "Titans", "Marvel VO", "DC Comics", "Édition Lug", "Semic"]} />

      {/* FEATURED */}
      <section className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16 sm:py-24">
        <Reveal className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-comicred mb-2">{t.featured.eyebrow}</p>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl">{t.featured.title}</h2>
          </div>
          <Link to="/shop" className="font-mono text-sm uppercase tracking-[0.15em] border-b-2 border-ink hover:text-comicred hover:border-comicred transition-colors">
            {t.featured.all}
          </Link>
        </Reveal>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {featured.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
        </div>
      </section>

      {/* MANIFESTO */}
      <section className="bg-ink text-paper border-y-2 border-ink">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16 sm:py-24">
          <Reveal><h2 className="font-anton text-4xl sm:text-6xl uppercase mb-14">{t.manifesto.title}</h2></Reveal>
          <div className="grid md:grid-cols-3 gap-10 md:gap-6">
            {chapters.map((c, i) => (
              <Reveal key={c.n} delay={i * 0.1} className="border-t border-paper/20 pt-6">
                <p className="font-anton text-5xl sm:text-6xl text-comicyellow leading-none">{c.n}</p>
                <h3 className="font-display font-bold text-xl mt-4">{c.t}</h3>
                <p className="font-mono text-sm text-paper/60 mt-3 leading-relaxed">{c.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CONVENTIONS TEASER */}
      <section className="max-w-[1400px] mx-auto px-4 sm:px-8 py-16 sm:py-24 grid lg:grid-cols-2 gap-8 items-center">
        <Reveal>
          <img src={CONV} alt="Convention BD" className="w-full aspect-[4/3] object-cover border-2 border-ink" />
        </Reveal>
        <Reveal delay={0.1}>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-comicred mb-3">{t.convTeaser.eyebrow}</p>
          <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl leading-tight">
            {t.convTeaser.title}
          </h2>
          <p className="font-mono text-sm text-inksoft mt-5 max-w-md leading-relaxed">
            {t.convTeaser.p}
          </p>
          <Link to="/conventions" data-testid="conv-cta"
            className="inline-flex mt-8 items-center gap-3 border-2 border-ink px-6 py-3 font-mono uppercase text-sm tracking-[0.15em] hover:bg-ink hover:text-paper transition-colors">
            {t.convTeaser.cta} <ArrowRight size={16} />
          </Link>
        </Reveal>
      </section>

      <Marquee dark items={["Angoulême", "Comic Con Paris", "Lucca", "Bruxelles", "Lyon", "FIBD"]} />
    </div>
  );
}
