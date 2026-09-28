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
- Rappel : la bascule SEO vers moulincomics.com (SITE_URL + REACT_APP_ROBOTS) a été faite le 2026-09-17 (voir section dédiée ci-dessous).


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

### Batch V2 : slugs SEO + salons enrichis + admin UX — 2026-09
- **Slugs produits** : champ `slug` (minuscules, sans accents, tirets, unique via suffixe -2) + `old_slugs` (historique, redirection sans chaîne). Migration startup idempotente pour les existants. `GET /api/products/{id|slug|ancien-slug}` résout les trois ; le frontend redirige instantanément vers l'URL canonique (SPA : redirect client — pas de 301 HTTP possible, l'ingress ne route que /api/* vers le backend ; la canonical porte toujours l'URL slug). Renommage admin → nouveau slug + ancien conservé dans old_slugs. Sitemap en slugs. Index Mongo slug/old_slugs.
- **Salons** : champs description, website (lien « Site officiel ↗ » nouvel onglet, masqué si vide), photo (upload existant), ordre (tri : ordre explicite d'abord, sinon plus récentes). Design lignes conservé.
- **Admin produits** : miniature cliquable → modal grand format ; nom + « Voir le produit ↗ » (slug, nouvel onglet).
- **Admin commandes** : articles cliquables vers fiche publique (slug injecté par le backend ; texte simple si produit supprimé).
- **SEO fiches** : déjà conforme (title/H1/JSON-LD) ; meta description = description localisée (FR/EN/ES) si présente sinon générée ; canonical = URL slug.
- Garde-fou images : placeholder « Sans couverture » si cover_image vide (plus de warning src='').
- Tests : iteration_12.json — 9/9 tests V2 + 91/91 régression totale, frontend 100 %.


### Micro-optimisations (salons/contact/mobile) — 2026-09
- Salon : clic photo → popup grand format (X / clic extérieur) ; titre agenda → « Agenda de nos salons » (FR/EN/ES) ; ancre #agenda avec titre visible en haut (scroll-mt-24).
- Contact : nouvelle section `contact` dans site_content (photo, top_text, bottom_text) — rubrique Contact dans Contenu du site (upload existant), affichage auto sur /contact (photo masquée si vide).
- Admin mobile : flex-wrap sur barre d'onglets + rangée d'actions (plus de débordement 390px).
- Sécurité : PUT /admin/salons en exclude_unset (un PUT partiel ne vide plus les autres champs). Salon résiduel vide de test supprimé.
- Vérifications ciblées navigateur (popup, ancre, contact, mobile) — pas de suite de régression complète (demande explicite).

### Bascule domaine moulincomics.com + sitemap racine — 2026-09
- **robots.txt** : ligne Sitemap remplacée par `Sitemap: https://moulincomics.com/sitemap.xml` ; règles Allow/Disallow inchangées.
- **Sitemap à la racine** : l'infra Emergent ne route que `/api/*` vers le backend, donc `/sitemap.xml` est un fichier statique (`frontend/public/sitemap.xml`, copié dans le build) servi en `application/xml` par le serveur frontend — vérifié : la prod sert bien les fichiers statiques existants (robots.txt, asset-manifest.json) et ne fait le fallback React que sur les fichiers absents.
- **Régénération automatique** : `build_sitemap_xml(base)` factorisé dans server.py ; `write_sitemap_file()` écrit `public/sitemap.xml` (artefact de déploiement) + `build/sitemap.xml` si le dossier existe (fraîcheur du déploiement courant), au démarrage + toutes les 10 min (tâche asyncio), sans écriture si contenu inchangé. Domaine canonique codé en constante `PUBLIC_SITE_DOMAIN = "https://moulincomics.com"` (les secrets prod ne sont pas modifiables depuis le repo).
- **Endpoint dynamique** `GET /api/sitemap.xml` inchangé (temps réel, base = SITE_URL). Artefact embarqué généré depuis la prod (21 URLs : 3 pages + 18 produits) pour couvrir le cas où l'écriture dans build/ serait impossible en prod.
- **Bascule SEO finale** (validée par l'utilisateur) : `SITE_URL` (backend/.env) et `REACT_APP_SITE_URL` (frontend/.env) → https://moulincomics.com ; `REACT_APP_ROBOTS` noindex,nofollow → **index,follow**. Canonical/OG en prod pointaient déjà sur moulincomics.com.
- Tests preview : /sitemap.xml → 200 application/xml sans fallback React, XML valide (16 URLs preview, toutes moulincomics.com, slugs uniquement, aucun ObjectId), robots.txt conforme, meta robots index,follow, test pytest sitemap OK.
- À vérifier post-déploiement : https://moulincomics.com/sitemap.xml (XML + 21 URLs), /robots.txt, meta robots en prod.

### Correctif slug à la création (import IA) — 2026-09
- Produit ajouté par l'utilisateur en prod sans slug (URL /product/<ObjectId>) : la création manuelle générait déjà le slug (ligne create_product), mais **`POST /api/admin/import/bulk-create` insérait sans slug** ; le rattrapage `_ensure_product_slugs()` ne tourne qu'au startup (attente d'un redémarrage).
- Fix : `prod["slug"] = await _unique_slug(_slugify(...))` avant insert dans bulk-create. Slug désormais instantané sur les 2 voies de création (manuelle + import IA) ; migration startup = filet de sécurité pour l'existant.
- Confirmé en prod après redéploiement : le produit « Futures End: Batman #1 » a reçu le slug `futures-end-batman-1` (migration startup). Ancienne URL ObjectId continue de fonctionner (redirection client).
- Tests preview : bulk-create → slug `test-slug-import-7` ✓ ; création manuelle → `test-slug-manuel-3` ✓ ; produits de test supprimés ; suite pytest slugs 9/9 ; aucun artefact TEST.

### Mode vacances (fermeture des achats) — 2026-09
- Nouvelle section `vacation` dans `site_content` : `{enabled, message}` (défaut message : « Notre boutique est actuellement fermée pour congés. Les commandes reprendront prochainement. » si champ vide). `CONTENT_SECTIONS` dérive de `DEFAULT_CONTENT` → endpoints génériques `PUT /api/admin/content/vacation` + `GET /api/content` réutilisés, aucune nouvelle route.
- **Blocage serveur** : garde au début de `POST /api/payments/checkout` → HTTP 409 + message AVANT toute création de session Stripe. Incontournable côté client.
- Admin : nouvel onglet « Vacances » (à côté de Livraison) dans Admin.jsx — statut 🟢 Boutique ouverte / 🔴 Boutique fermée, interrupteur ON/OFF, textarea « Message de fermeture », Enregistrer.
- Frontend public : bandeau rouge global dans le layout Storefront (App.js) quand ON ; CartDrawer : notice + boutons commande/paiement désactivés + garde `checkout()`. Catalogue, fiches produits, prix et stocks restent visibles ; commandes admin inchangées.
- Tests ciblés preview (pas de régression complète, demande explicite) : OFF→checkout 200 ; ON→409 avec message personnalisé ; message vide→défaut ; catalogue/fiche 200 en mode ON ; OFF→200 à nouveau ; captures bannière/panier/admin OK ; transactions de test supprimées. Preuve live accidentelle en prod : la fermeture y a bloqué le checkout avec le message personnalisé de l'utilisateur.

### Mondial Relay — passage aux credentials réelles — 2026-09
- Aucune modification de code : l'intégration existante lit `MONDIAL_RELAY_ENSEIGNE` + `MONDIAL_RELAY_PRIVATE_KEY` (Secrets Emergent, injectés en env backend, jamais exposées au frontend).
- Les valeurs saisies par l'utilisateur dans l'onglet Secrets + Re-publish ont activé l'API1 : `available:true` sur `/api/shipping/methods`.
- Tests prod (uniquement ceux demandés) : connexion API OK (SOAP STAT=0) ; recherche 75001 → 20 points relais réels ; sélection e2e au checkout OK (ARS INFORMATIQUE n°034439, ligne Livraison 3,50 €, total exact) ; conservation en commande OK (méthode + nom + adresse + CP/ville du relais dans `payment_transactions` ; `relay_point_id` stocké en base mais non retourné par l'endpoint de statut public — comportement préexistant). Transaction de test supprimée après vérification.
- Note : tarifs livraison prod = 3,50 € relais / 7,50 € domicile (réglés par le gérant dans Admin → Livraison).
- Reste P2 : API2 (création d'expédition/étiquette) nécessite `MONDIAL_RELAY_API2_LOGIN/PASSWORD/CUSTOMER_ID` — non demandé.
- Adresse Stripe allégée pour le relais : `shipping_address_collection` n'est envoyé à Stripe que pour `home_delivery` ; pour `mondial_relay` Stripe ne demande plus d'adresse de livraison personnelle (destination = relais, déjà stocké ; facturation toujours demandée). Diagnostic préalable : relay_point_* jamais écrasés par l'enrichissement Stripe (champ `shipping` séparé), emails déjà centrés relais, fallback admin « Identique à la facturation » existant.

### Sitemap racine — correctif de fraîcheur — 2026-09
- Le 1er mécanisme (backend écrit public/sitemap.xml toutes les 10 min) embarquait les données PREVIEW dans les builds. Correctif : script `prebuild` dans package.json — `curl https://moulincomics.com/api/sitemap.xml → public/sitemap.xml` à chaque build (fallback : conserve l'existant si fetch impossible, jamais d'échec de build). Confirmé en prod : 28 URLs, catalogue réel complet.

### Filtre Séries — affichage Top N + compteurs — 2026-09
- Shop.jsx uniquement (aucun changement backend/DB) : compteurs calculés côté client depuis le catalogue déjà chargé (`allProducts`), tri par count desc puis alpha. Desktop : TOUTES SÉRIES + Top 14 « NOM (X) » + AUTRES SÉRIES ▾ + SANS SÉRIE (X) si >0. Mobile : même zone en rangée scrollable unique (max-sm:flex-nowrap overflow-x-auto), Top 9 visibles (rang 10-14 en `hidden sm:inline-block`), reste dans le dropdown.
- Dropdown « Autres séries » : ordre alphabétique, compteurs, champ « Rechercher une série… » (filtre client), fermeture au clic extérieur/sélection ; items rang 10-14 masqués sur desktop (`sm:hidden`) — une seule liste pour les deux formats.
- « SANS SÉRIE » : sentinelle `__sans_serie__` dans le MÊME prédicat de filtre existant (`?series=`), garde dans Seo pour ne pas fuiter dans le title. Aucune deuxième logique de filtrage.
- Suppression du fetch `/api/series` devenu inutile dans Shop (compteurs dérivés des produits).
- Tests ciblés preview (10 produits TEST_ créés puis supprimés, catalogue restauré 13/8/0) : desktop top14+compteurs ✓, dropdown 2 restantes + recherche ✓, clic série → filtre exact (Wolverine 3, sans série 2) ✓, mobile 390px : 9 top + rangée scrollable sans débordement page ✓, dropdown mobile 7 items + sélection ✓. Nb : spec détaillée = 9 mobile (la checklist mentionnait « TOP 5 » — retenu 9).
- Non déployé au moment de l'implémentation (partira au prochain déploiement).
- Correctif mobile (même jour, CSS uniquement) : scroll horizontal supprimé → flex-wrap naturel ; ordre mobile via `max-sm:order-*` : ligne 1 = TOUTES SÉRIES + AUTRES SÉRIES ▾ (+ SANS SÉRIE si >0, wrap naturel si largeur insuffisante), 9 séries en dessous sur 2-3 lignes. Desktop et logique inchangés. Vérifié 390px : aucun débordement, AUTRES SÉRIES visible sans scroll, dropdown OK.
- I18n des 3 boutons (même jour) : clés `shop.otherSeries` / `shop.noSeries` ajoutées FR/EN/ES (allSeries existait) ; « Autres séries ▾ » et « Sans série (X) » utilisent désormais t.shop.* — « ▾ » et le compteur restent hors traduction.

### Import IA — image IA réduite à 1200 px — 2026-09
- Contexte coûts Clé Universelle : mesuré en usage réel ≈ 0,19 crédit/couverture (~4 € les 100) ; les débits « −5 » du dashboard sont des transferts auto-recharge vers le portefeuille séparé de la clé (seuil 5), pas des pertes. Volume mesuré le 2026-09-20 : ~107 analyses (80 prod + 27 preview), 97 % en mini.
- `downscale_for_llm()` (server.py) : copie temporaire max 1200 px (ratio conservé, JPEG q90) UNIQUEMENT pour l'envoi au modèle dans `POST /api/admin/import/analyze`. L'image produit stockée (après autocrop éventuel) garde sa résolution d'origine ; le hash du cache SHA-256 reste calculé sur l'original avant redimensionnement ; mode éco GPT-5.4-mini + escalade <80 inchangés ; prompts/frontend/données intacts. Endpoint unitaire `/admin/analyze-cover` volontairement hors périmètre (demande utilisateur).
- Test ciblé (1 vraie couverture, 1 appel LLM) : stockée 2400×3200 conservée ✓, copie IA 900×1200 ✓, identification correcte (Conan Saga #49, confiance 98, mini, sans escalade) ✓, cache : 2ᵉ envoi = cached:true (0 appel) ✓. Passe-through byte-identique si ≤1200 px (vérifié 800×600). Traces de test purgées.

### Édition inline table Stock admin — 2026-09
- Backend : `PATCH /api/admin/products/{id}` (ProductPatch price/series/stock, partiel, validations prix ≥0 et stock entier ≥0, prix arrondi 2 déc.) — n'écrase jamais les autres champs (évite le risque de stock périmé du PUT complet).
- Frontend Admin.jsx : composants `InlineField` (prix/stock — Entrée ou blur → save, Échap → annule, spinner discret → « Enregistré » → erreur avec restauration de l'ancienne valeur) et `SeriesCell` (select : « Sans série » + séries de la gestion Séries, « Autre série » incluse car présente en base ; valeur courante hors liste affichée en option de secours). Mise à jour locale via setProducts, aucun rechargement. Prix : virgule ou point acceptés (affichage français à virgule, stocké numérique). Stock 0 → Épuisé automatique côté boutique (logique existante). Icône crayon inchangée.
- Tests : API (PATCH prix 7,50→float ✓, négatifs rejetés 400 avec message FR ✓, stock 0 ✓, série ✓, champs intacts ✓) + UI admin vérifiée par l'utilisateur ; produit de test restauré à l'identique.

### Import IA — popup couverture + choix manuel de la série — 2026-09
- ImportIA.jsx uniquement. Popup : clic miniature → image originale déjà chargée (objectURL local, aucune copie ni appel IA), proportions conservées (object-contain 90vw/85vh), fermeture croix + Échap + clic extérieur.
- Série : input remplacé par select — options = « Sans série » + séries de la gestion Séries (`GET /admin/series` ; « Autre série » apparaît automatiquement si présente en base), valeur IA présélectionnée si elle correspond (sinon ajoutée en option de secours pour ne rien perdre). Choix manuel = simple patchResult (0 appel IA), prioritaire à l'import (bulk-create envoie result.series tel quel).
- Tests ciblés (1 couverture, 1 seul appel LLM) : popup 3 fermetures ✓, select 24 options ✓, IA « Conan Saga » présélectionnée ✓, changement manuel → Wolverine ✓, import → série « Wolverine » vérifiée en MongoDB ✓, compteur d'appels analyze inchangé après le changement manuel (61→62, soit la seule analyse) ✓. Toutes traces de test purgées (produit, cache, fichier, session).

### Pages légales administrables (mentions/CGV/livraison) — 2026-09
- 3 routes publiques : `/mentions-legales`, `/cgv`, `/politique-livraison` via composant commun `ContentPage.jsx` (header/footer existants, charte existante, responsive). Contenus 100 % issus de site_content (jamais en dur) : section `legal` = {mentions, cgv} et `shipping.policy` (dans la section livraison existante, aucune nouvelle collection). Préremplis via DEFAULT_CONTENT (contenus originaux adaptés Moulin Comics, placeholders [À COMPLÉTER : …]).
- Admin : onglet « Pages légales » dans Contenu du site (2 champs) + champ « Politique de livraison » dans l'onglet Livraison existant (tarifs/modes/MR intacts). Éditeur maison sans dépendance `RichEditor.jsx` (textarea + barre d'outils titre/sous-titre/gras/liste/lien). Sanitation sans dépendance `lib/richText.js` (DOMParser, whitelist h2/h3/p/strong/listes/liens/br, liens externes en noopener, scripts/iframes supprimés) appliquée à l'affichage public.
- Liens : footer (3 liens discrets en barre ©) + ligne « CGV — Politique de livraison » sous le bouton Payer du checkout (tunnel inchangé sinon). SEO standard par page (title/description/canonical) + 3 URL ajoutées au sitemap.
- Tests ciblés : édition admin → save → public pour les 3 contenus ✓ ; tarifs livraison inchangés après save ✓ ; 3 liens footer ✓ ; mobile 390px sans débordement ✓ ; injection `<script>` neutralisée (non exécutée, 0 balise script, contenu rendu) ✓ ; marqueurs de test purgés, contenus par défaut restaurés ✓.
- NON DÉPLOYÉ : attente confirmation utilisateur (demande explicite).
- Vérifié en prod après déploiement : « Futures End: Batman #1 » a reçu `futures-end-batman-1` via la migration startup ✓.

### Sitemap racine — correctif artefact (2026-09, suite)
- Le rafraîchisseur 10 min en preview écrasait `public/sitemap.xml` avec le catalogue preview (16 URLs) → artefact embarqué incomplet en prod. Correctif : `prebuild` dans package.json (`curl -sf https://moulincomics.com/api/sitemap.xml -o public/sitemap.xml || fallback`) → chaque build embarque le sitemap production à jour (le backend le génère dynamiquement, fraîcheur = à chaque déploiement). Effet de bord constaté : écriture runtime dans `build/` sans effet en prod (layout différent), d'où le choix prebuild.

### Mode vacances (fermeture des achats) — 2026-09
- Section `vacation` dans `site_content` (DEFAULT_CONTENT : `enabled: False`, `message`: défaut « Notre boutique est actuellement fermée pour congés. Les commandes reprendront prochainement. ») — réutilise `PUT /api/admin/content/{section}` et `GET /api/content` existants, persistance MongoDB.
- Blocage serveur : garde au début de `POST /api/payments/checkout` → HTTP 409 + message (personnalisé ou défaut) AVANT toute création de session Stripe. Aucun contournement possible côté navigateur.
- Admin.jsx : nouvel onglet « Vacances » (à côté de Livraison) — statut 🟢 Boutique ouverte / 🔴 Boutique fermée, interrupteur ON/OFF, champ « Message de fermeture » (vide = défaut), bouton Enregistrer.
- Storefront : bandeau rouge avec le message sous le Header (App.js) quand ON ; CartDrawer : notice + bouton « Commander » désactivé + garde dans checkout(). Catalogue, fiches, prix et stocks restent visibles ; commandes admin inchangées.
- Tests ciblés preview : OFF→checkout 200 ; ON→409 avec message personnalisé puis message par défaut (champ vidé) ; catalogue+fiche 200 en ON ; OFF→200 à nouveau ; UI : bannière, notice panier, bouton désactivé, onglet admin (🟢, toggle, champ) ; transactions de test supprimées ; état final OFF.
- En attente : déploiement pour mise en prod (embarqué avec le prochain re-publish, qui inclura aussi credentials Mondial Relay + correctif sitemap prebuild).

- P2: comptes clients + historique de commandes.
- P2: recherche avancée / tri par prix, wishlist.
- P2: ~~emails de confirmation de commande~~ (fait, avec email d'expédition, via Resend managé).

### Pages légales multilingues (affichage public FR/EN/ES) — 2026-07
- Bug : `/mentions-legales` et `/cgv` n'affichaient que le FR alors que `legal.en.{mentions,cgv}` et `legal.es.{mentions,cgv}` existaient en base et étaient servis par `GET /api/content`.
- Cause : `ContentPage.jsx` lisait uniquement `legal.mentions` / `legal.cgv`, ignorant la langue active.
- Correctif (1 seul fichier, `frontend/src/pages/ContentPage.jsx`) : hook `useLang()` + sélection `legal[lang][field]` avec repli FR. Aucun changement backend, DB, admin, routes, SEO, liens ni design ; `/politique-livraison` non touchée ; titre H1 conservé en français (contenu localisé porte son propre titre h2).
- Test ciblé preview : FR→EN→ES→FR sur les deux pages, contenu correct et immédiat (PASS).

### Titres H1 traduits + politique de livraison EN/ES — 2026-07 (suite, validé utilisateur)
- `LanguageContext.jsx` : nouvelle section `pages` (mentionsTitle / cgvTitle / shippingTitle) dans les 3 blocs fr/en/es ; `ContentPage.jsx` utilise `t.pages[titleKey]` pour le H1 (repli FR).
- Politique de livraison multilingue : traductions EN (« Shipping Policy ») et ES (« Política de envío ») rédigées et enregistrées en base via `PUT /api/admin/content/shipping/{lang}` (stockage `shipping.en.policy` / `shipping.es.policy`, servi par `_merge_content`).
- `ContentPage.jsx` : helper `localized(c, lang, sec, field)` généralisé (legal + shipping), repli FR si traduction absente.
- Admin → Livraison (`Admin.jsx`) : sélecteur FR/EN/ES au-dessus de l'éditeur de politique (`policyLang`, champs `policy_en`/`policy_es` dans `shipCfg`). IMPORTANT : `saveShippingCfg` renvoie `en`/`es` dans le body car `PUT /admin/content/{section}` remplace toute la section — les omettre effacerait les traductions.
- Tests preview : 3 pages publiques FR/EN/ES (H1 + contenu) PASS ; admin Livraison charge les 3 langues, tarifs 4.9/7.9 intacts. Déploiement production demandé par l'utilisateur (2026-07).
- DÉPLOYÉ en production (2026-07) : les contenus légaux FR/EN/ES et la politique de livraison ont été copiés de la preview vers la base PRODUCTION via l'API admin (les bases preview/prod sont séparées ; tarifs prod 3.5/7.5 préservés, différents de la preview). Vérifié en ligne sur moulincomics.com : 3 pages × 3 langues PASS. Note : l'utilisateur a saisi ses propres formulations EN/ES de la politique de livraison dans l'admin production (« Política de envíos », « This page explains the shipping terms ») — elles priment et ne doivent pas être écrasées par celles de la preview.

### FAQ administrable (/faq) — 2026-07 (micro-évolution)
- Backend : `DEFAULT_FAQ_ITEMS` (19 questions FR/EN/ES, 5 catégories fixes) + `DEFAULT_CONTENT["faq"]={"items":[]}` + `seed_faq()` au startup — seed UNIQUEMENT si la clé `faq` est absente de site_content (idempotent, n'écrase jamais les edits admin, même suppression totale). Aucun nouvel endpoint : réutilise `GET /api/content` et `PUT /api/admin/content/faq`.
- Admin : onglet « FAQ » dans Contenu du site (`SiteContent.jsx`) — par entrée : catégorie (select 5 valeurs), ordre, actif, question/réponse FR+EN+ES (RichEditor → liens internes). Ajout/suppression/monter-descendre (swap des `order`). Save dédié `saveFaq` (ignore le sélecteur de langue).
- Public : `pages/Faq.jsx` (route `/faq`, Storefront → header/footer existants) — accordéon Radix (`ui/accordion`), groupé par catégorie, tri `order`, actifs seulement, champs `question_{lang}`/`answer_{lang}` avec repli FR, CTA → /contact. Clés i18n `pages.faq*` (titre, sous-titre, CTA, SEO, catégories) dans LanguageContext. Lien footer après Politique de livraison.
- Réponses FR rédigées par l'agent (maquette FAQ antérieure absente du workspace fork) — cohérentes CGV/politique ; modifiables dans l'admin.
- Tests ciblés (5/5 PASS preview) : /faq s'ouvre (5 catégories, 19 questions), accordéon ouvre/ferme, FR→EN→ES immédiat, édition admin visible publiquement (marqueur ajouté puis restauré), mobile 390px sans débordement. NON DÉPLOYÉ (demande explicite) — la prod n'aura /faq qu'au prochain déploiement (le seed tournera alors au démarrage).

### Catégories produits administrables — 2026-07 (micro-évolution)
- Stockage : `site_content.categories` (liste de strings, réutilise la structure existante — aucune nouvelle collection). Seed unique `seed_categories()` au startup (uniquement si clé absente) : VF, VO, Nouveauté, Marvel, DC, Comics vintage, Petits prix, Collectors.
- Backend : `ProductPatch` accepte `category` ; 2 endpoints `POST /api/admin/categories/rename` (migre les produits vers le nouveau nom) et `/delete` (produits → "" Sans catégorie, jamais supprimés). Ajout via l'existant `PUT /api/admin/content/categories`.
- Admin.jsx : onglet « Catégories » (pattern copié de Séries : ajout/renommer/supprimer) ; table Stock : cellule catégorie inline = `SeriesCell` réutilisé avec prop `emptyLabel` ; formulaire produit : select dynamique (Sans catégorie + liste) ; EMPTY.category passe à "" (création sans catégorie par défaut).
- ImportIA.jsx : select catégorie dynamique via `GET /api/content` (source commune) + option Sans catégorie.
- Public : volontairement inchangé (Shop VF/VO continue, valeurs existantes préservées).
- Tests ciblés : cycle complet API (ajout TESTCAT → patch inline produit → renommage TESTCAT2 avec migration → suppression, produit conservé cat "" → restauration VO) + distribution finale identique (VO 43 / VF 1) + filtres publics VF/VO OK + UI onglet/table vérifiés. NON DÉPLOYÉ.

### Boutique : filtres catégories dynamiques — 2026-07 (suite micro-évolution)
- `Shop.jsx` uniquement : les boutons VO/VF codés en dur sont remplacés par les catégories administrables (`useContent().categories`), affichées seulement si ≥1 produit, avec compteur calculé à la volée (même `useMemo` de comptage que les séries, étendu avec `catCounts`). TOUT / EN STOCK / séries inchangés ; `flex-wrap` ajouté sur la rangée (mobile).
- Vérifié preview : TOUT (44) / VF (1) / VO (40) / NOUVEAUTÉ (3) — l'utilisateur recatégorisait des produits en direct pendant le test ; clic VO → 40 cartes, TOUT → 44, EN STOCK → 43, série Alpha Flight → 6, mobile 390px sans débordement. NON DÉPLOYÉ.
- Correctif recalcul séries : les séries/compteurs sont désormais calculés depuis les produits filtrés par la catégorie active (`catFiltered`), compteurs catégories toujours globaux ; « TOUTES SÉRIES » affiche le total du contexte et une série incompatible avec la nouvelle catégorie est réinitialisée automatiquement (useEffect sur `category`). 6/6 vérifications PASS preview.
- « × Réinitialiser les filtres » : bouton discret aligné à droite au-dessus de la recherche (`resetFilters` : vide recherche + URL params), visible seulement si catégorie/série/EN STOCK/recherche actif, disparaît après reset. Clé i18n `shop.resetFilters` FR/EN/ES. 3/3 vérifications PASS preview.

### Refonte footer — 2026-07 (micro-modification)
- `Footer.jsx` réécrit (composant ciblé) : bloc d'accroche « VOUS CHERCHEZ UN COMIC EN PARTICULIER ? » → /contact ; identité MOULIN COMICS + baseline ; menus EXPLORER (Boutique, Nouveautés → /shop?category=Nouveauté, Petits prix → /shop?category=Petits prix — réutilise le query param existant), INFOS (Livraison/FAQ/Contact), SUIVRE (Instagram ↗ https://www.instagram.com/moulin_comics/ — handle trouvé dans les textes footer prod, nouvel onglet) ; colonnes desktop / accordéons mobile (ui/accordion Radix existant) ; barre légale discrète (© + 3 pages légales + Préférences cookies conservé pour RGPD).
- Clés i18n `footer.*` ajoutées FR/EN/ES (baseline, cta*, newArrivals, cheap, agenda, infos, delivery, follow, legalMentions).
- Retirés de l'affichage footer (spéc) : ancienne description administrable (« 50 000 comics », Vinted, infos juridiques), liens custom admin, lien Espace gérant (route /admin/login inchangée). L'onglet admin Footer existe toujours mais ses champs ne s'affichent plus dans le footer.
- 12/12 vérifications PASS preview (clics réels sur tous les liens, accordéons mobile, visuels desktop+mobile). Note : un déploiement déclenché par l'utilisateur tournait PENDANT ce chantier → il n'inclut PAS le footer ; redéploiement nécessaire pour l'avoir en ligne.

### Admin Footer + lien ADMIN + scroll haut de page — 2026-07 (micro-modification)
- Backend `DEFAULT_CONTENT.footer` : ajout `baseline`, `cta_title`, `cta_text`, `cta_button`, `instagram_url` (défauts FR fournis par l'utilisateur ; `description`/`social`/`links` conservés en base, non affichés).
- `SiteContent.jsx` onglet Footer : Identité (Texte de présentation → `baseline`), Bloc contact (Titre/Texte/Texte du bouton), Coordonnées (Adresse/Email/Téléphone conservés) + « Instagram — URL ». Multilingue FR/EN/ES via `val/setField` existants.
- `Footer.jsx` : lit `content.footer` (`cms(k, fallback)` : FR → champ FR ; EN/ES → champ traduit sinon i18n `t.footer.*`) ; Instagram = `footer.instagram_url` (nouvel onglet) ; lien discret `ADMIN` → `/admin` (redirige vers /admin/login si non connecté, auth inchangée) dans la barre légale, desktop + mobile.
- `App.js` `Layout` : `useEffect` global — `navType === "PUSH" && !loc.hash` → `window.scrollTo(0,0)` (deps `loc.key`). Les filtres Boutique (`setParams … replace:true`) et les ancres (`/conventions#agenda`) conservent leur scroll.
- Vérifié preview : baseline/CTA/Instagram admin → footer ; EN cta_title traduit + fallback EN/ES i18n ; Boutique/Nouveautés/Petits prix/fiche produit/Contact/FAQ/CGV/Livraison/Mentions/header → scrollY 0 ; `#agenda` → section visible ; ADMIN → /admin ; mobile OK. Données de test restaurées. NON DÉPLOYÉ.

## Micro-améliorations UX (25/09/2026) — livré preview, NON DÉPLOYÉ
- Fiche produit (`ProductDetail.jsx`) : ligne réassurance sous « Ajouter au panier » — `data-testid="product-reassurance"`, `t.product.reassurance` (i18n FR/EN/ES), font-mono uppercase text-inksoft centrée `mt-3`. Aucun encadré/picto. Panier/Stripe/Mondial Relay/« même rayon » intacts.
- Header (`Header.jsx`) : suppression des entrées nav VO et VF (desktop + mobile, même array `links`). Menu = Bienvenue · Boutique · Salons · Contact. Catégories VO/VF de la Boutique NON touchées (badge VO visible sur fiche).
- Contact (`Contact.jsx`) : hero titre éditorial 3 lignes via `t.contact.heroTitle` (array i18n FR/EN/ES, `<span className="block">`), surtitre MOULIN COMICS conservé. Espacement réduit (hero `py-10 sm:py-14`, contenu `pt-8 sm:pt-10 pb-12 sm:pb-16`). `top_text` CMS conservé (`cc.top_text || t.contact.intro`). Formulaire/photo/champs intacts.
- i18n : ajout `product.reassurance` et `contact.heroTitle` dans FR/EN/ES de `LanguageContext.jsx`.

## Section « Dans le même rayon » — catégorie + Voir plus (25/09/2026) — livré preview, NON DÉPLOYÉ
- `ProductDetail.jsx` : la section « Dans le même rayon » interroge désormais `/products?category=<p.category>` (au lieu de `series`) et affiche tous les produits de la même catégorie.
- Pagination progressive : `visible` (state, init 8, reset à chaque changement d'`id`), affiche `related.slice(0, visible)`, bouton `data-testid="see-more-related"` (`t.product.seeMore` FR « Voir plus » / EN « See more » / ES « Ver más ») incrémente de 8. Vérifié preview : 8 → 16.

## Navigation précédent/suivant même série (25/09/2026) — livré preview, NON DÉPLOYÉ
- `ProductDetail.jsx` : bloc compact `data-testid="series-nav"` placé APRÈS le contenu principal/réassurance et AVANT « Dans le même rayon ». Liens `series-prev` / `series-next` (texte + flèche ArrowLeft/ArrowRight, font-mono uppercase, bordure fine, hover comicred).
- Données : réutilise `related` (déjà chargé par catégorie), filtré par `x.series === p.series` — AUCUN nouvel appel API ni endpoint. Tri par `issue` numérique (parseFloat), tolérant aux trous (préc/suiv = produit réellement disponible). Rien si pas de série / série à un seul produit / pas de voisin. Aucun numéro/lien inventé.
- « Dans le même rayon » inchangé. Vérifié preview : milieu (#42→préc #41/suiv #44), premier (#40→suiv seul), dernier (#44→préc #42), single-série (rien), clic → bonne fiche + scrollY 0.

## L'œil du Moulin — note éditoriale fiche produit (25/09/2026) — livré preview, NON inclus dans le déploiement en cours
- Backend (`server.py`) : 2 champs optionnels ajoutés à `Product` ET `ProductCreate` — `moulin_eye_type` (label stable) + `moulin_eye_text`. Passent par les endpoints create/update existants (`Product(**body.model_dump())`). Aucune collection/migration ; produits existants → champs vides par défaut.
- Admin (`Admin.jsx`) : dans le modal produit (après le bloc Série), select `field-moulin-eye-type` (Aucun / À LIRE / BELLE COUVERTURE / PETIT PRIX / À DÉNICHER / POUR COMMENCER / CONSEIL DU MOULIN) + textarea `field-moulin-eye-text`. `EMPTY` mis à jour ; l'édition utilise `{...EMPTY, ...data}` (GET /products/:id renvoie les champs). Table produits inchangée (pas d'indicateur).
- Fiche publique (`ProductDetail.jsx`) : section `data-testid="moulin-eye"` affichée uniquement si `moulin_eye_text` non vide, placée APRÈS la réassurance et AVANT la nav préc/suiv. Surtitre « L'œil du Moulin — {type} » (comicred) + commentaire. Si type vide → « L'œil du Moulin » seul. Bordure ink + fond papersoft, full width mobile.
- V1 : pas de traduction du commentaire (FR unique) ; pas d'affichage Home/catalogue/Pièces de choix. Vérifié preview via PUT/GET admin : sauvegarde OK, bloc affiché avec type+texte, absent sans texte. Données de test restaurées (aucun produit modifié).

## Vidéo « L'œil du Moulin — Sur le terrain » page Salons (28/09/2026) — livré preview, NON inclus dans le déploiement en cours
- Backend (`server.py`) : endpoint dédié `POST /admin/upload-video` (mp4/webm/mov/m4v, max 60 Mo) réutilisant `put_object` + `db.files` + serving `/api/files/{path}` existants (pas de nouvelle médiathèque). `VIDEO_MIME_TYPES` ajouté sans toucher `MIME_TYPES` (images/AI intacts). Champs vidéo ajoutés à `DEFAULT_CONTENT["salons"]` : `video_enabled` (False), `video_url`, `video_poster`, `video_instagram`, `video_eyebrow` (« L'ŒIL DU MOULIN »), `video_title` (« SUR LE TERRAIN »), `video_text`. Enregistrement via l'API Content existante (`PUT /admin/content/salons` + `/salons/{lang}`).
- Admin (`SiteContent.jsx`) : dans l'onglet Salons existant, bloc « Vidéo — L'œil du Moulin ». Composant `VideoField` (upload → `/admin/upload-video`). Champs communs (toggle `salons-video-enabled`, vidéo, poster, Instagram) éditables uniquement en FR (note partagée en EN/ES) ; surtitre/titre/texte traduisibles via `val`/`setField` existants. Une seule vidéo active (remplacement du fichier).
- Public (`Conventions.jsx`) : section `data-testid="salons-video"` APRÈS l'agenda, affichée seulement si `video_enabled && video_url`. Vidéo verticale HTML5 `muted playsInline loop autoPlay preload="metadata"`, montée en lazy via IntersectionObserver (rootMargin 300px, poster/placeholder avant) — aucune librairie, aucun SDK Instagram. Lien « Voir sur Instagram ↗ » (`_blank`) seulement si URL renseignée. `t.conventions.seeInstagram` ajouté FR/EN/ES. Hero/marquee/agenda inchangés.
- Vérifié preview via API+screenshot : upload OK, ON→section visible (props vidéo confirmées), OFF→section absente, URL vide→absente, IG `_blank`. Vidéo de test retirée (contenu propre).

## Credentials
Voir /app/memory/test_credentials.md
