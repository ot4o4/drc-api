#!/usr/bin/env python3
"""Vérification en production du parcours client → gérant → livreur → client, puis restauration.
Sauvegarde d'abord ; la commande de test est effacée par la restauration finale."""
import json, os, time, urllib.request, urllib.error, pathlib

API = 'https://drc-api-dj8t.onrender.com'
ADM = pathlib.Path('~/.secrets/admin_token').expanduser().read_text().strip()
DRV = pathlib.Path('~/.secrets/driver_code').expanduser().read_text().strip()
BKDIR = pathlib.Path('~/backups/drc').expanduser(); BKDIR.mkdir(parents=True, exist_ok=True)

def call(method, path, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={'Content-Type': 'application/json', **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

A = {'X-Admin-Token': ADM}; D = {'X-Admin-Token': DRV}
st, backup = call('GET', '/api/admin/backup', headers=A)
assert st == 200 and 'db' in backup, st
bk = BKDIR / time.strftime('drc-db-%Y%m%d-%H%M%S-avant-test-prod.json')
bk.write_text(json.dumps(backup)); os.chmod(bk, 0o600)
print('sauvegarde', backup['counts'], '→', bk.name)
results = []
def check(name, cond, detail=''):
    results.append(cond); print(('✔ ' if cond else '✖ ') + name + (f' — {detail}' if detail else ''))
try:
    st, r = call('POST', '/api/orders', {
        'customer': {'name': 'TEST Hermes (à ignorer)', 'phone': '+221 70 000 00 00', 'zone': 'Parcelles Assainies',
                     'address': 'Test de recette — Unité 20', 'lat': 14.7576, 'lng': -17.4452},
        'items': [{'id': 1, 'qty': 1}], 'payment_method': 'cod', 'client_order_id': 'hermes-recette-%d' % time.time()})
    o = r['order']; oid, tok = o['id'], o['customer_token']
    check('commande créée', st == 201, f"{oid} · {o['total']} F")
    st, r = call('PATCH', f'/api/admin/orders/{oid}', {'driver_id': 'driver-1', 'status': 'preparing'}, A)
    check('gérant : livreur attribué + en préparation', st == 200 and r['order']['driver']['id'] == 'driver-1')
    st, r = call('POST', f'/api/orders/{oid}/messages', {'text': 'Commande en préparation (test).'}, {**A, 'X-Message-Role': 'admin'})
    check('gérant : message envoyé', st == 201)
    st, r = call('GET', '/api/driver/orders', headers=D)
    mine = [x for x in r.get('orders', []) if x['id'] == oid]
    check('livreur : mission visible avec son code', st == 200 and len(mine) == 1, r.get('driver', {}).get('name', ''))
    check('livreur : adresse et GPS reçus', bool(mine and mine[0]['customer'].get('address') and mine[0]['customer'].get('lat')))
    st, r = call('POST', f'/api/orders/{oid}/messages', {'text': "J'arrive (test)."}, {**D, 'X-Message-Role': 'driver'})
    check('livreur : message envoyé', st == 201)
    for nxt in ('shipping', 'delivered'):
        st, r = call('PATCH', f'/api/driver/orders/{oid}', {'status': nxt}, D)
        check(f'livreur : statut {nxt}', st == 200 and r['order']['status'] == nxt)
    for _ in range(12):
        st, r = call('GET', '/api/admin/stats', headers=A)
        if st == 200: break
        time.sleep(1)
    check('gérant : toujours connecté après les appels du livreur', st == 200)
    st, r = call('GET', f'/api/orders/{oid}', headers={'X-Order-Token': tok})
    check('client : statut livré + livreur', st == 200 and r['order']['status'] == 'delivered' and r['order']['driver']['name'] == 'Livreur DRC',
          r['order'].get('payment_status'))
    st, msgs = call('GET', f'/api/orders/{oid}/messages', headers={'X-Order-Token': tok})
    check('client : messages gérant + livreur', st == 200 and [m['sender_role'] for m in msgs] == ['admin', 'driver'])
    st, pub = call('GET', f'/api/orders/{oid}')
    check('public : ni adresse ni GPS', 'address' not in pub['order']['customer'] and 'lat' not in pub['order']['customer'])
finally:
    st, r = call('POST', '/api/admin/restore', backup, A)
    print('restauration', st, r.get('counts'))
    st, s = call('GET', '/api/admin/stats', headers=A)
    print('état final : commandes', s.get('total_orders'), '· clients', s.get('users'), '· livreurs', s.get('drivers'))
print(f"\n{sum(results)}/{len(results)} vérifications OK")
