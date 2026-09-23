import { createContext, useContext, useEffect, useState } from "react";

const T = {
  fr: {
    nav: { home: "Accueil", welcome: "Bienvenue", shop: "Boutique", vo: "VO", vf: "VF", salons: "Salons", contact: "Contact" },
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
      all: "Tout", loading: "Chargement…", empty: "Aucun résultat.", allSeries: "Toutes séries", otherSeries: "Autres séries", noSeries: "Sans série", inStockOnly: "En stock",
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
      continueDelivery: "Choisir la livraison", deliveryTitle: "Mode de livraison",
      backToCart: "Retour au panier", subtotal: "Sous-total", shipping: "Livraison",
      methodRelay: "Point Relais / Locker Mondial Relay", methodRelayDesc: "Livraison dans le point relais choisi",
      methodHome: "Livraison à domicile", methodHomeDesc: "Livraison à l'adresse indiquée",
      methodUnavailable: "Bientôt disponible",
      chooseRelay: "Choisir mon Point Relais", changeRelay: "Modifier mon Point Relais",
      relaySelected: "Point relais sélectionné",
      relaySearchPh: "Code postal ou ville", relaySearch: "Rechercher", relaySearching: "Recherche…",
      relayNone: "Aucun point relais trouvé pour cette recherche.",
      relayError: "Service Mondial Relay momentanément indisponible. Réessayez.",
      relayRequired: "Veuillez sélectionner un Point Relais Mondial Relay avant de continuer.",
      relayNotConfigured: "La livraison Mondial Relay arrive très bientôt — choisissez la livraison à domicile pour le moment.",
      hours: "Horaires",
    },
    card: { lastCopy: "Dernier ex.", inStock: "En stock", soldOut: "Épuisé" },
    contact: {
      title: "Contact", intro: "Une question sur un comic, une commande ou un salon ? Écrivez-nous.",
      name: "Nom", email: "Email", subject: "Objet", message: "Message", send: "Envoyer",
      sending: "Envoi…", success: "Message envoyé — nous vous répondrons rapidement.",
      error: "L'envoi a échoué. Réessayez dans un instant.",
      invalidEmail: "Adresse email invalide", required: "Merci de remplir tous les champs.",
    },
    cookie: {
      title: "Cookies & confidentialité",
      text: "Nous utilisons uniquement des cookies nécessaires au fonctionnement du site (panier, langue). Aucun cookie de mesure ou publicitaire n'est déposé sans votre accord.",
      accept: "Tout accepter", refuse: "Refuser les cookies non nécessaires",
      reopen: "Préférences cookies",
    },
    footer: {
      desc: "Comic shop spécialisé en VO. Large stock de mensuels VF — Strange, Nova, Titans. De la case à la caisse depuis toujours.",
      explore: "Explorer", contact: "Contact", manager: "Espace gérant",
      rights: "VO & VF · Paiement sécurisé Stripe",
    },
    pages: {
      mentionsTitle: "Mentions légales & Politique de confidentialité",
      cgvTitle: "Conditions générales de vente",
      shippingTitle: "Politique de livraison",
      faqTitle: "QUESTIONS FRÉQUENTES",
      faqSub: "Une question sur nos comics, votre commande ou la livraison ? Retrouvez ici les réponses aux questions les plus fréquentes.",
      faqCtaText: "Vous n'avez pas trouvé votre réponse ?",
      faqCtaLink: "Contactez-nous",
      faqSeoTitle: "FAQ | Moulin Comics",
      faqSeoDesc: "Questions fréquentes sur les comics, commandes, paiements, livraisons Mondial Relay, retours et services Moulin Comics.",
      faqCats: { "Les comics": "Les comics", "Commande & paiement": "Commande & paiement", "Livraison": "Livraison", "Retours & remboursements": "Retours & remboursements", "Moulin Comics": "Moulin Comics" },
    },
    conventions: {
      eyebrow: "Moulin Comics en tournée", title: "ON DÉBALLE NOS CAISSES PARTOUT EN EUROPE",
      agenda: "Agenda de nos salons", empty: "Aucun salon programmé pour le moment.",
      standTitle: "VENEZ CHINER À NOTRE STAND",
      standP: "Chaque salon est l'occasion de sortir des pièces rares de nos réserves. Comics VO fraîchement importés, mensuels VF d'époque et éditions collector introuvables en ligne. Passez nous voir, on parle cases.",
      officialSite: "Site officiel",
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
    nav: { home: "Home", welcome: "Welcome", shop: "Shop", vo: "OV", vf: "French", salons: "Events", contact: "Contact" },
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
      all: "All", loading: "Loading…", empty: "No results.", allSeries: "All series", otherSeries: "Other series", noSeries: "No series", inStockOnly: "In stock",
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
      continueDelivery: "Choose delivery", deliveryTitle: "Delivery method",
      backToCart: "Back to cart", subtotal: "Subtotal", shipping: "Delivery",
      methodRelay: "Mondial Relay Pickup Point / Locker", methodRelayDesc: "Delivered to your chosen pickup point",
      methodHome: "Home delivery", methodHomeDesc: "Delivered to the address you provide",
      methodUnavailable: "Coming soon",
      chooseRelay: "Choose my pickup point", changeRelay: "Change my pickup point",
      relaySelected: "Selected pickup point",
      relaySearchPh: "Postal code or city", relaySearch: "Search", relaySearching: "Searching…",
      relayNone: "No pickup point found for this search.",
      relayError: "Mondial Relay service temporarily unavailable. Please retry.",
      relayRequired: "Please select a Mondial Relay pickup point before continuing.",
      relayNotConfigured: "Mondial Relay delivery is coming very soon — please choose home delivery for now.",
      hours: "Opening hours",
    },
    card: { lastCopy: "Last one", inStock: "In stock", soldOut: "Sold out" },
    contact: {
      title: "Contact", intro: "A question about a comic, an order or an event? Write to us.",
      name: "Name", email: "Email", subject: "Subject", message: "Message", send: "Send",
      sending: "Sending…", success: "Message sent — we will reply shortly.",
      error: "Sending failed. Please try again in a moment.",
      invalidEmail: "Invalid email address", required: "Please fill in all fields.",
    },
    cookie: {
      title: "Cookies & privacy",
      text: "We only use cookies that are necessary for the site to work (cart, language). No analytics or advertising cookies are set without your consent.",
      accept: "Accept all", refuse: "Refuse non-essential cookies",
      reopen: "Cookie preferences",
    },
    footer: {
      desc: "Original-version comic shop. Vast stock of French monthlies — Strange, Nova, Titans. From the panel to the till, always.",
      explore: "Explore", contact: "Contact", manager: "Manager area",
      rights: "OV & French · Secure Stripe payment",
    },
    pages: {
      mentionsTitle: "Legal Notice & Privacy Policy",
      cgvTitle: "Terms and Conditions of Sale",
      shippingTitle: "Shipping Policy",
      faqTitle: "FREQUENTLY ASKED QUESTIONS",
      faqSub: "A question about our comics, your order or shipping? Find the answers to the most frequent questions here.",
      faqCtaText: "Didn't find your answer?",
      faqCtaLink: "Contact us",
      faqSeoTitle: "FAQ | Moulin Comics",
      faqSeoDesc: "Frequently asked questions about comics, orders, payments, Mondial Relay shipping, returns and Moulin Comics services.",
      faqCats: { "Les comics": "Comics", "Commande & paiement": "Order & Payment", "Livraison": "Shipping", "Retours & remboursements": "Returns & Refunds", "Moulin Comics": "Moulin Comics" },
    },
    conventions: {
      eyebrow: "Moulin Comics on tour", title: "WE UNPACK OUR CRATES ALL ACROSS EUROPE",
      agenda: "Our events schedule", empty: "No event scheduled at the moment.",
      standTitle: "COME DIG THROUGH OUR BOOTH",
      standP: "Every event is a chance to pull rare pieces from our reserves. Freshly imported OV comics, vintage French monthlies and collector editions you won't find online. Drop by, let's talk comics.",
      officialSite: "Official website",
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
    nav: { home: "Inicio", welcome: "Bienvenido", shop: "Tienda", vo: "VO", vf: "VF", salons: "Salones", contact: "Contacto" },
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
      all: "Todo", loading: "Cargando…", empty: "Sin resultados.", allSeries: "Todas las series", otherSeries: "Otras series", noSeries: "Sin serie", inStockOnly: "En stock",
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
      continueDelivery: "Elegir la entrega", deliveryTitle: "Modo de entrega",
      backToCart: "Volver al carrito", subtotal: "Subtotal", shipping: "Entrega",
      methodRelay: "Punto de recogida / Locker Mondial Relay", methodRelayDesc: "Entrega en el punto elegido",
      methodHome: "Entrega a domicilio", methodHomeDesc: "Entrega en la dirección indicada",
      methodUnavailable: "Próximamente",
      chooseRelay: "Elegir mi punto de recogida", changeRelay: "Cambiar mi punto de recogida",
      relaySelected: "Punto de recogida seleccionado",
      relaySearchPh: "Código postal o ciudad", relaySearch: "Buscar", relaySearching: "Buscando…",
      relayNone: "Ningún punto de recogida encontrado.",
      relayError: "Servicio Mondial Relay no disponible temporalmente. Inténtelo de nuevo.",
      relayRequired: "Seleccione un punto de recogida Mondial Relay antes de continuar.",
      relayNotConfigured: "La entrega Mondial Relay llegará muy pronto — elija la entrega a domicilio por ahora.",
      hours: "Horarios",
    },
    card: { lastCopy: "Último ej.", inStock: "En stock", soldOut: "Agotado" },
    contact: {
      title: "Contacto", intro: "¿Una pregunta sobre un cómic, un pedido o un salón? Escríbenos.",
      name: "Nombre", email: "Email", subject: "Asunto", message: "Mensaje", send: "Enviar",
      sending: "Enviando…", success: "Mensaje enviado — le responderemos pronto.",
      error: "El envío ha fallado. Inténtelo de nuevo en un instante.",
      invalidEmail: "Dirección de email inválida", required: "Por favor, rellene todos los campos.",
    },
    cookie: {
      title: "Cookies y privacidad",
      text: "Solo utilizamos cookies necesarias para el funcionamiento del sitio (carrito, idioma). No se instalan cookies de medición o publicidad sin su consentimiento.",
      accept: "Aceptar todo", refuse: "Rechazar cookies no necesarias",
      reopen: "Preferencias de cookies",
    },
    footer: {
      desc: "Tienda de cómics especializada en VO. Amplio stock de mensuales franceses — Strange, Nova, Titans. De la viñeta a la caja, desde siempre.",
      explore: "Explorar", contact: "Contacto", manager: "Zona gerente",
      rights: "VO & VF · Pago seguro Stripe",
    },
    pages: {
      mentionsTitle: "Aviso legal y Política de privacidad",
      cgvTitle: "Condiciones Generales de Venta",
      shippingTitle: "Política de envío",
      faqTitle: "PREGUNTAS FRECUENTES",
      faqSub: "¿Una pregunta sobre nuestros cómics, su pedido o el envío? Encuentre aquí las respuestas a las preguntas más frecuentes.",
      faqCtaText: "¿No ha encontrado la respuesta?",
      faqCtaLink: "Contáctenos",
      faqSeoTitle: "FAQ | Moulin Comics",
      faqSeoDesc: "Preguntas frecuentes sobre cómics, pedidos, pagos, envíos Mondial Relay, devoluciones y servicios de Moulin Comics.",
      faqCats: { "Les comics": "Los cómics", "Commande & paiement": "Pedido y pago", "Livraison": "Envío", "Retours & remboursements": "Devoluciones y reembolsos", "Moulin Comics": "Moulin Comics" },
    },
    conventions: {
      eyebrow: "Moulin Comics de gira", title: "ABRIMOS NUESTRAS CAJAS POR TODA EUROPA",
      agenda: "Agenda de nuestros salones", empty: "Ningún salón programado por ahora.",
      standTitle: "VEN A REBUSCAR EN NUESTRO STAND",
      standP: "Cada salón es la ocasión de sacar piezas raras de nuestras reservas. Cómics VO recién importados, mensuales franceses de época y ediciones de coleccionista que no encontrarás en línea. Pásate, hablemos de viñetas.",
      officialSite: "Sitio oficial",
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
