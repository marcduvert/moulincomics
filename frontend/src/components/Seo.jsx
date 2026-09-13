import { useEffect } from "react";
import { absUrl } from "../lib/seo";

const setMeta = (attr, key, content) => {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
};

const absImg = (image) => {
  if (!image) return null;
  return image.startsWith("http") ? image : absUrl(image);
};

/**
 * Gère les balises <head> d'une page : title, meta description, robots,
 * canonical, Open Graph, Twitter Card et données structurées JSON-LD.
 */
export const Seo = ({ title, description, path = "/", image, type = "website",
                      ogTitle, ogDescription, noindex = false, jsonLd }) => {
  const jsonLdStr = jsonLd ? JSON.stringify(jsonLd) : null;
  useEffect(() => {
    if (title) document.title = title;
    const robots = noindex ? "noindex,nofollow" : (process.env.REACT_APP_ROBOTS || "index,follow");
    setMeta("name", "robots", robots);
    setMeta("name", "description", description);
    setMeta("property", "og:title", ogTitle || title);
    setMeta("property", "og:description", ogDescription || description);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", absUrl(path));
    const img = absImg(image) || absUrl("/logo.png");
    setMeta("property", "og:image", img);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", ogTitle || title);
    setMeta("name", "twitter:description", ogDescription || description);
    setMeta("name", "twitter:image", img);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = absUrl(path);
    let script;
    if (jsonLdStr) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = "seo-jsonld";
      script.text = jsonLdStr;
      document.head.appendChild(script);
    }
    return () => { if (script) script.remove(); };
  }, [title, description, path, image, type, ogTitle, ogDescription, noindex, jsonLdStr]);
  return null;
};
