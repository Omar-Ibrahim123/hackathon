import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { TripRepository } from "../history/TripRepository";
import { TripRepositoryProvider } from "../history/TripRepositoryContext";
import HomePage from "../pages/HomePage";
import { MemoryTripRepository } from "./MemoryTripRepository";

export function renderHome({
  repository = new MemoryTripRepository(),
}: { repository?: TripRepository } = {}) {
  return render(
    <MemoryRouter>
      <TripRepositoryProvider repository={repository}>
        <HomePage />
      </TripRepositoryProvider>
    </MemoryRouter>,
  );
}
