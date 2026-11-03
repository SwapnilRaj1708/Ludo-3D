/**
 * Cooperative animation tasks: generators that receive the frame delta (in
 * seconds) through `yield` and finish when their animation is complete. They
 * compose with `yield*` (sequence) and `parallel()`.
 */
export type Task = Generator<void, void, number>;

export function* wait(seconds: number): Task {
  let t = 0;
  while (t < seconds) t += yield;
}

/** Calls `fn(k)` every frame with k going 0 → 1 over `seconds`. */
export function* during(seconds: number, fn: (k: number, dt: number) => void): Task {
  if (seconds <= 0) {
    fn(1, 0);
    return;
  }
  let t = 0;
  fn(0, 0);
  while (t < seconds) {
    const dt = yield;
    t += dt;
    fn(Math.min(1, t / seconds), dt);
  }
}

export function* parallel(...tasks: Task[]): Task {
  const running = tasks.map((task) => ({ task, done: !!task.next().done }));
  while (running.some((r) => !r.done)) {
    const dt = yield;
    for (const r of running) if (!r.done) r.done = !!r.task.next(dt).done;
  }
}

export function* call(fn: () => void): Task {
  fn();
}

export const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
export const easeIn = (k: number) => k * k * k;
