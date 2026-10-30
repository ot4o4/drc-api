# Hébergement de l'API Darou Rahmane Chicken

L'API n'a **aucune dépendance npm** : un fichier `server.js`, Node 20+, et un dossier `data/`.
Trois options, de la plus rapide à la plus durable.

---

## Option A — Railway (sans GitHub, le plus rapide)

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
