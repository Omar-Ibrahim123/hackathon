import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { apiBaseUrl, apiMode, historyStorage } from "./apiConfig";
import { createTripRepository } from "./history/createTripRepository";
import { TripRepositoryProvider } from "./history/TripRepositoryContext";
import "./styles.css";

const repository = createTripRepository({
  mode: apiMode,
  history: historyStorage,
  baseUrl: apiBaseUrl,
  storage: window.localStorage,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <TripRepositoryProvider repository={repository}>
        <App />
      </TripRepositoryProvider>
    </BrowserRouter>
  </StrictMode>,
);
