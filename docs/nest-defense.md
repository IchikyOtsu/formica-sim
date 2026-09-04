# Défense du nid — V1.4.3

Deuxième ticket de V1.4. Répond à la question posée : **un raid provoque-t-il
une réponse défensive locale cohérente sans script global ?** Portée
strictement limitée à la détection, l'alarme, la mobilisation des soldats et
le relâchement — toujours pas de pillage ni de dégâts de nid (V1.4.4+).

## Détection locale, pas omniscience

`Simulation.detectNestThreats(colony, colonyConfig)` tourne chaque tick pour
chaque colonie (si `combatEnabled && nestDefenseEnabled` et au moins deux
colonies) et vérifie la distance de **toutes les fourmis étrangères vivantes**
à la position du nid — pas seulement les fourmis en raid : une colonie ne sait
pas a priori si une fourmi étrangère proche est une éclaireuse égarée ou un
raid organisé, seule la proximité compte.

```text
raid approche → détection locale (nestDefenseRadius)
  → ALARM déposée près du nid (tant que la menace est présente ou récente)
  → threatPressure ↑ (terme dédié, pondéré séparément des contacts génériques)
  → soldats disponibles → DEFENDING
  → combat éventuel (mécanisme existant, inchangé)
  → menace disparaît → grace period → ALARM s'évapore normalement → relâchement
```

Aucune fourmi de la colonie ne « sait » qu'un raid existe tant qu'une fourmi
étrangère n'est pas passée sous `nestDefenseRadius` ce tick précis — pas de
`if raid exists`.

## Alarme et pression, dans les mécanismes existants

- L'ALARM est déposée avec `AlarmDepositSystem.depositDeath` (le même motif en
  croix que pour une mort de combat) à la position du nid, chaque tick où
  `colony.nestUnderThreat` est vrai. Elle s'évapore ensuite normalement
  (`alarmEvaporationRate`) — pas de mécanique de décroissance dédiée : la
  disparition progressive de l'alarme *est* le relâchement physique de la
  défense.
- `threatPressure` (V1.3) reçoit un terme supplémentaire,
  `newNestContacts * threatPressureNestProximityWeight`, à côté des termes
  existants (contacts génériques, morts, alarme au nid). Une intrusion près du
  nid pèse donc plus lourd qu'un contact générique ailleurs sur la carte, sans
  dupliquer l'accumulateur.
- **Hystérésis** : `nestUnderThreat` reste vrai `nestDefenseGraceTicks` ticks
  après la disparition du dernier intrus détecté, pour éviter du flapping
  ACTIVATED/RELEASED à chaque oscillation à la frontière du rayon.

## États comportementaux et priorité

`DEFENDING` est un nouvel état d'`Ant`, avec la navigation strictement
« vers son propre nid » (réutilise telle quelle la navigation de
`RETURNING_HOME` : suivi de trace HOME + attraction par sa propre ALARM pour
un soldat, déjà existante depuis V1.3) — jamais un ciblage direct de
l'identité du raider à travers la carte.

Priorité appliquée à chaque tick, **uniquement si le nid de la colonie est
réellement sous menace** (`colony.nestUnderThreat`) :

```text
DEFENDING > RAIDING > normal
```

- Un soldat `SEARCHING_FOOD` (patrouille normale) disponible passe en
  `DEFENDING`.
- Un soldat actuellement `RAIDING` est **rappelé** : il sort proprement de la
  comptabilité de son raid (`resolveRaidMemberOutcome(..., "RECALLED")`, qui
  compte comme un retour pour la clôture du raid, sans forcer son état) puis
  passe en `DEFENDING`. Un raid offensif peut donc être interrompu si son
  propre nid est attaqué pendant l'expédition.
- Un soldat déjà mort, déjà `DEFENDING`, ou `RESTING` (en train de se nourrir
  au nid) n'est pas re-mobilisé — on n'interrompt pas un soldat en train de
  se refaire une santé au nid, il est de toute façon déjà sur place.
- Au relâchement, tout soldat `DEFENDING` retourne à `SEARCHING_FOOD` (son
  comportement normal — pour un soldat, patrouille, jamais de collecte).

## Évacuation des ouvrières

Pas de règle dédiée : l'évitement repose entièrement sur le mécanisme ALARM
déjà en place depuis V1.1 (répulsion dans `DirectionScoringSystem`) — booster
l'ALARM au nid menacé suffit en principe à pousser les ouvrières à s'en
écarter, sans code de fuite spécifique.

**Limite constatée en testant** : sur de courtes fenêtres et avec les poids
par défaut, l'effet observé est plus faible et moins net qu'attendu — la
combinaison exploration aléatoire / portée de détection des phéromones /
diffusion progressive de l'ALARM dilue le signal avant qu'il ne domine
clairement le comportement d'une ouvrière proche. Le mécanisme de comptage
(`workersEvacuated`, incrémenté à la fin de l'épisode pour chaque ouvrière vue
dans la zone qui en est ressortie) est implémenté et testé indépendamment de
la fiabilité de la fuite spontanée. Un calibrage plus poussé de
`alarmInfluence` / portée de détection pourrait être nécessaire si on veut une
évacuation nette et rapide — pas fait ici pour rester dans le périmètre du
ticket.

## Non-régression

- Tout le mécanisme est gated par `combatEnabled && nestDefenseEnabled` : les
  deux à `false` reproduit exactement l'absence de la fonctionnalité (aucun
  effet observable, testé explicitement).
- Sans castes (`castesEnabled = false`), la détection/ALARM/threatPressure
  fonctionnent quand même (elles ne dépendent pas des castes), mais
  `defendersMobilized` reste toujours à 0 puisqu'aucun `SOLDIER` n'existe —
  testé explicitement, invariants respectés.
- Invariant ajouté : un `ant.state === DEFENDING` est toujours un `SOLDIER`.
- Replay déterministe vérifié sur un scénario combat + défense.

## Métriques et événements

Par colonie : `nestUnderThreat`, `raidersDetectedNearNest`,
`defenseActivations`, `defendersMobilized`, `defendingNow`, `defensiveKills`
(kills réalisés par un soldat en état `DEFENDING`), `workersEvacuated`,
`nestAlarmIntensity` (jauge instantanée, ALARM normalisée au nid).

Événements : `NEST_THREAT_DETECTED` (par fourmi étrangère nouvellement
détectée dans le rayon), `DEFENSE_ACTIVATED`, `DEFENSE_RELEASED`.

## Ce qui n'existe pas encore

Pillage, `raidCargo`, dégâts de nid, reine vulnérable — inchangé depuis
`docs/raids.md`, toujours prévu pour V1.4.4 et suivants.
