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

## Benchmark (10 seeds × 10 000 ticks, résultat final)

```bash
npm run experiment -- castes --seeds=10 --ticks=10000
npm run experiment -- castes --seeds=10 --ticks=10000 --profile=adaptive
```

Quatre profils pour la colonie A (posture défensive de base), tous testés
contre le même agresseur figé (profil `Agressif` de Balanced Combat V1.2).
Le rythme de ponte par défaut (1 œuf/1500 ticks) ne laisse que ~6 naissances
sur 10 000 ticks — bien trop peu pour que 4 politiques divergent — donc le
script accélère `queenLayingCooldownTicks` à 300 pour ce benchmark.

| Profil | Soldats vivants | Coût militaire | Kills | Pertes totales | Stock final |
|---|---|---|---|---|---|
| A — Workers only (`castesEnabled: false`) | 0 | 0 | 3,7 | 22,8 | 432,6 |
| C — Adaptatif (`threatPressureRatioScale: 150`, plafond 0,35) | 2,5 | 48,9 | 13,4 | 28,4 | 386,8 |
| B — ~10-15% quasi fixe (`threatPressureRatioScale: 1`, plafond 0,125) | 4,5 | 85,9 | 17,7 | 33,1 | 364,5 |
| D — Surmilitarisé (plafond 0,7, stock requis 5, échelle 5) | 9,4 | 119,1 | 23,4 | 33,4 | 330,6 |

Gradient net et monotone A→C→B→D sur soldats produits, coût militaire, kills
et dégradation du stock — sans proportion codée en dur, seulement les
paramètres de la règle économique.

**Résultat non trivial** (non recherché à l'avance) : la surmilitarisation
(D) ne réduit pas les pertes totales (33,4, pire que B et bien pire qu'A) —
plus de soldats intensifie le combat des deux côtés sans mieux protéger la
colonie. Son seul vrai bénéfice est offensif (kills, territoire), pas
défensif. En efficacité militaire (kills / coût militaire), le classement
s'inverse : C = 0,274, B = 0,206, D = 0,197 — l'allocation adaptative est la
plus rentable des trois, pas la plus dépensière.

## Dynamique temporelle : le décalage menace → soldats

Un benchmark final ne montre que l'état stationnaire. La promesse de
l'allocation adaptative est comportementale : peu de soldats au calme,
davantage sous pression réelle, ralentissement quand elle retombe — sans
règle du type « si tick > X alors soldats ». Vérifié avec
`scripts/castes-timeline.js` : un scénario à trois phases (calme / pression
soutenue / retour au calme) où une colonie B agressive est physiquement
maintenue (« laisse ») loin du nid de A pendant le calme, puis contre son nid
pendant la phase de pression — tout le reste (contacts, `threatPressure`,
`decideCaste`, ponte, développement, émergence) reste le moteur normal.

```text
calme (0–500)         : threatPressure = 0, soldierCount = 0 en continu
pression (500–2000)   : threatPressure explose (jusqu'à ~96), décroît par à-coups
  → soldierCount reste à 0 jusqu'à ~tick 650 (décalage ≈ durée œuf+larve+nymphe)
  → puis monte 0→9 entre les ticks 650 et 1000, où il se stabilise
retour au calme (2000+): threatPressure retombe à 0, soldierCount plafonne à 9
  (aucune nouvelle production) pendant que workerCount continue de croître
  (85→108 sur 1000 ticks) — la part de soldats se dilue démographiquement
```

Le décalage observé (~150 ticks avec `eggDurationTicks:30,
larvaDurationTicks:40, pupaDurationTicks:30`) correspond à l'ordre de
grandeur du cycle de couvain, pas à un artefact de seuillage. Testé en
version compressée et déterministe dans la suite (`soldier production lags a
real threat spike and tapers off via demographic dilution once it fades`) :
0 soldat pendant tout le calme, 0 soldat encore 100 ticks après le début de
la pression (décalage), puis apparition, puis plafond et dilution
(`soldierRatio` strictement décroissant) pendant le retour au calme.

V1.3 est considérée aboutie : la colonie finit avec peu de soldats en
période calme et davantage sous pression, la production ralentit puis
s'arrête quand la pression retombe, et la part d'ouvrières remonte par
renouvellement démographique — le tout sans qu'aucune proportion ni aucune
condition sur le numéro de tick ne soit codée en dur dans le moteur.
