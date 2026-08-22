export function formatEmissions(value: number): string {
  return `${value.toLocaleString("en-CA", {
    maximumFractionDigits: 2,
  })} kg CO₂e`;
}

export function formatSavedAt(value: string): string {
  return new Date(value).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
