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

### Gestion des commandes enrichie — 2026-09
- Les infos client Stripe (nom, email, téléphone, adresse de livraison, adresse de facturation) sont enregistrées dans `payment_transactions` via webhook `checkout.session.completed`, polling `/payments/status/{session_id}` et rattrapage paresseux (10 max/appel) dans `GET /api/admin/orders` pour les commandes payées sans fiche.
- Admin onglet Commandes : colonnes Date + Client (nom/email), fiche détaillée dépliable au clic (client, livraison avec repli « Identique à la facturation », facturation, détail articles, réf. complète).
- Tests : iteration_6.json — 6/6 backend + achat e2e réel Stripe (commande test 22 € « Alice E2E Tester » conservée en base, statut Nova nº45 passé « Expédiée » pendant les tests).

- Tests : iteration_5.json — 9/9 backend pytest + flux e2e Playwright (édition EN/ES, persistance, fallback, non-régression catalogue).

### Emails d'expédition + gestion commandes avancée — 2026-09
- Email transactionnel automatique au client quand une commande passe à « Expédiée » : intégration Resend managée Emergent (`EMERGENT_EMAIL_KEY`/`EMAIL_FROM_NAME`/`EMAIL_REPLY_TO` dans backend/.env), modèle HTML serveur fixe avec porte `_assert_safe_email`, déclenché dans `PUT /api/admin/orders/{session_id}/status` uniquement à la transition vers `expediee` (flag `shipping_email_sent` anti-doublon, posé avant envoi et annulé si échec ; l'échec d'envoi ne bloque pas le statut).
- `POST /api/admin/orders/bulk-delete` : suppression groupée de commandes.
- Onglet Commandes admin : recherche texte (client/email/article/réf.), filtres Paiement et Traitement, tri Date/Client/Montant par clic d'en-tête, cases à cocher + tout sélectionner + bouton Supprimer (confirm).
- Tests : iteration_7.json — 9/9 backend + e2e filtres/tri/recherche/sélection/suppression. Email réel validé vers delivered@resend.dev.

### Email de confirmation de commande — 2026-09
- Email automatique au client dès que le paiement est validé (webhook `checkout.session.completed` ou polling `/payments/status/{session_id}`), via `_maybe_send_confirmation_email` : flag `confirmation_email_sent` anti-doublon posé avant envoi et annulé en cas d'échec.
- Modèles factorisés : `_order_email_html` (mise en page commune) + `_shipping_email_html` / `_confirmation_email_html`.
- Note test : le proxy email applique une limite de débit (429 après envois répétés) — espacer les tests d'envoi.
- Suite pytest : 56/56 en séquentiel (`-n 0`) ; en parallèle (xdist, imposé par pytest.ini) des races sur la base partagée peuvent faire échouer des teardowns — problème de suite de tests, pas de l'app.

### SEO V1 — 2026-09
- Config centralisée du domaine : `SITE_URL` (backend/.env) + `REACT_APP_SITE_URL` et `REACT_APP_ROBOTS` (frontend/.env) ; `frontend/src/lib/seo.js` (SITE_URL, absUrl, SEO_DEFAULTS). Preview en noindex ; bascule domaine définitif = 2 variables + ligne Sitemap dans public/robots.txt.
- Composant `Seo.jsx` : title, meta description, robots, canonical, Open Graph, Twitter Card, JSON-LD par page. index.html : lang=fr, title/meta/OG/canonical par défaut (crawlers sans JS).
- Pages : accueil (Seo + Organization/WebSite, surchargeable via section `seo` de site_content), boutique (canonical sans paramètres + BreadcrumbList), fiche produit (title/description dynamiques sur données réelles, Product Schema sku/brand/offers EUR/availability réelle/itemCondition, BreadcrumbList + fil d'Ariane visuel), salons ; noindex sur paiement + admin.
- `GET /api/sitemap.xml` dynamique (3 pages + produits auto) ; public/robots.txt (Disallow /admin /payment /cart /checkout + Sitemap). Images : alt descriptifs + lazy loading cartes.
- Admin « Contenu du site » : onglet SEO (seo_title, meta_description, og_title, og_description, og_image + compteurs indicatifs 55/155), multilingue EN/ES hérité du mécanisme existant.
- Nettoyage : 2 produits artefacts pytest (TEST_Comic Alpha/Beta) et 3 séries TEST supprimés — catalogue 13 vrais produits.
- Tests : iteration_8.json — 100 % backend+frontend, non-régression catalogue/panier/checkout/admin/i18n/mobile. pytest 56/56 séquentiel.
- Limites connues : SPA sans SSR (balises pages internes injectées en JS, Google les lit ; index.html porte les balises accueil en dur) ; og:image produits = couverture (pas de recadrage 1200×630) ; Merchant Center et blog hors V1 par demande.

- Tests obsolètes corrigés : test_shop_perf (default BASE_URL), test_import_ia (descriptions vérifiées via endpoint détail), test_shipping_email (destinataire delivered@resend.dev forcé car l'adresse example.com de la session Stripe est rejetée par le proxy).


## Backlog
- P1: upload d'images de couverture (object storage) au lieu d'URL.
- P1: gestion des frais de port / retrait salon.
- P2: comptes clients + historique de commandes.
- P2: recherche avancée / tri par prix, wishlist.
- P2: ~~emails de confirmation de commande~~ (fait, avec email d'expédition, via Resend managé).

## Credentials
Voir /app/memory/test_credentials.md
