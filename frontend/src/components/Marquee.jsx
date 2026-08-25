export const Marquee = ({ items, dark = false }) => (
  <div className={`overflow-hidden border-y-2 border-ink ${dark ? "bg-ink text-paper" : "bg-comicyellow text-ink"} py-3`}>
    <div className="flex whitespace-nowrap animate-marquee">
      {[...items, ...items].map((t, i) => (
        <span key={i} className="font-anton text-xl sm:text-2xl uppercase mx-8 tracking-wide flex items-center gap-8">
          {t} <span className="text-comicred">✦</span>
        </span>
      ))}
    </div>
  </div>
);
