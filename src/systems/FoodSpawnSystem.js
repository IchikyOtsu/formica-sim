import { FoodSource, FoodSourceState } from "../entities/FoodSource.js";

export class FoodSpawnSystem {
  constructor(random = Math.random) {
    this.random = random;
    this.nextSourceId = 1;
  }

  update(foodSources, world, config, regenerationMultiplier) {
    let regenerated = 0;
    let expiredFood = 0;
    for (const source of foodSources) {
      if (source.state === FoodSourceState.SPAWN) {
        source.activate();
      } else if (source.state === FoodSourceState.ACTIVE) {
        source.age += 1;
        regenerated += source.regenerate(config.foodRegenerationRate * regenerationMultiplier);
        if (source.quantity < 1) source.deplete();
        if (source.age >= config.foodSourceLifetimeTicks) {
          expiredFood += source.quantity;
          source.startCooldown(config.foodRespawnDelayTicks);
        }
      } else if (source.state === FoodSourceState.DEPLETED) {
        source.startCooldown(config.foodRespawnDelayTicks);
      } else if (source.state === FoodSourceState.COOLDOWN) {
        source.cooldownRemaining = Math.max(0, source.cooldownRemaining - 1);
      }
    }

    const activeCount = foodSources.filter((source) => source.active).length;
    const spawnChance = config.foodSpawnProbability * regenerationMultiplier;
    if (activeCount < config.maxActiveSources && this.random() < spawnChance) {
      const reusable = foodSources.find(
        (source) => source.state === FoodSourceState.COOLDOWN && source.cooldownRemaining === 0,
      );
      if (reusable) {
        reusable.spawn(
          this.randomPosition(world, config.foodSpawnMargin),
          this.randomQuantity(config),
          config.foodSourceRadius,
        );
      } else if (foodSources.length < config.maxActiveSources) {
        foodSources.push(this.createSource(world, config));
      }
    }
    return { regenerated, expiredFood };
  }

  createSource(world, config) {
    const position = this.randomPosition(world, config.foodSpawnMargin);
    return new FoodSource({
      id: `DYNAMIC-${this.nextSourceId++}`,
      ...position,
      quantity: this.randomQuantity(config),
      radius: config.foodSourceRadius,
      state: FoodSourceState.SPAWN,
    });
  }

  randomPosition(world, margin) {
    return {
      x: margin + this.random() * (world.width - margin * 2),
      y: margin + this.random() * (world.height - margin * 2),
    };
  }

  randomQuantity(config) {
    return config.foodMinQuantity
      + this.random() * (config.foodMaxQuantity - config.foodMinQuantity);
  }
}
