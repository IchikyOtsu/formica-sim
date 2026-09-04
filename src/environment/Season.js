export const Season = Object.freeze({
  SPRING: "SPRING",
  SUMMER: "SUMMER",
  AUTUMN: "AUTUMN",
  WINTER: "WINTER",
});

export const SEASON_ORDER = Object.freeze([
  Season.SPRING,
  Season.SUMMER,
  Season.AUTUMN,
  Season.WINTER,
]);

export const SEASON_LABELS = Object.freeze({
  [Season.SPRING]: "Printemps",
  [Season.SUMMER]: "Été",
  [Season.AUTUMN]: "Automne",
  [Season.WINTER]: "Hiver",
  STABLE: "Stable",
});
