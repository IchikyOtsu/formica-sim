export class World {
  constructor(width, height) {
    if (width <= 0 || height <= 0) throw new Error("World dimensions must be positive");
    this.width = width;
    this.height = height;
    this.obstacles = [];
  }

  contains({ x, y }, margin = 0) {
    return x >= margin && x <= this.width - margin && y >= margin && y <= this.height - margin;
  }
}
