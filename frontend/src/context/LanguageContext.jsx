import { createContext, useContext, useEffect, useState } from "react";

const T = {
  fr: {
    nav: { home: "Accueil", shop: "Boutique", vo: "VO", vf: "VF", salons: "Salons" },
    hero: {
      eyebrow: "Comic Shop · VO & VF · Paris",
      l1: "Moulin Comics —", l2: "Votre prochaine pièce", l3: "de collection est ici",
      p: "BD & Comics français et américains — éditions anciennes, collectors et pépites à redécouvrir.",
      cta1: "Explorer le stock", cta2: "Les Spider-Man",
      badgeL: "Est. Moulin Comics", badgeR: "Vol. 01",
    },
    featured: { eyebrow: "La sélection", title: "PIÈCES DE CHOIX", all: "Tout voir →" },
    manifesto: {
      title: "La maison",
      c1t: "La VO d'abord", c1d: "Comic shop spécialisé en version originale. Marvel, DC, indés — les titres qui définissent le médium, dans leur langue d'origine.",
      c2t: "Le fonds VF", c2d: "Un large stock de mensuels : les bons vieux Strange, Nova et Titans de l'ère Lug & Semic. La nostalgie a une adresse.",
      c3t: "Sur les salons", c3d: "On sillonne les conventions d'Europe avec une sélection triée sur le volet. Retrouvez-nous case après case.",
    },
    convTeaser: {
      eyebrow: "Sur la route", title: "RETROUVEZ-NOUS SUR LES SALONS D'EUROPE",
      p: "De Paris à Bruxelles, d'Angoulême à Lucca — on déballe nos caisses partout en Europe. Une sélection différente à chaque étape.",
      cta: "Voir l'agenda",
    },
    shop: {
      eyebrow: "Le stock", title: "BOUTIQUE", searchPh: "Rechercher un titre, une série…",
      all: "Tout", loading: "Chargement…", empty: "Aucun résultat.", allSeries: "Toutes séries",
    },
    product: {
      back: "Retour", condition: "État", stock: "Stock", publisher: "Éditeur", year: "Année",
      copies: "exemplaire(s)", soldOut: "Épuisé", by: "par", addToCart: "Ajouter au panier",
      sameShelf: "Dans le même rayon",
    },
    cart: {
      title: "Panier", empty: "Votre panier est vide.", total: "TOTAL",
      pay: "Payer avec Stripe", redirect: "Redirection…",
      note: "Paiement sécurisé · TVA calculée au paiement",
    },
    card: { lastCopy: "Dernier ex." },
    footer: {
      desc: "Comic shop spécialisé en VO. Large stock de mensuels VF — Strange, Nova, Titans. De la case à la caisse depuis toujours.",
      explore: "Explorer", contact: "Contact", manager: "Espace gérant",
      rights: "VO & VF · Paiement sécurisé Stripe",
    },
    conventions: {
      eyebrow: "Moulin Comics en tournée", title: "ON DÉBALLE NOS CAISSES PARTOUT EN EUROPE",
      agenda: "Agenda 2026", empty: "Aucun salon programmé pour le moment.",
      standTitle: "VENEZ CHINER À NOTRE STAND",
      standP: "Chaque salon est l'occasion de sortir des pièces rares de nos réserves. Comics VO fraîchement importés, mensuels VF d'époque et éditions collector introuvables en ligne. Passez nous voir, on parle cases.",
    },
    pay: {
      checking: "Vérification du paiement…", thanks: "MERCI !",
      confirmed: (amt) => `Votre commande de ${amt} est confirmée. Nous préparons vos comics avec soin.`,
      processing: "Paiement en cours de traitement. Vous recevrez une confirmation sous peu.",
      cannotVerify: "Impossible de vérifier le paiement.", home: "Retour à l'accueil",
      continue: "Continuer mes achats", cancelTitle: "PAIEMENT ANNULÉ",
      cancelP: "Aucun montant n'a été débité. Votre panier vous attend toujours.",
      backShop: "Retour à la boutique",
    },
  },
  en: {
    nav: { home: "Home", shop: "Shop", vo: "OV", vf: "French", salons: "Events" },
    hero: {
      eyebrow: "Comic Shop · OV & French · Paris",
      l1: "Moulin Comics —", l2: "Your next collector's", l3: "piece is here",
      p: "Moulin Comics — original-version specialist and keeper of a vast stock of French monthlies: Strange, Nova, Titans. Browse, reserve, collect. Shipping across Europe available.",
      cta1: "Browse the stock", cta2: "The Spider-Man",
      badgeL: "Est. Moulin Comics", badgeR: "Vol. 01",
    },
    featured: { eyebrow: "The selection", title: "PRIME PICKS", all: "See all →" },
    manifesto: {
      title: "The house",
      c1t: "Original version first", c1d: "A shop devoted to the original version. Marvel, DC, indies — the titles that define the medium, in their original language.",
      c2t: "The French archive", c2d: "A vast stock of monthlies: the good old Strange, Nova and Titans from the Lug & Semic era. Nostalgia has an address.",
      c3t: "On the road", c3d: "We tour European conventions with a hand-picked selection. Find us panel after panel.",
    },
    convTeaser: {
      eyebrow: "On the road", title: "FIND US AT EUROPE'S COMIC EVENTS",
      p: "From Paris to Brussels, from Angoulême to Lucca — we unpack our crates all across Europe. A different selection at every stop.",
      cta: "See the schedule",
    },
    shop: {
      eyebrow: "The stock", title: "SHOP", searchPh: "Search a title, a series…",
      all: "All", loading: "Loading…", empty: "No results.", allSeries: "All series",
    },
    product: {
      back: "Back", condition: "Condition", stock: "Stock", publisher: "Publisher", year: "Year",
      copies: "copy(ies)", soldOut: "Sold out", by: "by", addToCart: "Add to cart",
      sameShelf: "On the same shelf",
    },
    cart: {
      title: "Cart", empty: "Your cart is empty.", total: "TOTAL",
      pay: "Pay with Stripe", redirect: "Redirecting…",
      note: "Secure payment · VAT calculated at checkout",
    },
    card: { lastCopy: "Last one" },
    footer: {
      desc: "Original-version comic shop. Vast stock of French monthlies — Strange, Nova, Titans. From the panel to the till, always.",
      explore: "Explore", contact: "Contact", manager: "Manager area",
      rights: "OV & French · Secure Stripe payment",
    },
    conventions: {
      eyebrow: "Moulin Comics on tour", title: "WE UNPACK OUR CRATES ALL ACROSS EUROPE",
      agenda: "2026 Schedule", empty: "No event scheduled at the moment.",
      standTitle: "COME DIG THROUGH OUR BOOTH",
      standP: "Every event is a chance to pull rare pieces from our reserves. Freshly imported OV comics, vintage French monthlies and collector editions you won't find online. Drop by, let's talk comics.",
    },
    pay: {
      checking: "Verifying payment…", thanks: "THANK YOU!",
      confirmed: (amt) => `Your order of ${amt} is confirmed. We're carefully preparing your comics.`,
      processing: "Payment is being processed. You'll receive a confirmation shortly.",
      cannotVerify: "Unable to verify the payment.", home: "Back to home",
      continue: "Continue shopping", cancelTitle: "PAYMENT CANCELLED",
      cancelP: "No amount was charged. Your cart is still waiting for you.",
      backShop: "Back to the shop",
    },
  },
  es: {
    nav: { home: "Inicio", shop: "Tienda", vo: "VO", vf: "VF", salons: "Salones" },
    hero: {
      eyebrow: "Comic Shop · VO & VF · París",
      l1: "Moulin Comics —", l2: "Tu próxima pieza", l3: "de colección está aquí",
      p: "Moulin Comics — especialista en versión original y guardián de un amplio stock de mensuales franceses: Strange, Nova, Titans. Busca, reserva, colecciona. Envíos a toda Europa disponibles.",
      cta1: "Explorar el stock", cta2: "Los Spider-Man",
      badgeL: "Est. Moulin Comics", badgeR: "Vol. 01",
    },
    featured: { eyebrow: "La selección", title: "PIEZAS DESTACADAS", all: "Ver todo →" },
    manifesto: {
      title: "La casa",
      c1t: "La VO primero", c1d: "Tienda especializada en versión original. Marvel, DC, indies — los títulos que definen el medio, en su idioma original.",
      c2t: "El fondo VF", c2d: "Un amplio stock de mensuales: los viejos Strange, Nova y Titans de la era Lug & Semic. La nostalgia tiene dirección.",
      c3t: "En los salones", c3d: "Recorremos las convenciones de Europa con una selección cuidada. Encuéntranos viñeta a viñeta.",
    },
    convTeaser: {
      eyebrow: "En la carretera", title: "ENCUÉNTRANOS EN LOS SALONES DE EUROPA",
      p: "De París a Bruselas, de Angoulême a Lucca — abrimos nuestras cajas por toda Europa. Una selección distinta en cada parada.",
      cta: "Ver la agenda",
    },
    shop: {
      eyebrow: "El stock", title: "TIENDA", searchPh: "Buscar un título, una serie…",
      all: "Todo", loading: "Cargando…", empty: "Sin resultados.", allSeries: "Todas las series",
    },
    product: {
      back: "Volver", condition: "Estado", stock: "Stock", publisher: "Editorial", year: "Año",
      copies: "ejemplar(es)", soldOut: "Agotado", by: "por", addToCart: "Añadir al carrito",
      sameShelf: "En la misma estantería",
    },
    cart: {
      title: "Carrito", empty: "Tu carrito está vacío.", total: "TOTAL",
      pay: "Pagar con Stripe", redirect: "Redirigiendo…",
      note: "Pago seguro · IVA calculado al pagar",
    },
    card: { lastCopy: "Último ej." },
    footer: {
      desc: "Tienda de cómics especializada en VO. Amplio stock de mensuales franceses — Strange, Nova, Titans. De la viñeta a la caja, desde siempre.",
      explore: "Explorar", contact: "Contacto", manager: "Zona gerente",
      rights: "VO & VF · Pago seguro Stripe",
    },
    conventions: {
      eyebrow: "Moulin Comics de gira", title: "ABRIMOS NUESTRAS CAJAS POR TODA EUROPA",
      agenda: "Agenda 2026", empty: "Ningún salón programado por ahora.",
      standTitle: "VEN A REBUSCAR EN NUESTRO STAND",
      standP: "Cada salón es la ocasión de sacar piezas raras de nuestras reservas. Cómics VO recién importados, mensuales franceses de época y ediciones de coleccionista que no encontrarás en línea. Pásate, hablemos de viñetas.",
    },
    pay: {
      checking: "Verificando el pago…", thanks: "¡GRACIAS!",
      confirmed: (amt) => `Tu pedido de ${amt} está confirmado. Preparamos tus cómics con cuidado.`,
      processing: "El pago se está procesando. Recibirás una confirmación en breve.",
      cannotVerify: "No se pudo verificar el pago.", home: "Volver al inicio",
      continue: "Seguir comprando", cancelTitle: "PAGO CANCELADO",
      cancelP: "No se cobró ningún importe. Tu carrito sigue esperándote.",
      backShop: "Volver a la tienda",
    },
  },
};

const LanguageContext = createContext(null);
export const useLang = () => useContext(LanguageContext);
export const LANGS = [
  { code: "fr", label: "FR" },
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
];

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem("mc_lang") || "fr");
  useEffect(() => {
    localStorage.setItem("mc_lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);
  const t = T[lang] || T.fr;
  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
