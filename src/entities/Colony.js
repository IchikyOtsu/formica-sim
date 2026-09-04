export class Colony {
  constructor({ id, nest, color = "#f0b45f" }) {
    this.id = id;
    this.nest = nest;
    this.color = color;
    this.resources = 0;
    this.ants = [];
  }
}
