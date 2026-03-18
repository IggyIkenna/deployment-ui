import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { installDeploymentMockHandlers } from "./lib/mock-api";

// Initialize mock API handlers - enabled by default in demo/v0 environment
// Set VITE_MOCK_API=false explicitly to disable
const enableMock = import.meta.env.VITE_MOCK_API !== "false";
installDeploymentMockHandlers(enableMock);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
