export function summarize(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0)
    / values.length;
  return {
    mean,
    median,
    min: sorted[0],
    max: sorted.at(-1),
    standardDeviation: Math.sqrt(variance),
  };
}
