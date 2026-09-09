# PRD — Moulin Comics

## Problem statement
Site de vente en ligne du stock de BD/comics de la société Moulin Comics — comic shop spécialisé en VO, avec un large stock de mensuels VF (Strange, Nova, Titans). Participe aussi à des salons en Europe.

## User choices
- Vraie boutique avec paiement en ligne (Stripe)
- Espace admin de gestion du stock : indispensable
- Pas de comptes clients (achat/consultation invité)
- Design libre → "Editorial Brutalist × Vintage Comic Print"
- Visuels fournis plus tard (placeholders pour l'instant)
- Fait des salons en Europe

## Architecture
- Frontend: React 19, framer-motion, lenis smooth scroll, Tailwind, shadcn/sonner. Storefront + Admin layouts séparés.
- Backend: FastAPI, Motor/MongoDB. Routes `/api`.
- Paiement: Stripe (sandbox claimable, Flow A), checkout dynamique par `price_data` en EUR, tax_mode = calc_only (Stripe Tax) avec fallback sans taxe. Webhook `/api/stripe/webhook`.
- Auth admin: JWT httpOnly cookie, bcrypt, seed admin au démarrage.

## Personas
- Collectionneur VO cherchant des comics US originaux.
- Nostalgique VF cherchant Strange/Nova/Titans d'époque.
- Le gérant (admin) gérant son inventaire et suivant les commandes.

## Implemented (2026-06)
### Import intelligent IA (batch) — 2026
- Module `/admin/import` (bouton "IMPORT INTELLIGENT (IA)" dans l'admin): sélection multi-photos + drag&drop + miniatures, analyse IA par lots (OpenAI gpt-5.4 vision, concurrence 5) avec progression et reprise après erreur, tableau vérifiable éditable, score de confiance 0-100 (🟢🟡🔴), détection doublons (série+n°+cat), cache par hash SHA-256 (anti-recalcul coût IA), import sélectif (tout/aucun/fiables) + option auto ≥95%, valeurs par défaut (prix 0, stock 1, Bon état), photo analysée = couverture produit, journal des sessions. Endpoints `/api/admin/import/{analyze,bulk-create,session,sessions}`. Réutilise le modèle Product, l'object storage et l'auth admin existants — aucun système parallèle.
- Storefront: Home kinetic (hero line-reveal + parallax), marquees, sélection featured, manifeste, teaser salons.
- Boutique: filtres catégorie/série/recherche, grille produits.
- Fiche produit: spotlight sticky, specs, ajout panier.
- Panier drawer + checkout Stripe + pages success/cancel (polling statut).
- Page Salons (agenda Europe).
- Admin: login JWT, CRUD inventaire, onglet commandes.
- 12 produits seed (VO + VF Strange/Nova/Titans).
- Admin: login JWT, CRUD inventaire, onglet commandes, séries, salons, suppression groupée/dédoublonnage.
- Multilingue UI FR/EN/ES (LanguageContext) + descriptions produits FR/EN/ES.

### Contenu éditorial administrable + multilingue — 2026-09
- Collection MongoDB indépendante `site_content` (document key='home'), sections : hero, maison (3 blocs), salons, villes (marquee), footer.
- Page admin `/admin/content` ("Contenu du site") : édition structurée par onglets, upload d'images éditoriales via l'object storage existant, villes réordonnables.
- Versions par langue : overrides optionnels `en`/`es` imbriqués par section. Le français est la base ; tout champ de traduction vide retombe sur le FR (admin) puis sur les traductions statiques du site (public). Bandeau des villes commun à toutes les langues.
- Endpoints : `GET /api/content` (public), `PUT /api/admin/content/{section}` (FR), `PUT /api/admin/content/{section}/{lang}` (en|es, champs vides = retour au FR).
- Frontend : `ContentContext` + localisation client dans `Home.jsx` (helper `localized()`) et `Footer.jsx`. Design général inchangé, catalogue non touché.
- Tests : iteration_5.json — 9/9 backend pytest + flux e2e Playwright (édition EN/ES, persistance, fallback, non-régression catalogue).

## Backlog
- P1: upload d'images de couverture (object storage) au lieu d'URL.
- P1: gestion des frais de port / retrait salon.
- P2: comptes clients + historique de commandes.
- P2: recherche avancée / tri par prix, wishlist.
- P2: emails de confirmation (Resend).

## Credentials
Voir /app/memory/test_credentials.md
