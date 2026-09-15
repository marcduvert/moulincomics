import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cookie } from "lucide-react";
import { useLang } from "../context/LanguageContext";

const CONSENT_KEY = "mc_cookie_consent";

/**
 * Bannière de consentement RGPD.
 * Le site ne dépose aujourd'hui aucun cookie non nécessaire (pas d'analytics) :
 * le choix est enregistré (localStorage) et pourra piloter de futurs outils.
 * Rouverture possible via l'événement window "open-cookie-consent" (lien footer).
 */
export const CookieConsent = () => {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
    const reopen = () => setVisible(true);
    window.addEventListener("open-cookie-consent", reopen);
    return () => window.removeEventListener("open-cookie-consent", reopen);
  }, []);

  const choose = (value) => {
    localStorage.setItem(CONSENT_KEY, value);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div data-testid="cookie-banner"
          className="fixed bottom-0 inset-x-0 z-[80] border-t-2 border-ink bg-paper shadow-hardlg"
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "tween", duration: 0.3 }}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Cookie size={20} className="shrink-0 mt-0.5 text-comicred" />
              <div>
                <p className="font-display font-bold text-sm">{t.cookie.title}</p>
                <p className="font-mono text-xs text-inksoft mt-1 leading-relaxed">{t.cookie.text}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <button onClick={() => choose("refused")} data-testid="cookie-refuse"
                className="font-mono text-xs uppercase tracking-widest px-5 py-3 border-2 border-ink rounded-md hover:bg-papersoft transition-colors">
                {t.cookie.refuse}
              </button>
              <button onClick={() => choose("accepted")} data-testid="cookie-accept"
                className="font-mono text-xs uppercase tracking-widest px-5 py-3 border-2 border-ink rounded-md bg-ink text-paper hover:bg-comicred transition-colors">
                {t.cookie.accept}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
