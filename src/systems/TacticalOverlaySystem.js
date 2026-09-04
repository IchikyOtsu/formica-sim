import { PheromoneType } from "../simulation/PheromoneField.js";

// V1.4.Web.1 (raids) + V1.4.Web.2 (combat/défense/alerte) : dérive une liste
// de marqueurs tactiques depuis l'état courant du moteur et depuis les
// événements de chaque tick. Ne modifie jamais la simulation — ce n'est que
// la lecture qui alimente le rendu.
//
// Deux familles de marqueurs :
// - persistants, recalculés à chaque appel de collect() à partir de l'état
//   courant (raids actifs, nids connus, nid sous menace, alerte ALARM) ;
// - éphémères ("flashs"), ingérés depuis les événements via ingestEvents()
//   — il faut les appeler à CHAQUE tick de simulation (pas seulement à
//   chaque frame de rendu), sinon les événements des ticks intermédiaires
//   (vitesse ×2/×4) seraient perdus.
export const OverlayType = Object.freeze({
  RAID_ROUTE: "RAID_ROUTE",
  RAID_GROUP: "RAID_GROUP",
  ENEMY_NEST_KNOWN: "ENEMY_NEST_KNOWN",
  LOOT_CARRIED: "LOOT_CARRIED",
  NEST_UNDER_THREAT: "NEST_UNDER_THREAT",
  ALARM_ALERT: "ALARM_ALERT",
  COMBAT: "COMBAT",
  COMBAT_DEATH: "COMBAT_DEATH",
  // Réservés à un ticket futur : BROOD_EVENT, SOLDIER_EMERGED.
});

const COMBAT_FLASH_TICKS = 40;
const COMBAT_DEATH_FLASH_TICKS = 60;
const ALARM_ALERT_THRESHOLD = 0.45;

export const DEFAULT_OVERLAY_VISIBILITY = Object.freeze({
  raids: true,
  raidRoutes: true,
  knownNests: true,
  defense: true,
  combat: true,
  loot: true,
  alarm: true,
});

const CATEGORY_BY_TYPE = {
  [OverlayType.RAID_GROUP]: "raids",
  [OverlayType.RAID_ROUTE]: "raidRoutes",
  [OverlayType.ENEMY_NEST_KNOWN]: "knownNests",
  [OverlayType.NEST_UNDER_THREAT]: "defense",
  [OverlayType.COMBAT]: "combat",
  [OverlayType.COMBAT_DEATH]: "combat",
  [OverlayType.LOOT_CARRIED]: "loot",
  [OverlayType.ALARM_ALERT]: "alarm",
};

export class TacticalOverlaySystem {
  constructor() {
    this.ephemeralMarkers = [];
  }

  ingestEvents(events, tick) {
    for (const event of events) {
      if (event.type === "COMBAT_STARTED" && event.position) {
        this.ephemeralMarkers.push({
          id: `combat-${event.colonyId}-${event.antId}-${tick}`,
          type: OverlayType.COMBAT,
          x: event.position.x,
          y: event.position.y,
          colonyId: event.colonyId,
          createdTick: tick,
          expiresTick: tick + COMBAT_FLASH_TICKS,
          payload: {},
        });
      } else if (event.type === "COMBAT_DEATH" && event.position) {
        this.ephemeralMarkers.push({
          id: `combat-death-${event.colonyId}-${event.antId}-${tick}`,
          type: OverlayType.COMBAT_DEATH,
          x: event.position.x,
          y: event.position.y,
          colonyId: event.colonyId,
          createdTick: tick,
          expiresTick: tick + COMBAT_DEATH_FLASH_TICKS,
          payload: {},
        });
      }
    }
    if (events.length > 0) this.pruneExpired(tick);
  }

  pruneExpired(tick) {
    this.ephemeralMarkers = this.ephemeralMarkers.filter((marker) => marker.expiresTick >= tick);
  }

  collect(simulation, visibility = DEFAULT_OVERLAY_VISIBILITY) {
    const overlays = [];
    if (visibility.knownNests) this.collectKnownNests(simulation, overlays);
    if (visibility.raidRoutes || visibility.raids) this.collectRaids(simulation, overlays, visibility);
    if (visibility.loot) this.collectLoot(simulation, overlays);
    if (visibility.defense) this.collectNestThreats(simulation, overlays);
    if (visibility.alarm) this.collectAlarmAlerts(simulation, overlays);
    if (visibility.combat) {
      this.pruneExpired(simulation.tickCount);
      overlays.push(...this.ephemeralMarkers);
    }
    return overlays;
  }

  collectKnownNests(simulation, overlays) {
    for (const colony of simulation.colonies) {
      for (const [targetColonyId, intel] of colony.knownEnemyNests) {
        overlays.push({
          id: `nest-known-${colony.id}-${targetColonyId}`,
          type: OverlayType.ENEMY_NEST_KNOWN,
          x: intel.position.x,
          y: intel.position.y,
          colonyId: colony.id,
          createdTick: intel.discoveredTick,
          expiresTick: null,
          payload: { targetColonyId, lastSeenTick: intel.lastSeenTick },
        });
      }
    }
  }

  collectRaids(simulation, overlays, visibility) {
    for (const raid of simulation.raids.values()) {
      const sourceColony = simulation.colonies.find((colony) => colony.id === raid.sourceColonyId);
      if (!sourceColony) continue;
      if (visibility.raidRoutes) {
        const intel = sourceColony.knownEnemyNests.get(raid.targetColonyId);
        if (intel) {
          overlays.push({
            id: `raid-route-${raid.id}`,
            type: OverlayType.RAID_ROUTE,
            x: sourceColony.nest.position.x,
            y: sourceColony.nest.position.y,
            targetX: intel.position.x,
            targetY: intel.position.y,
            colonyId: sourceColony.id,
            createdTick: raid.createdTick,
            expiresTick: null,
            payload: { state: raid.state },
          });
        }
      }
      if (!visibility.raids) continue;
      const members = sourceColony.ants.filter((ant) => ant.raidId === raid.id);
      if (members.length === 0) continue;
      const centerX = members.reduce((sum, ant) => sum + ant.position.x, 0) / members.length;
      const centerY = members.reduce((sum, ant) => sum + ant.position.y, 0) / members.length;
      overlays.push({
        id: `raid-group-${raid.id}`,
        type: OverlayType.RAID_GROUP,
        x: centerX,
        y: centerY,
        colonyId: sourceColony.id,
        createdTick: raid.createdTick,
        expiresTick: null,
        payload: { state: raid.state, memberCount: members.length },
      });
    }
  }

  collectLoot(simulation, overlays) {
    for (const colony of simulation.colonies) {
      for (const ant of colony.ants) {
        if (ant.raidCargo <= 0) continue;
        overlays.push({
          id: `loot-${ant.id}`,
          type: OverlayType.LOOT_CARRIED,
          x: ant.position.x,
          y: ant.position.y,
          colonyId: colony.id,
          createdTick: null,
          expiresTick: null,
          payload: { amount: ant.raidCargo },
        });
      }
    }
  }

  collectNestThreats(simulation, overlays) {
    for (const colony of simulation.colonies) {
      if (!colony.nestUnderThreat) continue;
      overlays.push({
        id: `nest-threat-${colony.id}`,
        type: OverlayType.NEST_UNDER_THREAT,
        x: colony.nest.position.x,
        y: colony.nest.position.y,
        colonyId: colony.id,
        createdTick: null,
        expiresTick: null,
        payload: { radius: colony.nest.radius },
      });
    }
  }

  collectAlarmAlerts(simulation, overlays) {
    for (const colony of simulation.colonies) {
      const field = simulation.colonyPheromones?.get(colony.id);
      if (!field) continue;
      const intensity = field.sample(PheromoneType.ALARM, colony.nest.position) / field.maxIntensity;
      if (intensity < ALARM_ALERT_THRESHOLD) continue;
      overlays.push({
        id: `alarm-alert-${colony.id}`,
        type: OverlayType.ALARM_ALERT,
        x: colony.nest.position.x,
        y: colony.nest.position.y,
        colonyId: colony.id,
        createdTick: null,
        expiresTick: null,
        payload: { intensity },
      });
    }
  }
}
