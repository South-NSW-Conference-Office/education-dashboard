import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ApiError } from "./lib/api";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/dashboard.css";
import "./styles/finance.css";

// One retry for a flaky network; none for a 404, which is a definite answer (no board for that period).
const retry = (count: number, err: unknown) => !(err instanceof ApiError && err.status === 404) && count < 1;
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
