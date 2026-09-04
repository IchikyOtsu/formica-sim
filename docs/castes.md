# Castes et soldats (V1.3)

V1.3 ajoute une seconde caste, `SOLDIER`, à côté de `WORKER`. Les deux
partagent le même moteur de comportement (état, mouvement, métabolisme,
combat) ; seuls quelques points divergent, tous gatés par `caste`. Quand
`castesEnabled = false` (défaut), aucun `SOLDIER` n'est jamais produit et le
moteur reproduit exactement V1.2.

## Ce qui distingue un soldat

- **Stats** : `soldierMaxHealth`, `soldierAttackPower` (plus haut),
  `soldierEnergyConsumptionMultiplier`, `soldierBasalEnergyMultiplier` (upkeep
  plus cher), `soldierSpeedMultiplier` (plus lent).
- **Ne collecte jamais** : en état `SEARCHING_FOOD`, un soldat ne cherche
  jamais de source (`food = null`), donc n'acquiert jamais de `target` et ne
  dépose jamais de `FOOD`. Aucune caste dédiée à l'inaction : le soldat garde
  la même machine à états que l'ouvrière (rentre au nid quand l'énergie
  baisse, etc.), il ne fait simplement jamais l'étape « chercher/collecter ».
- **Navigation inversée** : une ouvrière est repoussée par l'`ALARM` et le
  `TERRITORY` étranger (`DirectionScoringSystem`, poids positif = répulsion).
  Un soldat utilise le même mécanisme avec un poids négatif
  (`soldierAlarmRallyWeight`, `soldierTerritoryInterceptWeight`) : il est
  **attiré** par l'alarme de sa propre colonie (rallie la perturbation) et par
  le territoire étranger (patrouille vers les intruses), sans toucher au code
  de répulsion existant.
- **Combat plus agressif** : `soldierCombatAttackThreshold`,
  `soldierCombatThreatenThreshold`, `soldierEncounterAvoidanceThreshold` et
  `soldierCombatFleeHealthRatio` remplacent les seuils `combat*`/
  `encounterAvoidanceThreshold` habituels (qui restent ceux des ouvrières,
  inchangés). Une ouvrière typique (santé/énergie pleines, sans avantage
  numérique ni territorial) atteint une agression ≈ 0.6 — sous le seuil
  d'attaque par défaut (0.65) : elle n'attaque presque jamais spontanément.
  Le seuil soldat par défaut (0.2) rend la même situation systématiquement
  une `ATTACK`.

## Production — règle économique, pas une proportion codée

À chaque ponte, `BroodSystem.decideCaste(colony, config)` calcule :

```text
desiredRatio = min(casteSoldierRatioCap, max(0, threatPressure / threatPressureRatioScale))
wantsSoldier = foodStock >= casteStockThreshold AND soldierRatio(vivantes) < desiredRatio
```

`threatPressure` est un accumulateur par colonie, mis à jour chaque tick
(`Simulation.updateThreatPressure`, seulement si `castesEnabled`) :

```text
threatPressure = threatPressure * threatPressureDecay
  + (nouveaux contacts étrangers ce tick) * threatPressureContactWeight
  + (nouvelles morts de combat ce tick)   * threatPressureDeathWeight
  + (ALARM propre au nid, normalisée)     * threatPressureAlarmWeight
```

« Nouveaux » signifie ce tick précisément (pas le cumul) — sinon la pression
ne redescendrait jamais. Un œuf décidé `SOLDIER` coûte
`eggFoodCost * soldierEggFoodMultiplier` à la ponte, puis
`larvaFoodPerTick * soldierLarvaFoodMultiplier` à chaque tick larvaire ; ce
surcoût est cumulé séparément dans `BroodSystem.militaryFoodConsumed`
(exposé en métrique `militaryFoodCost`).

## Métriques

Par colonie : `soldierCount`, `workerCount` (vivantes, dérivées de
`colony.ants`), `soldierBirths`, `threatPressure`, `militaryFoodCost`,
`workerKills`/`soldierKills`/`workerLosses`/`soldierLosses` (ventilation par
caste de `kills`/`combatLosses`, déjà existants).

## Non-régression

`castesEnabled = false` : `decideCaste` retourne toujours `WORKER`, donc
aucun ant n'a jamais `caste !== WORKER`, donc aucune des branches
soldat-spécifiques (navigation inversée, seuils dédiés, `food = null`,
multiplicateurs) ne s'active jamais. Testé explicitement
(`castesEnabled = false never produces a SOLDIER even under reproduction and
combat`, 300 ticks, reproduction et combat actifs).

Un test dédié couvre aussi une correction indépendante des castes trouvée en
chemin : une mort de combat ne remettait pas `ant.target` à `null` (contrairement
aux morts par faim/environnement), violant l'invariant `dead-worker-inert` dès
qu'une fourmi mourait au combat en poursuivant une source de nourriture.
Corrigé dans `handleDeath`, couvre toutes les causes de mort.

## Benchmark

```bash
npm run experiment -- castes --seeds=10 --ticks=10000
npm run experiment -- castes --seeds=10 --ticks=10000 --profile=adaptive
```

Quatre profils pour la colonie A (posture défensive de base), tous testés
contre le même agresseur figé (profil `Agressif` de Balanced Combat V1.2) :

- **A — Workers only** (`castesEnabled: false`) : référence sans castes.
- **B — 10-15% soldiers** : `threatPressureRatioScale` très bas (le ratio
  cible sature quasi immédiatement à `casteSoldierRatioCap = 0.125`) —
  proportion quasi fixe, pas une allocation réactive.
- **C — Allocation adaptative** : `threatPressureRatioScale` réaliste
  (150), plafond plus large (0.35) — la proportion suit la pression réelle.
- **D — Surmilitarisation** : plafond haut (0.7), seuil de stock bas (5),
  échelle de pression basse (5) — produit des soldats dès que possible,
  sans discernement.

Résultat attendu (à confirmer par le run) : D protège mais ruine l'économie
(`militaryFoodCost` élevé, `collected`/`foodStock` dégradés) ; C offre le
meilleur compromis survie/économie ; A reste la meilleure économie mais la
plus vulnérable. V1.3 sera considérée aboutie si une colonie peut finir avec
peu de soldats en période calme et davantage sous pression, sans qu'aucune
proportion ne soit codée en dur — ce que `decideCaste` garantit par
construction (la seule constante fixe est le plafond, jamais la cible).
