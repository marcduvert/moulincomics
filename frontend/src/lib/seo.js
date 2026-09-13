// Configuration SEO centralisée.
// Le domaine de référence vient de REACT_APP_SITE_URL (frontend/.env).
// Repli automatique sur le domaine courant si la variable est absente.
// => Pour le domaine définitif : modifier REACT_APP_SITE_URL (+ SITE_URL côté backend).
export const SITE_URL = (process.env.REACT_APP_SITE_URL || "").replace(/\/+$/, "") || window.location.origin;

export const absUrl = (path = "/") => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

// Valeurs par défaut (surchargables depuis Admin → Contenu du site → SEO)
export const SEO_DEFAULTS = {
  title: "Moulin Comics — Comics Marvel, DC & BD de collection",
  description: "Moulin Comics sélectionne des comics Marvel, DC Comics, comics américains et BD de collection pour les passionnés et collectionneurs.",
};
