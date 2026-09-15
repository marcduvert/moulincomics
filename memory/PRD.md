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

### Correctifs déploiement production — 2026-09
- Ajout de `GET /health` (app principale, sans DB) + `GET /api/health` — la sonde Kubernetes retournait 404 en boucle et bloquait le déploiement.
- `.gitignore` : retrait des motifs `.env`/`.env.*`/`*.env` (les .env sont nécessaires au conteneur ; credentials.json, *.key, test_credentials.md restent exclus).
- Vérifications : /health → 200, 56/56 pytest, deployment_agent status=pass.
- Rappel : la bascule SEO vers moulincomics.com (SITE_URL + REACT_APP_ROBOTS) reste en attente de la décision utilisateur (question posée, pas de réponse avant interruption).


### Mondial Relay V1 (deux modes de livraison) — 2026-09
- Checkout en 2 étapes dans CartDrawer : panier → mode de livraison. Deux options : Point Relais/Locker Mondial Relay (France) et Livraison à domicile ; tarifs 4,90/7,90 € stockés dans `site_content.shipping`, éditables dans Admin → onglet Livraison, **vérifiés côté serveur** à chaque checkout (jamais le prix du frontend). Ligne « Livraison » ajoutée à la session Stripe ; total serveur exact.
- Commande enrichie : shipping_method, shipping_price, shipping_country, relay_point_* (id, nom, type, adresse, CP, ville, pays, lat/lng), shipping_status (8 états : a_preparer→annulee), tracking_number, shipping_label_url.
- API Mondial Relay officielle : API1 SOAP WSI4_PointRelais_Recherche (zeep, signature MD5 ordre contractuel). **État : MONDIAL_RELAY_NOT_CONFIGURED** — le compte test public BDTEST13 est désactivé par MR (STAT 95 sur les 2 endpoints officiels) ; `MONDIAL_RELAY_ENSEIGNE`/`MONDIAL_RELAY_PRIVATE_KEY` vides dans backend/.env → à remplir avec les identifiants marchands (espace Mondial Relay Connect → Configuration des API). Dès qu'ils sont renseignés, le sélecteur de relais s'active sans changement de code.
- Endpoints : GET /api/shipping/methods, GET /api/mondial-relay/points (503 si non configuré), GET /api/admin/mondial-relay/status, PUT /api/admin/orders/{sid}/shipping, POST /api/admin/orders/{sid}/create-shipment (503 tant qu'API2 non configurée — bouton admin masqué).
- UI : blocage paiement si MR sans relais (« Veuillez sélectionner un Point Relais Mondial Relay avant de continuer. »), page succès avec bloc livraison/relais, admin commandes avec badge méthode + relais + statut expédition + n° suivi + lien « Voir le suivi », email de confirmation avec bloc Livraison. i18n FR/EN/ES.
- Extensibilité : shipping_method extensible (colissimo, shop2shop) via SHIPPING_METHODS + config.
- Tests : iteration_9.json (14/14 backend + 100% frontend + mobile) ; paiement Stripe e2e vérifié (session avec ligne Livraison 7,90 €, total exact, page succès avec bloc livraison). pytest total : 70/70.


### Batch UX/RGPD/Contact — 2026-09
- Bandeau jaune home : noms de séries du catalogue (GET /api/series, administrables via onglet Séries) ; bandeau noir = villes (administrables via Contenu du site).
- Menu : BIENVENUE (1re position, lien /) + CONTACT (page /contact : formulaire nom/email/objet/message, validation, envoi réel au gérant via Resend existant, reply-to visiteur ; POST /api/contact).
- CTA « Voir l'agenda » : /conventions#agenda avec scroll fluide (id=agenda, scroll-mt-20).
- Bannière RGPD : accepter/refuser, localStorage mc_cookie_consent, réouverture via lien footer « Préférences cookies ». Aucun cookie non nécessaire aujourd'hui (pas d'analytics).
- Catalogue : badge « dernier ex. » supprimé → EN STOCK (vert, stock>0) / ÉPUISÉ (rouge, stock=0) ; filtre « En stock » (?stock=1) combinable. i18n FR/EN/ES.
- Titre « La maison » éditable (site_content maison.title, onglet La Maison de Contenu du site).
- Admin édition produit : récupère la fiche complète (GET /products/{id}) → traductions EN/ES préremplies, jamais écrasées.
- Tests : iteration_10.json — 100 % backend+frontend, non-régression complète. Revue : PUT /admin/products exige tous les champs (risque théorique hors UI, documenté).

### Clarification gestion des commandes — 2026-09
- Deux niveaux distincts : COMMANDE (`fulfillment_status` : a_traiter → en_preparation → prete_expedition → expediee → terminee / annulee) = action du gérant ; STATUT DE LIVRAISON (`shipping_status`, 8 états inchangés) = position du colis. Champs DB conservés, seules les valeurs migrées.
- Synchronisation backend avec garde-fou anti-retour (ORDER_RANK) : livraison preparee→commande prete_expedition ; expediee/en_transit/disponible_relais→expediee (+email client une fois, +shipped_at) ; livree→terminee ; exceptions incident→a_traiter, annulee→annulee. Actions couplées inverse : prete_expedition→livraison preparee ; expediee→livraison expediee ; annulee→livraison annulee.
- Liste : colonne COMMANDE (badge + action rapide « Commencer la préparation » / « Marquer comme prête » / « Marquer comme expédiée », « ✓ Commande terminée »), plus de double dropdown, filtre 6 états. Détail : sections PAIEMENT / COMMANDE / LIVRAISON / STATUT DE LIVRAISON / SUIVI (transporteur, n° suivi + lien, date d'expédition).
- Migration idempotente au startup : en_attente→a_traiter, livree→terminee, défauts posés. Aucune donnée supprimée.
- Tests : iteration_11.json — 12/12 backend (chaîne complète, garde-fou, exceptions, email idempotent) + 100 % frontend (cross-sync UI en direct). shipped_at jamais écrasé si déjà posé.


- P1: gestion des frais de port / retrait salon.
- P2: comptes clients + historique de commandes.
- P2: recherche avancée / tri par prix, wishlist.
- P2: ~~emails de confirmation de commande~~ (fait, avec email d'expédition, via Resend managé).

## Credentials
Voir /app/memory/test_credentials.md
