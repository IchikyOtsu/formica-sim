export const RaidState = Object.freeze({
  TRAVELLING: "TRAVELLING",
  RETURNING: "RETURNING",
  COMPLETE: "COMPLETE",
  FAILED: "FAILED",
});

export class Raid {
  constructor({ id, sourceColonyId, targetColonyId, memberIds, createdTick }) {
    this.id = id;
    this.sourceColonyId = sourceColonyId;
    this.targetColonyId = targetColonyId;
    this.memberIds = new Set(memberIds);
    this.returnedIds = new Set();
    this.deadIds = new Set();
    this.state = RaidState.TRAVELLING;
    this.createdTick = createdTick;
  }
}
