import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { setUpdateReady } from "./game/swUpdate";
import "./index.css";

// Com registerType "autoUpdate" o SW novo já assumiu o controle quando este
// callback roda, mas a aba aberta segue com o código antigo em memória. Sem
// onNeedReload o plugin dispara window.location.reload() por conta própria —
// o que mataria uma rodada em andamento. Aqui só avisamos: o técnico recarrega
// na hora que quiser.
registerSW({
  immediate: true,
  onNeedReload: () => setUpdateReady(() => window.location.reload()),
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
