// V1.4.Web.1 : dérive une liste de marqueurs tactiques (raids) depuis l'état
// courant du moteur, à chaque frame. Ne modifie jamais la simulation — ce
// n'est que la lecture qui alimente le rendu. Les types réservés aux tickets
// suivants (combat, défense, ALARM, démographie) sont listés en commentaire
// pour garder le vocabulaire cohérent d'un ticket à l'autre.
export const OverlayType = Object.freeze({
  RAID_ROUTE: "RAID_ROUTE",
  RAID_GROUP: "RAID_GROUP",
  ENEMY_NEST_KNOWN: "ENEMY_NEST_KNOWN",
  LOOT_CARRIED: "LOOT_CARRIED",
  // Réservés à V1.4.Web.2+ : NEST_UNDER_THREAT, COMBAT, COMBAT_DEATH,
  // ALARM_ALERT, BROOD_EVENT, SOLDIER_EMERGED.
});

export class TacticalOverlaySystem {
  collect(simulation) {
    const overlays = [];
    this.collectKnownNests(simulation, overlays);
    this.collectRaids(simulation, overlays);
    this.collectLoot(simulation, overlays);
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

  collectRaids(simulation, overlays) {
    for (const raid of simulation.raids.values()) {
      const sourceColony = simulation.colonies.find((colony) => colony.id === raid.sourceColonyId);
      if (!sourceColony) continue;
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
}
