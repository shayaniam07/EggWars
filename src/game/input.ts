/**
 * EGG WARS - Unified input.
 * Desktop: remappable keyboard + mouse with pointer lock.
 * Mobile : left virtual stick, right-side look area, HUD buttons call
 *          setButton() directly. Touch controls never appear on desktop.
 */

export type GameAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "jump"
  | "sprint"
  | "crouch"
  | "reload"
  | "interact"
  | "slot1"
  | "slot2"
  | "slot3"
  | "scoreboard"
  | "pause"
  | "chat"
  | "map"
  | "inventory"
  | "fire"
  | "aim";

export const DEFAULT_BINDINGS: Record<string, string> = {
  forward: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  sprint: "ShiftLeft",
  crouch: "KeyC",
  reload: "KeyR",
  interact: "KeyE",
  slot1: "Digit1",
  slot2: "Digit2",
  slot3: "Digit3",
  scoreboard: "Tab",
  pause: "Escape",
  chat: "KeyT",
  map: "KeyM",
  inventory: "KeyB",
};

export const ACTION_LABELS: Record<string, string> = {
  forward: "Move forward",
  back: "Move back",
  left: "Strafe left",
  right: "Strafe right",
  jump: "Jump",
  sprint: "Sprint",
  crouch: "Crouch",
  reload: "Reload",
  interact: "Interact / pick up",
  slot1: "Weapon slot 1",
  slot2: "Weapon slot 2",
  slot3: "Weapon slot 3",
  scoreboard: "Scoreboard",
  pause: "Pause / settings",
  chat: "Chat",
  map: "Toggle map",
  inventory: "Inventory",
};

export class InputManager {
  private down = new Set<string>();
  private pressedOnce = new Set<GameAction>();
  private buttons = new Set<GameAction>();
  private bindings: Record<string, string> = { ...DEFAULT_BINDINGS };
  private lookDx = 0;
  private lookDy = 0;
  private joyVec = { x: 0, y: 0 };
  private lookTouchId: number | null = null;
  private listeners: (() => void)[] = [];
  pointerLocked = false;
  touchMode = false;
  invertY = false;
  enabled = true;

  constructor(private el: HTMLCanvasElement) {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.enabled) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Tab" || e.code === "Space") e.preventDefault();
      if (!this.down.has(e.code)) {
        for (const [action, code] of Object.entries(this.bindings)) {
          if (code === e.code) this.pressedOnce.add(action as GameAction);
        }
      }
      this.down.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => this.down.delete(e.code);
    const onMouseDown = (e: MouseEvent) => {
      if (!this.enabled) return;
      if (e.button === 0) this.buttons.add("fire");
      if (e.button === 2) this.buttons.add("aim");
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.buttons.delete("fire");
      if (e.button === 2) this.buttons.delete("aim");
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!this.pointerLocked || !this.enabled) return;
      this.lookDx += e.movementX;
      this.lookDy += e.movementY;
    };
    const onContext = (e: Event) => e.preventDefault();
    const onLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.el;
      if (!this.pointerLocked) {
        this.buttons.delete("fire");
        this.buttons.delete("aim");
        this.down.clear();
      }
    };
    const onBlur = () => {
      this.down.clear();
      this.buttons.clear();
    };

    /* ----------------------------- touch ----------------------------- */
    const onTouchStart = (e: TouchEvent) => {
      this.touchMode = true;
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX > window.innerWidth * 0.42 && this.lookTouchId === null) {
          this.lookTouchId = t.identifier;
          lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    };
    let lookLast = { x: 0, y: 0 };
    const onTouchMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.lookTouchId) {
          this.lookDx += (t.clientX - lookLast.x) * 1.6;
          this.lookDy += (t.clientY - lookLast.y) * 1.6;
          lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.lookTouchId) this.lookTouchId = null;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("blur", onBlur);
    document.addEventListener("pointerlockchange", onLockChange);
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("contextmenu", onContext);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    this.listeners.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerlockchange", onLockChange);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("contextmenu", onContext);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    });
  }

  setBindings(b: Record<string, string>) {
    this.bindings = { ...DEFAULT_BINDINGS, ...b };
  }

  requestPointerLock() {
    if (this.touchMode) return;
    void this.el.requestPointerLock?.();
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.el) document.exitPointerLock();
  }

  /** Mobile HUD buttons -> input state. */
  setButton(action: GameAction, value: boolean) {
    this.touchMode = true;
    if (value) {
      this.buttons.add(action);
      this.pressedOnce.add(action);
    } else {
      this.buttons.delete(action);
    }
  }

  setJoystick(x: number, y: number) {
    this.joyVec.x = Math.max(-1, Math.min(1, x));
    this.joyVec.y = Math.max(-1, Math.min(1, y));
  }

  isDown(action: GameAction): boolean {
    if (this.buttons.has(action)) return true;
    const code = this.bindings[action];
    return code ? this.down.has(code) : false;
  }

  consumePress(action: GameAction): boolean {
    if (this.pressedOnce.has(action)) {
      this.pressedOnce.delete(action);
      return true;
    }
    return false;
  }

  /** Movement intent in local space: x = strafe, y = forward. */
  moveVector(): { x: number; y: number } {
    let x = this.joyVec.x;
    let y = this.joyVec.y;
    if (this.isDown("forward")) y += 1;
    if (this.isDown("back")) y -= 1;
    if (this.isDown("right")) x += 1;
    if (this.isDown("left")) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  consumeLook(): { dx: number; dy: number } {
    const out = { dx: this.lookDx, dy: this.lookDy * (this.invertY ? -1 : 1) };
    this.lookDx = 0;
    this.lookDy = 0;
    return out;
  }

  clearFrame() {
    this.pressedOnce.clear();
  }

  dispose() {
    for (const off of this.listeners) off();
    this.listeners = [];
  }
}
