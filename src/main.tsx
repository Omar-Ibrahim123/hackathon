import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { LocalStorageTripRepository } from "./history/LocalStorageTripRepository";
import { TripRepositoryProvider } from "./history/TripRepositoryContext";
import "./styles.css";

const repository = new LocalStorageTripRepository();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <TripRepositoryProvider repository={repository}>
        <App />
      </TripRepositoryProvider>
    </BrowserRouter>
  </StrictMode>,
);
