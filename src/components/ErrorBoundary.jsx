import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("Aven render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="auth-screen">
          <section className="auth-card">
            <p className="eyebrow">Aven Startup</p>
            <h1>Aven could not finish loading.</h1>
            <div className="alert">
              {this.state.error.message || "Please check your .env file, restart Vite, and try again."}
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
