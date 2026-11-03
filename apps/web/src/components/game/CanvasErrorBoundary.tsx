'use client';

import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Keeps a WebGL/asset failure inside the 3D layer: the HUD, menus and the
 * match state stay alive and the player sees an explanation, not a blank page.
 */
export class CanvasErrorBoundary extends Component<
  { fallback: (error: Error) => ReactNode; children: ReactNode },
  State
> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error('[3d] scene crashed', error);
  }

  override render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
