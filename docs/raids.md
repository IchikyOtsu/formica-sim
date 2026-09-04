# Raids — V1.4.1 : découverte d'un nid ennemi et RaidSystem minimal

Premier ticket de V1.4 ("Raids, pillage et attaque de nid"). Portée
volontairement restreinte, conformément au découpage validé :
**découverte d'un nid ennemi, mémoire par colonie, formation d'un petit
groupe de soldats, aller-retour vers le nid connu.** Explicitement hors
scope ici : pillage, dégâts de nid, reine vulnérable (V1.4.4 et suivants).

## Découverte et mémoire

Aucune colonie ne connaît un nid adverse par défaut. Chaque tick,
`Simulation.detectEnemyNests(colony, colonyConfig)` vérifie, pour chaque
fourmi vivante de la colonie, si elle se trouve à moins de
`nestDiscoveryRadius` d'un nid étranger. Si oui, la fourmi mémorise
l'information sur elle-même :

```js
ant.pendingNestIntel = { colonyId, position, tick };
```

**L'information n'est exploitable par la colonie qu'une fois la fourmi
rentrée physiquement au nid** — `Simulation.deliverNestIntel` n'est
appelée que lorsque `homeDetection.isInside(ant, colony.nest)` devient
vraie, quel que soit l'état de la fourmi (retour classique, recherche de
nourriture qui repasse par le nid, etc.). Ce n'est qu'à ce moment que :

```js
colony.knownEnemyNests.set(targetColonyId, { position, discoveredTick, lastSeenTick });
```

et que l'événement `ENEMY_NEST_DISCOVERED` est émis (une seule fois, à la
première découverte réelle ; les passages suivants ne font que rafraîchir
`lastSeenTick`/`position` sans ré-émettre l'événement). Une fourmi qui
aperçoit un nid ennemi puis meurt en chemin ne rapporte jamais rien — il
n'y a pas de omniscience de la colonie.

## RaidSystem

`src/systems/RaidSystem.js` + `src/entities/Raid.js`. Un raid a un cycle de
vie strict :

```text
TRAVELLING → RETURNING → COMPLETE / FAILED
```

- `Simulation.requestRaid(sourceColonyId, targetColonyId, groupSize)` :
  refuse (`null`) si `targetColonyId` n'est pas dans
  `colony.knownEnemyNests`, ou si aucun soldat n'est disponible
  (`caste === SOLDIER`, vivant, `raidId === null`). C'est la garantie
  demandée : **aucune action offensive contre un nid jamais découvert.**
  Pas de politique de déclenchement automatique dans ce ticket — c'est une
  API explicite, appelée par les tests ou par une future couche de
  décision (V1.4.9, presets).
- Les raiders sélectionnés passent en `ant.state = RAIDING` et naviguent
  en ligne directe vers la position mémorisée (`colony.knownEnemyNests`),
  pas vers la position réelle du nid ennemi — c'est exactement
  l'information dont dispose la colonie, ni plus ni moins. Le déplacement
  reste borné par `ant.speed` comme toute fourmi ; aucune téléportation.
- À portée d'arrivée (`raidArrivalRadius`), le raid passe en `RETURNING`
  et le raider repasse en `RETURNING_HOME` : le trajet retour réutilise
  **tel quel** tout le mécanisme existant (pheromones HOME, alimentation
  au nid, etc.). Aucune duplication de logique de navigation.
- Un raider qui meurt en chemin (combat normal, toujours actif si
  `combatEnabled`) est retiré du raid via le même point de sortie que
  toute mort (`Simulation.handleDeath`). Le raid se termine
  (`COMPLETE` si au moins un survivant est rentré, `FAILED` si tous sont
  morts) dès que chaque membre initial est comptabilisé (rentré ou mort).

## Non-régression

- `RAIDING` est un nouvel état ; aucune fourmi n'y entre jamais sans un
  appel explicite à `requestRaid`. Un run sans castes ni raid demandé est
  donc rigoureusement identique à avant (`raiding requires the SOLDIER
  caste and is invisible when castesEnabled stays false`).
- Un raider ne collecte jamais de nourriture et se comporte normalement
  (recherche de nourriture) dès son retour au nid.
- Invariants ajoutés : un raider est toujours un `SOLDIER`
  (`raider-must-be-soldier`), une fourmi morte n'a jamais de `raidId`
  résiduel (`dead-worker-inert` étendu), une position de nid mémorisée
  reste un nombre fini et jamais celle de sa propre colonie.

## Métriques et événements

Par colonie : `enemyNestsDiscovered`, `knownEnemyNests`, `raidsStarted`,
`raidsCompleted`, `raidsFailed`, `raidersSent`, `raidersLost`,
`activeRaiders`.

Événements : `ENEMY_NEST_DISCOVERED`, `RAID_CREATED`, `RAID_DEPARTED`,
`RAID_REACHED_TARGET`, `RAID_RETURNED` (porte `outcome: COMPLETE|FAILED`).

## V1.4.4 — Pillage et retour du butin

Une fois un raid arrivé (`RAIDING` → `RETURNING`), le raider tente un vol
unique et borné avant de rentrer :

```text
RAIDING → atteint le nid ennemi → vole min(raidCarryCapacity, stockAdverse)
  → raidCargo = X → RETURNING → atteint son nid → stock propre += X → raidCargo = 0
```

- **Champs minimaux sur `Ant`** : `raidCarryCapacity` (fixé à la naissance
  depuis `colonyConfig.raidCarryCapacity`) et `raidCargo` (0 par défaut).
  Volontairement séparé de `carryingFood`/`carryingFoodAmount` (transport
  normal) pour ne jamais mélanger les deux dans les métriques ou les
  invariants.
- **Prélèvement atomique** : `Colony.takeStock(amount)` décrémente le
  `foodStock` adverse de `min(amount, foodStock)` — jamais négatif, jamais
  plus que disponible. Comme le moteur traite les fourmis séquentiellement
  (jamais en parallèle), deux raiders arrivant au même tick se partagent le
  stock restant sans jamais le dépasser ni le compter en double.
- **Un seul vol par sortie** : `attemptPillage` refuse tout appel si
  `ant.raidCargo > 0` — le vol n'est de toute façon déclenché qu'une fois,
  exactement à l'instant où le raider franchit `raidArrivalRadius`
  (transition `TRAVELLING → RETURNING`), mais le garde-fou est explicite et
  testé, pas seulement un effet de bord de l'ordre d'appel.
- **Le stock allié n'augmente qu'au retour effectif** : le butin transite
  intégralement sur `ant.raidCargo` pendant tout le trajet retour ; il n'est
  crédité au `foodStock` de la colonie que lorsque le raider est
  effectivement rentré (`homeDetection.isInside`), via `depositLoot`.
- **Mort en transit → butin au sol** : `handleDeath` appelle `dropLoot`, qui
  crée une `FoodSource` ordinaire (récupérable par n'importe quelle colonie,
  la sienne ou l'ennemie) à la position de la mort, pour un montant exact.
- **Conservation stricte** : aucune création ni destruction implicite —
  `ant.raidCargo` a été ajouté au calcul de conservation globale
  (`Invariants.js`) au même titre que `carryingFoodAmount`. Le vol déplace
  la masse de `foodStock` adverse vers `raidCargo` ; le dépôt la déplace de
  `raidCargo` vers `foodStock` propre ; la chute la déplace de `raidCargo`
  vers une nouvelle `FoodSource`. Jamais de nourriture qui apparaît ou
  disparaît. Testé sur 2000 ticks combinant combat, défense et pillage.
- **`pillageEnabled = false`** reproduit exactement le comportement V1.4.3 :
  les raids partent, combattent, arrivent et rentrent normalement, mais ne
  volent jamais rien (`raidCargo` reste toujours à 0).

### Métriques et événements

Par colonie : `foodStolen`, `foodRecovered` (net, une fois rentré),
`foodDropped` (perdu en transit), `foodLostToRaids` (côté victime),
`raidersReturnedWithLoot`, `raidersKilledWithLoot`, `raidCargoInTransit`
(jauge instantanée).

Événements : `FOOD_STOLEN`, `RAIDER_RETURNED_WITH_LOOT`, `RAID_LOOT_DROPPED`.

### Mini-benchmark — le pillage a-t-il une vraie valeur économique ?

`node scripts/pillage-benchmark.js --seeds=10 --ticks=8000` — même colonie
attaquante (12 soldats pré-formés, raids scriptés toutes les 400 ticks vers
un nid ennemi déjà connu, `directHomeNavigation: true` pour un retour
fiable), seule différence entre les deux runs : `pillageEnabled`.

| | Sans pillage | Pillage actif |
|---|---|---|
| Stock final colonie A (moyenne) | 123,18 | 597,73 |
| Nourriture volée | 0 | 492,51 |
| Nourriture rapportée | 0 | 470,51 |
| Butin perdu au sol | 0 | 18,00 |
| Raiders perdus (total) | 4,50 | 4,70 |
| Population A restante | 52,10 | 51,90 |

**Écart attribuable au pillage : +474,55 (+385 %) sur le stock final**, pour
un coût en pertes de raiders quasiment identique (4,5 vs 4,7 — le pillage
n'augmente pas le risque de mort du raider, il change seulement ce qu'il
ramène). Le pillage a donc une valeur économique nette et massive dans ce
scénario, sans dégrader la survie de la colonie attaquante — la question
de savoir si un pillage systématique est *rentable en toutes circonstances*
(coût de préparation, opportunité perdue de collecte normale, etc.) reste
celle de la V1.4.5 (Économie du raid) et du raidROI.

## V1.4.4b — Déclenchement automatique (`RaidDecisionSystem`)

Sans mécanisme de décision, un raid ne part jamais tout seul —
`requestRaid` reste une primitive pure. `RaidDecisionSystem` ajoute
uniquement le **quand**, jamais le **comment** (toujours `RaidSystem`) :

```text
chaque raidEvaluationIntervalTicks
  → stock propre >= minStockToRaid ?
  → cooldown écoulé (nextRaidEligibleTick) ?
  → un nid ennemi connu, sans raid déjà actif vers cette cible ?
  → assez de soldats réellement disponibles (SEARCHING_FOOD, ni RAIDING,
    ni DEFENDING, ni mort) >= minRaidSize ?
→ requestRaid(colonyId, target, min(maxRaidSize, disponibles))
```

Entièrement déterministe : aucun `Math.random()`, seulement l'état déjà
présent dans le moteur — seed identique ⇒ mêmes raids aux mêmes ticks
(testé explicitement). `autoRaidEnabled = false` (défaut) reproduit
exactement le comportement V1.4.4 : aucun raid ne se déclenche jamais tout
seul.

Une colonie ne cible jamais deux fois la même cible en simultané (un raid
actif vers B bloque un second lancement tant que le premier n'est pas
résolu), et ne mobilise jamais un soldat déjà en `DEFENDING` ou `RAIDING` —
la défense du nid reste strictement prioritaire (héritage direct de
V1.4.3).

## Ce qui n'existe pas encore (prochains tickets)

- Pas de dégâts de nid, pas de `nest.integrity` (V1.4.6).
- Pas de reine vulnérable (V1.4.7).
- Pas de politique de posture par profil (Isolationniste / Opportuniste /
  Équilibré / Expansionniste) — `RaidDecisionSystem` est une politique
  unique et simple, pas encore paramétrable par profil de colonie (V1.4.9).
- Pas de bouton manuel "Lancer un raid" dans le panneau web — le nouveau
  scénario "Version complète V1.4" s'appuie entièrement sur la découverte
  organique + le déclenchement automatique pour rester vivant sans
  intervention.
