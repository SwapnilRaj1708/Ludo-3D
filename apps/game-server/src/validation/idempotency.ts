/**
 * Remembers recently seen action ids so a retried or double-sent command is
 * acknowledged as a duplicate instead of being applied twice.
 */
export class RecentIds {
  private readonly order: string[] = [];
  private readonly set = new Set<string>();

  constructor(private readonly limit = 256) {}

  /** Returns false if the id was already seen. */
  remember(id: string): boolean {
    if (this.set.has(id)) return false;
    this.set.add(id);
    this.order.push(id);
    if (this.order.length > this.limit) this.set.delete(this.order.shift()!);
    return true;
  }
}
