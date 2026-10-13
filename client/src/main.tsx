import React from "react";
import ReactDOM from "react-dom/client";

function App() {
  return (
    <main>
      <h1>Event Intelligence Chat</h1>
      <p>Workspace ready.</p>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
