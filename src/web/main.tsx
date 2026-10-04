import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

/** Shows the error on screen instead of leaving a blank page, so a failure can be reported. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ maxWidth: 640, margin: "48px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: "1.1rem" }}>Something went wrong</h1>
        <p>Reload the page. If your browser offers to translate it, choose to show the original: translation can break pages like this one.</p>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{String(this.state.error.message)}</pre>
        <button onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
