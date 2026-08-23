export class IdleLifecycle {
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly delayMs: number,
    private readonly onIdle: () => void | Promise<void>,
  ) {}

  active() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
  }

  idle() {
    this.active()
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.onIdle()
    }, this.delayMs)
  }

  dispose() {
    this.active()
  }
}
