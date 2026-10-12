import React from 'react';

// One broken page must not turn the whole app into a blank screen: show a short message and a way back.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(prev: { resetKey?: string }) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  componentDidCatch(error: Error) {
    // a page file that no longer exists on the server (new version published): reload once to get the new version
    if (/dynamically imported module|Importing a module script failed|Loading chunk/i.test(String(error?.message))) {
      try {
        const last = Number(sessionStorage.getItem('sdm_chunk_reload') || 0);
        if (Date.now() - last > 60_000) { sessionStorage.setItem('sdm_chunk_reload', String(Date.now())); location.reload(); }
      } catch { /* ignore */ }
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-3">
        <p className="font-bold text-brand-black">This page could not be shown.</p>
        <p className="text-sm text-brand-gray">The system may have just been updated. Reloading usually fixes it.</p>
        <button className="btn-primary" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}
