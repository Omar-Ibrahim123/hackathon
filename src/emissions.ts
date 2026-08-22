// EPA Greenhouse Gas Equivalencies Calculator: ~404 g CO2 per mile
// for an average passenger vehicle (8,887 g CO2e per gallon gasoline
// / 22.0 mpg combined fuel economy).
const KG_CO2E_PER_CAR_MILE = 0.404;

export function toCarMiles(totalCo2eKg: number): number {
  return totalCo2eKg / KG_CO2E_PER_CAR_MILE;
}

export function formatCarMiles(totalCo2eKg: number): string {
  const miles = toCarMiles(totalCo2eKg);
  const value = miles.toLocaleString("en-CA", {
    maximumFractionDigits: miles < 10 ? 1 : 0,
  });
  return `${value} miles driven`;
}
