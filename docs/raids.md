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

## Ce qui n'existe pas encore (prochains tickets)

- Pas de vol de nourriture, pas de `raidCargo` (V1.4.4).
- Pas de dégâts de nid, pas de `nest.integrity` (V1.4.6).
- Pas de reine vulnérable (V1.4.7).
- Pas de politique de déclenchement automatique des raids ni de presets
  de posture (V1.4.9) — `requestRaid` est une primitive, pas une IA.
- Pas d'intégration UI (pas de bouton pour déclencher un raid depuis le
  panneau web) — volontairement laissé pour une fois le système validé.
