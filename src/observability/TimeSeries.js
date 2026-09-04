export class TimeSeries {
  constructor({ maxSamples = 10_000 } = {}) {
    this.maxSamples = Number.isFinite(maxSamples) ? Math.max(1, Math.floor(maxSamples)) : 10_000;
    this.samples = [];
  }

  append(sample) {
    this.samples.push(Object.freeze({ ...sample }));
    const overflow = this.samples.length - this.maxSamples;
    if (overflow > 0) this.samples.splice(0, overflow);
    return sample;
  }

  clear() {
    this.samples.length = 0;
  }

  toJSON() {
    return this.samples;
  }
}
