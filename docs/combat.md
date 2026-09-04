# Combat local (V1.2)

V1.2 ajoute, par-dessus la territorialité descriptive de V1.1, une phéromone
`TERRITORY` déposée en continu (plus forte près du nid, dégressive avec la
distance), une réaction de rencontre `IGNORE / AVOID / THREATEN / ATTACK`, et
un combat local, discret et résolu en deux phases : collecte des intentions
d'attaque, puis application des dégâts. Deux ennemies qui s'attaquent
mutuellement le même tick se blessent toutes les deux, même si l'une meurt —
l'ordre de traitement ne favorise jamais un côté.

`Ant` gagne quatre champs et rien de plus : `health`, `maxHealth`,
`attackPower`, `combatCooldown`. Les dégâts (`attackPower * randomFactor`,
`randomFactor` issu du hash déterministe seed/tick/ids déjà utilisé pour les
dangers) sont reproductibles à seed/config/tick identiques. Une mort de combat
est taguée `cause: "COMBAT"`, distincte de `STARVATION`/`ENVIRONMENT`, et
dépose une `ALARM` dédiée (`combatDeathAlarmStrength`).

`combat.enabled = false` désactive intégralement cette couche : aucune
`stance` n'est jamais évaluée, `health` ne bouge jamais, aucun événement
`FOREIGN_THREAT`/`COMBAT_*` n'est émis. Le comportement redevient exactement
celui de l'étape 1 (reconnaissance + `TERRITORY` + `AVOID` sur premier
contact), garanti par un test dédié.

## Décision de rencontre

`EncounterReactionSystem` distingue deux évaluations :

- `evaluate(ant, threshold)` — réflexe au premier contact (nouveau, pas
  répété tant que la paire reste proche) : `IGNORE` ou `AVOID`, basé sur
  l'énergie et le nombre d'étrangères proches.
- `evaluateStance(ant, context)` — réévaluée chaque tick tant qu'une paire
  reste à portée de combat (`combatRadius`, plus petit que le rayon de
  reconnaissance) : `IGNORE / AVOID / THREATEN / ATTACK`, basé sur la santé,
  l'énergie, le nombre d'alliées proches, le nombre d'ennemies proches et
  l'avantage territorial local (`TERRITORY` propre moins `TERRITORY`
  étrangère à la position de la fourmi). Une fourmi sous
  `combatFleeHealthRatio` ou sous `lowEnergyThreshold` fuit toujours,
  indépendamment du reste.

Aucun calcul de victoire optimale : la décision ne compare jamais les stats
de l'adversaire précis, seulement des agrégats locaux. Une fourmi peut donc
attaquer à son désavantage.

`THREATEN` ne retire jamais de HP : la fourmi s'oriente vers l'adversaire,
dépose un peu d'`ALARM`/`TERRITORY`, et l'événement `FOREIGN_THREAT` est émis
— sans jamais journaliser un calcul de score.

## Profils figés — Balanced Combat V1.2

Trois profils partagent les mêmes statistiques brutes (`health`,
`attackPower`) : seuls les seuils de décision diffèrent. Figés dans
`src/experiments/CombatProfiles.js`, réutilisés par
`scripts/combat-benchmark.js` et par le preset de scénario
`balanced-combat-v1.2`.

| Paramètre | Pacifique | Défensif | Agressif |
|---|---|---|---|
| `encounterAvoidanceThreshold` | 0.15 | 0.3 | 0.75 |
| `combatThreatenThreshold` | 0.55 | 0.35 | 0.15 |
| `combatAttackThreshold` | 1 (jamais atteint) | 0.55 | 0.25 |
| `combatFleeHealthRatio` | 0.5 | 0.35 | 0.22 |
| `combatNumbersAdvantageWeight` | défaut (0.25) | 0.45 | défaut (0.25) |
| `combatTerritorialAdvantageWeight` | défaut (0.15) | 0.45 | défaut (0.15) |
| `combatAttackEnergyCost` | défaut (6) | défaut (6) | 10 |
| `combatAttackCooldownTicks` | défaut (5) | 4 | 8 |

### Calibration (étape 3)

Une première passe à seuils uniquement (pas de levier de coût) a montré un
agressif dominant presque sans partage, y compris face au défensif : le
défensif tombait à ~9-10 % d'ouvrières vivantes contre l'agressif, sans que
`AVOID`/`THREATEN` seuls (levier « limiter l'acharnement ») changent grand
chose. Trois leviers ont été retenus, sans toucher `attackPower` :

1. **Coût d'attaque** (agressif) — `combatAttackEnergyCost` et
   `combatAttackCooldownTicks` relevés : l'agressif garde l'initiative mais
   perd davantage de capacité de collecte/poursuite par attaque.
2. **Défense contextuelle** (défensif) — `combatNumbersAdvantageWeight` et
   `combatTerritorialAdvantageWeight` relevés, `combatAttackCooldownTicks`
   raccourci : le défensif combat mieux près de son nid/territoire ou avec
   des alliées, sans stat brute en plus.
3. **Acharnement limité** (agressif) — `combatFleeHealthRatio` relevé : une
   agressive blessée décroche un peu plus tôt.

Une grille courte (6 combinaisons, 6 seeds, 10 000 ticks,
`scripts/combat-calibration.js`) a servi à écarter les combinaisons trop
fortes (`combined` : défensif à 83,7 % — sur-protégé) avant de valider
`combined-milder` sur la campagne complète (20 seeds, 20 000 ticks).

## Résultat calibré (20 seeds × 20 000 ticks)

```bash
npm run experiment -- combat --seeds=20 --ticks=20000
```

| Matchup | Population/ouvrières finale | Morts totales | Coût économique vs Pacifique |
|---|---|---|---|
| Pacifique / Pacifique | 62,6 / 58,5 (100 %) | 1,5 | référence |
| Défensif / Défensif | 52,5 / 48,4 (~83 %) | ~11,6 (pertes modérées) | -3,8 % |
| Agressif / Agressif | 39 / 34,9 (~60 %) | ~25 (forte attrition) | -6,4 % |
| Défensif vs Agressif | Défensif ~13,6 vivantes (~27 %) — Agressif ~57 (~114 %) | Défensif ~46, Agressif ~2,8 | — |

Le défensif contre l'agressif ne renverse pas le rapport de force (l'agressif
garde territoire, population et kills), mais transforme une quasi-destruction
(~9-10 % avant calibration) en résistance durable (~25-30 % d'ouvrières
vivantes, ~33-38 % en comptant reine et couvain, jamais 0 vivante sur 20
seeds). Le miroir agressif reste franchement violent (~50 % de mortalité,
~46,95 morts de combat en moyenne) : la calibration ne l'a pas neutralisé.

Vérification d'équité (mêmes seeds, labels A/B inversés) : écart de collecte
de -0,7 % à +1,1 % sur les profils miroirs et croisés simples, ±8,3 % sur
`Défensif vs Agressif` — à recontrôler sur la campagne à 100 seeds ; si
l'écart reste dans l'ordre d'un écart-type (~5 sur 20 seeds ici), c'est du
bruit d'échantillonnage, pas un biais d'ordre.

## Point de vigilance avant release

Rejouer `npm run experiment -- combat --seeds=100 --ticks=50000` pour
verrouiller statistiquement ces résultats, en particulier l'écart de collecte
~8 % observé sur `Défensif vs Agressif`. Le smoke test à 20×20000 ne remplace
pas cette campagne officielle mais n'a révélé aucun signe de biais d'ordre
structurel sur les autres matchups.

## Commandes

```bash
npm run experiment -- combat --seeds=20 --ticks=20000
npm run experiment -- combat --seeds=20 --ticks=20000 --matchup=defensive-vs-aggressive
node scripts/combat-calibration.js
```
