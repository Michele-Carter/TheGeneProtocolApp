/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AlertTriangle } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Catches render-time exceptions in its subtree so they show a recoverable
// error message instead of silently blanking the screen. Without this, an
// uncaught error anywhere in the component tree (e.g. bad persisted data)
// unmounts the entire app with no feedback to the user.
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Unhandled render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-2xl border border-red-900/40 bg-red-950/10">
          <AlertTriangle className="text-red-400 mb-4" size={32} />
          <h2 className="text-lg font-bold text-white mb-2">{this.props.fallbackTitle ?? "Something went wrong"}</h2>
          <p className="text-sm text-slate-400 max-w-md mb-6">
            This section hit an unexpected error and couldn't load. Try again, switch to another tab and back, or reload the page.
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-gold-500/15 border border-gold-400/70 text-gold-300 hover:bg-gold-500/20 hover:border-gold-300 transition cursor-pointer"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
