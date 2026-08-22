import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import App from "../App";
import type { TripRepository } from "../history/TripRepository";
import { TripRepositoryProvider } from "../history/TripRepositoryContext";
import { completeWelcome } from "../welcome/welcomePreference";
import { MemoryTripRepository } from "./MemoryTripRepository";

export function renderApp({
  route = "/",
  repository = new MemoryTripRepository(),
  welcomeComplete = false,
}: {
  route?: string;
  repository?: TripRepository;
  welcomeComplete?: boolean;
} = {}) {
  if (welcomeComplete) completeWelcome();
  return render(
    <MemoryRouter initialEntries={[route]}>
      <TripRepositoryProvider repository={repository}>
        <App />
      </TripRepositoryProvider>
    </MemoryRouter>,
  );
}
