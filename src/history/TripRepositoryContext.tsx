import { createContext, useContext, type ReactNode } from "react";

import type { TripRepository } from "./TripRepository";

const TripRepositoryContext = createContext<TripRepository | null>(null);

export function TripRepositoryProvider({
  repository,
  children,
}: {
  repository: TripRepository;
  children: ReactNode;
}) {
  return (
    <TripRepositoryContext.Provider value={repository}>
      {children}
    </TripRepositoryContext.Provider>
  );
}

export function useTripRepository(): TripRepository {
  const repository = useContext(TripRepositoryContext);
  if (repository === null) {
    throw new Error("TripRepositoryProvider is required.");
  }
  return repository;
}
