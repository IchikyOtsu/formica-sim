# Overlays tactiques et catalogue de scénarios — V1.4.Web

## V1.4.Web.1 + V1.4.Web.2 — Overlays

Deux nouveaux modules, séparés comme demandé :

- **`TacticalOverlaySystem`** (`src/systems/`) — lecture seule, ne modifie
  jamais la simulation. Deux familles de marqueurs :
  - **persistants**, recalculés à chaque appel de `collect(simulation,
    visibility)` depuis l'état courant : `RAID_ROUTE`, `RAID_GROUP`,
    `ENEMY_NEST_KNOWN`, `LOOT_CARRIED`, `NEST_UNDER_THREAT`, `ALARM_ALERT`
    (déclenché seulement au-dessus d'un seuil d'intensité, pour éviter le
    bruit visuel demandé) ;
  - **éphémères**, ingérés depuis les événements via `ingestEvents(events,
    tick)` — **appelé à chaque tick de simulation**, pas seulement à chaque
    frame de rendu (sinon les événements des ticks intermédiaires en
    vitesse ×2/×5 seraient perdus) : `COMBAT` (40 ticks), `COMBAT_DEATH`
    (60 ticks).
- **`MapMarkerRenderer`** (`src/rendering/`) — dessine les marqueurs en
  primitives canvas (pas de police d'icônes externe : le projet n'a aucune
  dépendance, ligne pointillée pour les routes de raid, triangle pour un
  groupe, "œil" pour un nid connu, point doré pour le butin, anneau +
  bouclier pour un nid menacé, triangle d'alerte pour une ALARM forte,
  croix pour un combat, crâne simplifié pour une mort).

`Renderer` orchestre les deux : `render()` appelle `collect()` puis délègue
le tracé, filtré par `overlayVisibility` (une entrée par catégorie).
`main.js` appelle `renderer.tacticalOverlaySystem.ingestEvents(...)` dans
`observeTick()`, à chaque tick — pas dans la boucle de rendu.

### UI

Panneau "Overlays tactiques" (ouvert par défaut, appliqué immédiatement,
sans reset) : Raids, Routes de raid, Nids connus, Défense du nid, Combats,
Butin, Alertes ALARM — chacun indépendant. Le toggle "Raids" du bandeau de
contrôles (à côté de Pistes/Territoires) reste le coupe-circuit global.

**Non fait dans ce ticket** : les icônes démographiques (œuf posé, soldat
émergé) — l'événement `WORKERS_EMERGED` ne distingue pas encore la caste
par fourmi individuellement, il faudrait l'enrichir en amont. Laissé pour
un futur ticket plutôt que de forcer une fausse distinction.

## V1.4.Web.3 — Catalogue de scénarios

Nouvelle catégorie **"Raids (V1.4)"**, avec cinq scénarios pédagogiques
dédiés, chacun isolant une seule mécanique — vérifié que chacun déclenche
bien ce qu'il promet sur sa durée :

| Scénario | Isole | Vérifié |
|---|---|---|
| Découverte de nid ennemi | détection + mémoire, `combatEnabled: false` | découverte ✓, aucun raid/pillage/défense |
| Raid minimal | formation, trajet, retour — `pillageEnabled: false` | raid ✓, aucun vol |
| Pillage | vol borné, retour avec butin, chute au sol | vol ✓ |
| Défense du nid | Azur attaque en auto-raid, Ambre purement défensive | défense activée ✓ |
| Raids automatiques | les deux décident seules, fenêtre courte (16 000 ticks) | tout ✓ |

Les catégories existantes (Compétition, Référence & saisons, ALARM, Combat,
Castes) sont conservées telles quelles — leur ordre suit déjà la
progression pédagogique (fondamentaux → écologie → conflit → castes →
raids → final), donc pas de renommage risqué de contenu qui fonctionnait
déjà.

## V1.4.Web.4 — Scénario final

`complete-v1.4`, renommé **"Simulation complète V1.4"** (catégorie
"Version complète (V1.4)"), reste le scénario par défaut au chargement.
Aucun changement de configuration nécessaire : les overlays s'appliquent
automatiquement dès qu'un raid, une défense ou un combat s'y produit —
c'est une couche de rendu, pas une propriété du scénario.
