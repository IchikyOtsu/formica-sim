export class EventLog {
  constructor({ maxEvents = 5_000 } = {}) {
    this.maxEvents = Number.isFinite(maxEvents) ? Math.max(1, Math.floor(maxEvents)) : 5_000;
    this.events = [];
  }

  capture(events) {
    for (const event of events) this.events.push(Object.freeze({ ...event }));
    const overflow = this.events.length - this.maxEvents;
    if (overflow > 0) this.events.splice(0, overflow);
  }

  clear() {
    this.events.length = 0;
  }

  toJSON() {
    return this.events;
  }
}
