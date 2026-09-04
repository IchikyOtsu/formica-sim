# Environnement

Les sources suivent `SPAWN → ACTIVE → DEPLETED → COOLDOWN → RESPAWN`. Apparition,
position, quantité, régénération et expiration utilisent un flux pseudo-aléatoire
dédié. Les saisons modulent nourriture, métabolisme, mouvement, couvain et
danger sans dicter le comportement de la reine.

`HazardSystem` est seul à connaître les zones dangereuses. Les ouvrières ne
perçoivent que le dommage local et ALARM. Le bilan de nourriture inclut stock
initial, nourriture mondiale, génération, consommation, transport, pertes et
expiration.
