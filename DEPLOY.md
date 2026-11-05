# Hébergement de l'API Darou Rahmane Chicken

> **Déploiement actuel (production)**
> - Dépôt : https://github.com/ot4o4/drc-api (branche `master`)
> - Service Render : **drc-api** — https://drc-api-dj8t.onrender.com
> - Tableau de bord : https://dashboard.render.com/web/srv-dbicoc7lk1mc73fu7g2g
> - Code gérant (`ADMIN_TOKEN`) : à conserver en lieu sûr, il ouvre l'espace gérant
> - ⚠️ Plan **free** : pas de disque persistant → les commandes sont perdues à chaque
>   redéploiement. Pour les conserver : passer le service en plan **Starter** et ajouter
>   un disque de 1 Go monté sur `/opt/render/project/src/data` (aucun changement de code).

L'API n'a **aucune dépendance npm** : un fichier `server.js`, Node 20+, et un dossier `data/`.

---

## Redéployer après une modification

```bash
cd /root/drc-api
git add -A && git commit -m "…"
git push origin master
./deploy.sh                     # sauvegarde → déploiement → restauration
```

`autoDeploy` est inerte tant que l'application GitHub n'est pas installée sur le compte
Render : le `push` seul ne déclenche rien, `deploy.sh` appelle l'API de déploiement.

### `deploy.sh` — zéro perte de données sur le plan free

Le script réveille le service, exporte la base (`GET /api/admin/backup`), déclenche le
déploiement, attend que le build soit `live` sur le bon commit, puis restaure
(`POST /api/admin/restore`). **Si la sauvegarde échoue, le déploiement est annulé.**
Les exports sont conservés dans `/root/backups/`.

À lancer depuis `/root/drc-api`, avec `~/.secrets/render_key` et `~/.secrets/admin_token`.

---

## Option A — Railway (sans GitHub, alternative)

Railway accepte un envoi direct du dossier local (pas besoin de dépôt Git).

```bash
npm install -g @railway/cli
railway login                 # ouvre le navigateur, crée le compte gratuit
cd /root/drc-api
railway init                  # crée le projet
railway variables --set ADMIN_TOKEN=<code_gérant> --set SHOP_PHONE="+221 77 000 00 00"
railway up                    # envoie le dossier et déploie
railway domain                # génère l'URL publique https://xxx.up.railway.app
```

Vérification : `curl https://xxx.up.railway.app/api/health` doit répondre
`{"ok":true,...}`. Puis, dans l'app : **Compte → Espace gérant → Serveur de l'app**,
collez l'URL et enregistrez (aucun rebuild nécessaire).

> Railway offre un crédit d'essai puis un plan à ~5 $/mois. Le dossier `data/`
> n'est **pas** persistant par défaut : ajoutez un volume monté sur `/app/data`
> dans les réglages du service.

---

## Option B — Render (via GitHub)

1. Pousser ce dossier sur un dépôt GitHub (`render.yaml` est déjà prêt).
2. Render → **New → Web Service** → connecter le dépôt.
3. `render.yaml` configure tout : plan free, `node server.js`, disque 1 Go sur `data/`,
   `ADMIN_TOKEN` généré automatiquement.
4. Copier l'URL `https://drc-api.onrender.com` et la saisir dans l'app.

> Le plan gratuit met le service en veille après ~15 min d'inactivité : la première
> requête suivante prend quelques secondes.

---

## Option C — VPS (le plus stable, ~5 €/mois)

```bash
apt install -y nodejs git
git clone <votre-dépôt> /opt/drc-api && cd /opt/drc-api
PORT=8080 ADMIN_TOKEN=<code_gérant> node server.js
```

Service systemd (`/etc/systemd/system/drc-api.service`) :

```ini
[Unit]
Description=DRC API
After=network.target

[Service]
WorkingDirectory=/opt/drc-api
Environment=PORT=8080
Environment=ADMIN_TOKEN=changez-moi
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Puis `systemctl enable --now drc-api`, et un reverse proxy Caddy/Nginx pour le HTTPS.

### Variante Docker

```bash
docker build -t drc-api .
docker run -d --name drc-api -p 8080:8080 \
  -e ADMIN_TOKEN=changez-moi \
  -v drc-data:/app/data \
  drc-api
```

---

## Après le déploiement — la seule étape côté app

Dans l'application : **Compte → Espace gérant → « Serveur de l'app »**,
collez l'URL publique (`https://...`), **Enregistrer l'URL du serveur**.
L'app se recharge et passe en 🟢 **En ligne**.

Le code saisi juste au-dessus est le `ADMIN_TOKEN` du serveur : c'est lui qui ouvre
l'espace gérant (commandes, statuts, produits).

---

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `PORT` | port HTTP (défaut 8080) |
| `ADMIN_TOKEN` | **code gérant** ; sans lui, `changeme` (à changer absolument) |
| `SHOP_PHONE` | numéro affiché dans les instructions de paiement |
| `WAVE_API_TOKEN` | active Wave Checkout (voir PAYMENTS.md) |
| `WAVE_WEBHOOK_SECRET` | vérifie la signature des webhooks Wave |
| `ORANGE_MERCHANT_KEY`, `ORANGE_MERCHANT_TOKEN` | activent Orange Money |

---

## Sauvegarde des données

Tout est dans `data/db.json` (produits, commandes, comptes).

```bash
cp data/db.json data/db-$(date +%F).json
```

À faire avant chaque redéploiement qui remplace le volume.

---

## Déploiement automatique (GitHub → Render)

Un job Hermes vérifie toutes les 5 minutes la tête de `ot4o4/drc-api` (branche
`master`). Dès qu'un nouveau commit apparaît, il :

1. sauvegarde la base (`GET /api/admin/backup`) — le déploiement est annulé si
   la sauvegarde échoue ;
2. déclenche le déploiement Render et attend que le commit déployé soit bien
   celui de GitHub ;
3. restaure la base, puis vérifie `/api/health` et `/api/admin/stats`.

Script : `~/.hermes/scripts/drc_autodeploy.py` (état dans
`~/.hermes/cache/drc-deploy-state.json`, journal dans `drc-deploy.log`).
Il surveille aussi `ot4o4/drc-web` et redéploie le site de la même façon.

> GitHub Actions n'est pas utilisé : le jeton GitHub du poste n'a pas le scope
> `workflow`, nécessaire pour pousser un fichier `.github/workflows/*`. Les
> workflows équivalents sont conservés dans `/root/ci-workflows/` ; il suffit
> d'un jeton avec le scope `workflow` pour les activer.

## Sécurité

- **Limites de débit** (fenêtre glissante en mémoire) : 300 req/min/IP au
  global, 15/min pour créer une commande, 10/10 min pour se connecter,
  6/10 min pour créer un compte (et 6/10 min par numéro de téléphone),
  120/10 min sur l'administration.
- **Administration** : comparaison du jeton à temps constant ; 8 échecs →
  blocage de l'IP pendant 30 minutes ; le service refuse de démarrer en
  production si `ADMIN_TOKEN` est absent ou vaut `changeme`.
- **Données personnelles** : `GET /api/orders?phone=` et
  `GET /api/orders/:id` renvoient l'historique sans nom, adresse ni note
  (téléphone masqué) ; seuls le propriétaire authentifié et le gérant voient
  la commande complète.
- **Webhooks de paiement** : refusés en 503 tant qu'aucun secret n'est
  configuré (`WAVE_WEBHOOK_SECRET`, `ORANGE_WEBHOOK_SECRET`), signature
  vérifiée à temps constant. Impossible de marquer une commande payée sans
  signature valide.
- **Google** : le mode « démo » qui permettait de se connecter sans mot de
  passe a été supprimé. La connexion Google n'apparaît que si
  `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont fournis.
- **Mots de passe** : scrypt avec sel aléatoire ; jetons HMAC signés,
  expiration 30 jours.
- **En-têtes** : `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, CSP `default-src 'none'`, HSTS, `Cache-Control:
  no-store` sur toutes les réponses de l'API.

