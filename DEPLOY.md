# Hébergement permanent — Render (gratuit)

1. Créer un compte gratuit : https://render.com (« Get Started for Free »).
2. New → **Web Service** → connecter un dépôt GitHub contenant ce dossier
   (pousser `/root/drc-api` sur GitHub) — Render lit `render.yaml` automatiquement.
3. Service `drc-api`, plan **free**, commande `node server.js` — disque 1 GB pour `data/`
   (les commandes et comptes persistent).
4. Variables d'environnement : ADMIN_TOKEN générée ; ajouter les clés paiements
   quand elles arrivent (voir PAYMENTS.md).
5. URL finale : `https://drc-api.onrender.com` → la mettre comme base API de l'app
   et rebuild l'APK.

Alternatives : Railway (crédit offert), Fly.io, Koyeb — même principe.

En attendant : le serveur local + tunnel Cloudflare fonctionnent.
