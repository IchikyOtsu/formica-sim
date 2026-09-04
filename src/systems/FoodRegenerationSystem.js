export class FoodRegenerationSystem {
  update(foodSources, amountPerSource) {
    if (amountPerSource <= 0) return 0;
    return foodSources.reduce(
      (total, source) => total + source.regenerate(amountPerSource),
      0,
    );
  }
}
