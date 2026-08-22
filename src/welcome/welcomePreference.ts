export const WELCOME_STORAGE_KEY = "greenercart.welcome-complete";

export function hasCompletedWelcome(storage: Storage = localStorage): boolean {
  return storage.getItem(WELCOME_STORAGE_KEY) === "true";
}

export function completeWelcome(storage: Storage = localStorage): void {
  storage.setItem(WELCOME_STORAGE_KEY, "true");
}
