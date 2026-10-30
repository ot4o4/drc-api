#!/usr/bin/env bash
# Déploie sur Render en préservant les données (sauvegarde → deploy → restauration).
#   ./deploy.sh            (depuis /root/drc-api, après git commit + push)
set -euo pipefail

SVC="${SVC:-srv-dbicoc7lk1mc73fu7g2g}"
URL="${URL:-https://drc-api-dj8t.onrender.com}"
RKEY="$(cat /root/.secrets/render_key)"
ADM="$(cat /root/.secrets/admin_token)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BK="/root/backups/drc-db-$STAMP.json"
mkdir -p /root/backups

echo "→ 1/5 sauvegarde des données en production"
if curl -sf -m 30 -H "X-Admin-Token: $ADM" "$URL/api/admin/backup" -o "$BK"; then
  python3 -c "import json;d=json.load(open('$BK'));print('   ', d['counts'])"
else
  echo "   ⚠️ pas de sauvegarde (service endormi ?) — on continue"
  rm -f "$BK"
fi

echo "→ 2/5 déclenchement du déploiement"
curl -sf -m 30 -X POST "https://api.render.com/v1/services/$SVC/deploys" \
  -H "Authorization: Bearer $RKEY" -H "Content-Type: application/json" \
  -d '{"clearCache":"do_not_clear"}' >/dev/null

echo "→ 3/5 attente du nouveau build"
HEAD_SHORT="$(git rev-parse --short HEAD)"
for i in $(seq 1 60); do
  read -r STATUS COMMIT < <(curl -s -H "Authorization: Bearer $RKEY" \
    "https://api.render.com/v1/services/$SVC/deploys?limit=1" |
    python3 -c "import json,sys;x=json.load(sys.stdin)[0]['deploy'];print(x['status'],(x.get('commit') or {}).get('id','')[:7])")
  echo "   $STATUS $COMMIT"
  if [ "$STATUS" = "live" ] && [ "$COMMIT" = "$HEAD_SHORT" ]; then break; fi
  sleep 10
done

echo "→ 4/5 attente HTTP"
for i in $(seq 1 30); do
  if curl -sf -m 15 "$URL/api/health" >/dev/null; then echo "   en ligne"; break; fi
  sleep 5
done

echo "→ 5/5 restauration des données"
if [ -f "$BK" ]; then
  curl -sf -m 30 -X POST "$URL/api/admin/restore" -H "X-Admin-Token: $ADM" \
    -H "Content-Type: application/json" --data-binary @"$BK" |
    python3 -c "import json,sys;print('   restauré :', json.load(sys.stdin)['counts'])"
else
  echo "   rien à restaurer"
fi

echo "✅ $URL  ($(git rev-parse --short HEAD))"
