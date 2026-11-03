import * as THREE from 'three';
import { ANIM_FALLBACKS, LOOPING_STATES, type AnimState } from './animStates';

export interface PlayOptions {
  /** Cross-fade duration in seconds. */
  fade?: number;
  timeScale?: number;
  /** Named clip overriding the state's default clip (encounter variants). */
  clip?: string;
}

/**
 * Drives one animal instance's AnimationMixer: resolves states to clips (with
 * fallbacks for missing clips), cross-fades between loops and plays one-shot
 * actions that resolve when finished. Animation never affects game logic.
 */
export class AnimalController {
  readonly mixer: THREE.AnimationMixer;
  private readonly clipsByName = new Map<string, THREE.AnimationClip>();
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentKey: string | null = null;
  private pendingOnce = new Map<THREE.AnimationAction, () => void>();

  constructor(
    root: THREE.Object3D,
    clips: readonly THREE.AnimationClip[],
    private readonly stateClips: Record<AnimState, string>,
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of clips) this.clipsByName.set(clip.name, clip);
    this.mixer.addEventListener('finished', (e) => {
      const action = (e as unknown as { action: THREE.AnimationAction }).action;
      const done = this.pendingOnce.get(action);
      if (done) {
        this.pendingOnce.delete(action);
        done();
      }
    });
  }

  /** Clip name actually used for a state, after fallbacks; null if none exist. */
  resolveClip(state: AnimState, override?: string): string | null {
    if (override && this.clipsByName.has(override)) return override;
    for (const candidate of [state, ...ANIM_FALLBACKS[state]]) {
      const name = this.stateClips[candidate];
      if (name && this.clipsByName.has(name)) return name;
    }
    return null;
  }

  private action(name: string): THREE.AnimationAction {
    let action = this.actions.get(name);
    if (!action) {
      action = this.mixer.clipAction(this.clipsByName.get(name)!);
      this.actions.set(name, action);
    }
    return action;
  }

  /** Switches the base loop (idle, walk, run…). No-op if already playing. */
  loop(state: AnimState, options: PlayOptions = {}): void {
    const name = this.resolveClip(state, options.clip);
    if (!name) return;
    const key = `loop:${name}`;
    const action = this.action(name);
    action.timeScale = options.timeScale ?? 1;
    if (this.currentKey === key && this.current?.isRunning()) return;
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    this.crossFadeTo(action, options.fade ?? 0.22);
    this.currentKey = key;
  }

  /**
   * Plays a one-shot clip and resolves when it ends (or immediately when the
   * clip is missing). Looping states passed here are played for one cycle.
   */
  once(state: AnimState, options: PlayOptions = {}): Promise<void> {
    const name = this.resolveClip(state, options.clip);
    if (!name) return Promise.resolve();
    const action = this.action(name);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = options.timeScale ?? 1;
    this.crossFadeTo(action, options.fade ?? 0.12);
    this.currentKey = `once:${name}`;
    return new Promise((resolve) => {
      const previous = this.pendingOnce.get(action);
      previous?.();
      this.pendingOnce.set(action, resolve);
    });
  }

  isLooping(state: AnimState): boolean {
    return LOOPING_STATES.has(state);
  }

  private crossFadeTo(next: THREE.AnimationAction, fade: number) {
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (this.current && this.current !== next) {
      this.current.crossFadeTo(next, fade, false);
    }
    this.current = next;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  /**
   * Stops and releases every action. The controller stays usable: React may
   * remount the same instance (StrictMode), and actions are recreated lazily.
   */
  dispose(): void {
    for (const resolve of this.pendingOnce.values()) resolve();
    this.pendingOnce.clear();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.actions.clear();
    this.current = null;
    this.currentKey = null;
  }
}
