import { summarize } from "../src/experiments/AggregateStatistics.js";
import { ExperimentRunner } from "../src/experiments/ExperimentRunner.js";
import { DEFAULT_CONFIG } from "../src/simulation/SimulationConfig.js";

const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? match.split("=")[1] : fallback;
};

const seedCount = Math.max(1, Number(argument("seeds", 20)));
const ticks = Math.max(1, Number(argument("ticks", 20_000)));
const matchupFilter = argument("matchup", null);

// Profils : mêmes statistiques de combat (santé, puissance) pour tous — seule la
// décision (seuils IGNORE/AVOID/THREATEN/ATTACK) diffère, pour que l'écart mesuré
// vienne de la stratégie et non des chiffres bruts.
const PROFILES = {
  pacifist: {
    label: "Pacifique",
    overrides: {
      encounterAvoidanceThreshold: 0.15,
      combatThreatenThreshold: 0.55,
      combatAttackThreshold: 1,
      combatFleeHealthRatio: 0.5,
    },
  },
  defensive: {
    label: "Défensif",
    overrides: {
      encounterAvoidanceThreshold: 0.3,
      combatThreatenThreshold: 0.35,
      combatAttackThreshold: 0.55,
      combatFleeHealthRatio: 0.35,
      // Calibration V1.2 étape 3 : bonus contextuel (alliés/territoire) et
      // cooldown raccourci quand il combat en position favorable.
      combatNumbersAdvantageWeight: 0.45,
      combatTerritorialAdvantageWeight: 0.45,
      combatAttackCooldownTicks: 4,
    },
  },
  aggressive: {
    label: "Agressif",
    overrides: {
      encounterAvoidanceThreshold: 0.75,
      combatThreatenThreshold: 0.15,
      combatAttackThreshold: 0.25,
      // Calibration V1.2 étape 3 : attaquer coûte plus cher (énergie + cooldown)
      // et l'acharnement à faible santé est un peu plus limité.
      combatFleeHealthRatio: 0.22,
      combatAttackEnergyCost: 10,
      combatAttackCooldownTicks: 8,
    },
  },
};

function baseColonies() {
  return [
    {
      id: "A", name: "Colonie Ambre", color: "#f0b45f",
      nest: { x: 105, y: 260, radius: 28 }, initialAnts: 50, initialFoodStock: 10,
    },
    {
      id: "B", name: "Colonie Azur", color: "#65a9d8",
      nest: { x: 695, y: 260, radius: 28 }, initialAnts: 50, initialFoodStock: 10,
    },
  ];
}

function scenarioConfig(profileA, profileB, seed) {
  const [colonyA, colonyB] = baseColonies();
  return {
    ...DEFAULT_CONFIG,
    seed,
    colonies: [
      { ...colonyA, ...PROFILES[profileA].overrides },
      { ...colonyB, ...PROFILES[profileB].overrides },
    ],
    foodSources: [
      { id: "CENTER", x: 400, y: 260, quantity: 140, radius: 22 },
      { id: "WEST", x: 265, y: 120, quantity: 60, radius: 16 },
      { id: "EAST", x: 535, y: 400, quantity: 60, radius: 16 },
    ],
  };
}

const MATCHUPS = [
  { id: "pacifist-vs-pacifist", a: "pacifist", b: "pacifist", mirror: true },
  { id: "defensive-vs-defensive", a: "defensive", b: "defensive", mirror: true },
  { id: "aggressive-vs-aggressive", a: "aggressive", b: "aggressive", mirror: true },
  { id: "pacifist-vs-defensive", a: "pacifist", b: "defensive" },
  { id: "pacifist-vs-aggressive", a: "pacifist", b: "aggressive" },
  { id: "defensive-vs-aggressive", a: "defensive", b: "aggressive" },
  { id: "aggressive-vs-defensive", a: "aggressive", b: "defensive", fairnessPairOf: "defensive-vs-aggressive" },
].filter((matchup) => !matchupFilter || matchup.id === matchupFilter);

const runner = new ExperimentRunner();
const results = new Map();

for (const matchup of MATCHUPS) {
  const runs = [];
  for (let index = 0; index < seedCount; index += 1) {
    const seed = 1847 + index * 7919;
    const config = scenarioConfig(matchup.a, matchup.b, seed);
    const result = runner.run({ config, ticks, sampleInterval: Math.max(500, Math.floor(ticks / 20)) });
    const [a, b] = result.metrics.colonies;
    const yieldOf = (colony) => (colony.resources + colony.foodStock)
      / Math.max(1, colony.deaths + colony.attacks);
    runs.push({
      seed,
      populationA: a.totalPopulation,
      populationB: b.totalPopulation,
      livingAntsA: a.livingAnts,
      livingAntsB: b.livingAnts,
      collectedA: a.resources,
      collectedB: b.resources,
      foodStockA: a.foodStock,
      foodStockB: b.foodStock,
      birthsA: a.births,
      birthsB: b.births,
      deathsA: a.deaths,
      deathsB: b.deaths,
      foreignContacts: result.metrics.foreignContacts,
      avoidedContacts: result.metrics.avoidedContacts,
      threats: result.metrics.threats,
      fights: result.metrics.fights,
      attacks: result.metrics.attacks,
      attacksA: a.attacks,
      attacksB: b.attacks,
      damageDealt: result.metrics.damageDealt,
      combatDeaths: result.metrics.combatDeaths,
      killsA: a.kills,
      killsB: b.kills,
      combatLossesA: a.combatLosses,
      combatLossesB: b.combatLosses,
      territoryA: a.territoryCells,
      territoryB: b.territoryCells,
      contestedArea: result.metrics.contestedArea,
      distanceA: a.totalDistance,
      distanceB: b.totalDistance,
      dangerDistance: result.metrics.dangerDistance,
      yieldA: yieldOf(a),
      yieldB: yieldOf(b),
    });
  }
  results.set(matchup.id, { matchup, runs });
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value) {
  return Number(value.toFixed(2));
}

function statRow(label, values) {
  const stats = summarize(values);
  return {
    métrique: label,
    moyenne: round(stats.mean),
    médiane: round(stats.median),
    "écart-type": round(stats.standardDeviation),
    min: round(stats.min),
    max: round(stats.max),
  };
}

function report(matchupId) {
  const entry = results.get(matchupId);
  if (!entry) return;
  const { matchup, runs } = entry;
  const labelA = PROFILES[matchup.a].label;
  const labelB = PROFILES[matchup.b].label;
  const seeds = runs.length;
  console.log(`\n=== ${labelA} (A) vs ${labelB} (B) — ${seeds} seed(s), ${ticks} ticks ===`);

  const perColonyKeys = [
    ["population finale", "populationA", "populationB"],
    ["ouvrières vivantes", "livingAntsA", "livingAntsB"],
    ["collecte totale", "collectedA", "collectedB"],
    ["stock final", "foodStockA", "foodStockB"],
    ["naissances", "birthsA", "birthsB"],
    ["morts totales", "deathsA", "deathsB"],
    ["kills", "killsA", "killsB"],
    ["pertes de combat", "combatLossesA", "combatLossesB"],
    ["territoire contrôlé", "territoryA", "territoryB"],
    ["distance parcourue", "distanceA", "distanceB"],
    ["rendement stratégique", "yieldA", "yieldB"],
  ];
  console.log(`--- ${labelA} (A) ---`);
  console.table(perColonyKeys.map(([label, keyA]) => statRow(label, runs.map((run) => run[keyA]))));
  console.log(`--- ${labelB} (B) ---`);
  console.table(perColonyKeys.map(([label, , keyB]) => statRow(label, runs.map((run) => run[keyB]))));

  const survivedA = runs.filter((run) => run.livingAntsA > 0).length;
  const survivedB = runs.filter((run) => run.livingAntsB > 0).length;
  console.table([{
    "seeds où A survit": `${survivedA}/${seeds}`,
    "seeds où B survit": `${survivedB}/${seeds}`,
  }]);

  console.log("--- Métriques partagées de rencontre ---");
  const shared = ["foreignContacts", "avoidedContacts", "threats", "fights", "attacks", "damageDealt",
    "combatDeaths", "contestedArea", "dangerDistance"];
  console.table(shared.map((metric) => statRow(metric, runs.map((run) => run[metric]))));

  const efficiency = (killsKey, attacksKey) => summarize(runs.map((run) => (
    run[attacksKey] === 0 ? 0 : run[killsKey] / run[attacksKey]
  )));
  const effA = efficiency("killsA", "attacksA");
  const effB = efficiency("killsB", "attacksB");
  console.table([{
    profil: `${labelA} (A)`,
    "efficacité militaire moyenne (kills/attacks)": round(effA.mean),
    "écart-type": round(effA.standardDeviation),
  }, {
    profil: `${labelB} (B)`,
    "efficacité militaire moyenne (kills/attacks)": round(effB.mean),
    "écart-type": round(effB.standardDeviation),
  }]);

  return {
    labelA, labelB,
    collectedTotal: mean(runs.map((run) => run.collectedA + run.collectedB)),
    collectedA: mean(runs.map((run) => run.collectedA)),
    collectedB: mean(runs.map((run) => run.collectedB)),
  };
}

const summaries = {};
for (const matchup of MATCHUPS) summaries[matchup.id] = report(matchup.id);

// Coût économique du conflit : perte de collecte d'un profil "miroir" par rapport
// au miroir pacifiste (référence sans aucune initiative de combat).
const pacifistMirror = summaries["pacifist-vs-pacifist"];
if (pacifistMirror) {
  console.log("\n=== Coût économique du conflit (référence = Pacifique vs Pacifique) ===");
  const rows = [];
  for (const id of ["defensive-vs-defensive", "aggressive-vs-aggressive"]) {
    const summary = summaries[id];
    if (!summary) continue;
    const referencePerColony = pacifistMirror.collectedTotal / 2;
    const profilePerColony = summary.collectedTotal / 2;
    const cost = referencePerColony === 0 ? 0 : (referencePerColony - profilePerColony) / referencePerColony;
    rows.push({
      profil: summary.labelA,
      "collecte moyenne / colonie": Number(profilePerColony.toFixed(2)),
      "collecte pacifiste / colonie": Number(referencePerColony.toFixed(2)),
      "coût économique du conflit (%)": Number((cost * 100).toFixed(1)),
    });
  }
  if (rows.length > 0) console.table(rows);
}

// Vérification d'équité : mêmes seeds, labels A/B inversés entre les deux
// dernières entrées de MATCHUPS (agressif/défensif dans les deux ordres).
const fairnessPair = MATCHUPS.find((matchup) => matchup.fairnessPairOf);
if (fairnessPair) {
  const swapped = results.get(fairnessPair.id);
  const original = results.get(fairnessPair.fairnessPairOf);
  if (swapped && original) {
    console.log(`\n=== Vérification d'équité : ${fairnessPair.fairnessPairOf} vs ${fairnessPair.id} (mêmes seeds) ===`);
    const aggressiveIn = (entry, aggressiveIsA) => entry.runs.map((run) => (
      aggressiveIsA ? run.collectedA : run.collectedB
    ));
    const defensiveIn = (entry, aggressiveIsA) => entry.runs.map((run) => (
      aggressiveIsA ? run.collectedB : run.collectedA
    ));
    const aggressiveCollectionA = mean(aggressiveIn(original, false));
    const aggressiveCollectionB = mean(aggressiveIn(swapped, true));
    const defensiveCollectionA = mean(defensiveIn(original, false));
    const defensiveCollectionB = mean(defensiveIn(swapped, true));
    console.table([{
      "collecte agressif (défensif=A)": Number(aggressiveCollectionA.toFixed(2)),
      "collecte agressif (agressif=A)": Number(aggressiveCollectionB.toFixed(2)),
      "écart relatif (%)": Number((
        aggressiveCollectionA === 0 ? 0
          : (aggressiveCollectionB - aggressiveCollectionA) / aggressiveCollectionA * 100
      ).toFixed(1)),
    }, {
      "collecte défensif (défensif=A)": Number(defensiveCollectionA.toFixed(2)),
      "collecte défensif (agressif=A)": Number(defensiveCollectionB.toFixed(2)),
      "écart relatif (%)": Number((
        defensiveCollectionA === 0 ? 0
          : (defensiveCollectionB - defensiveCollectionA) / defensiveCollectionA * 100
      ).toFixed(1)),
    }]);
  }
}
