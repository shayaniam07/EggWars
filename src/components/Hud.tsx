"use client";

/**
 * EGG WARS - In-match HUD.
 * Every control below is wired to a real engine action (see GameShell).
 * Touch controls render only on touch devices.
 */
import { useEffect, useRef, useState } from "react";
import type { HudState } from "@/game/engine";
import type { GameAction } from "@/game/input";
import { cn } from "./ui";

export function Hud({
  hud,
  isMobile,
  onButton,
  onJoystick,
  onPause,
  onChat,
  gameName,
}: {
  hud: HudState;
  isMobile: boolean;
  onButton: (a: GameAction, down: boolean) => void;
  onJoystick: (x: number, y: number) => void;
  onPause: () => void;
  onChat: (msg: string) => void;
  gameName: string;
}) {
  const [showBoard, setShowBoard] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Tab") {
        e.preventDefault();
        setShowBoard(true);
      }
      if (e.code === "Enter" && !chatOpen) setChatOpen(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Tab") setShowBoard(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [chatOpen]);

  const lowHp = hud.hp <= 35;

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans text-white">
      {/* ---------- damage vignette ---------- */}
      {lowHp && hud.alive && <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle,transparent_45%,rgba(190,18,60,.45))]" />}

      {/* ---------- top-left: player + match ---------- */}
      <div className="absolute left-2 top-2 flex items-center gap-2 sm:left-4 sm:top-4">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-2.5 py-1.5 backdrop-blur">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-b from-amber-300 to-amber-600 text-lg">🥚</div>
          <div className="min-w-[108px]">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider">
              <span className="truncate max-w-[92px]">{hud.scoreboard.find((s) => s.isSelf)?.name ?? "You"}</span>
              {hud.mode === "online" && (
                <span className={cn("rounded px-1 text-[9px]", hud.connection === "live" ? "bg-emerald-500/25 text-emerald-300" : "bg-rose-500/25 text-rose-300")}>
                  {hud.connection === "live" ? "ONLINE" : hud.connection.toUpperCase()}
                </span>
              )}
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded bg-black/60">
              <div
                className="h-full transition-[width] duration-200"
                style={{ width: `${hud.hp}%`, background: lowHp ? "#f43f5e" : "linear-gradient(90deg,#22c55e,#86efac)" }}
              />
            </div>
            <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded bg-black/60">
              <div className="h-full bg-sky-400 transition-[width] duration-200" style={{ width: `${hud.armor}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* ---------- top-centre: match status ---------- */}
      <div className="absolute left-1/2 top-2 flex -translate-x-1/2 items-center gap-1.5 sm:top-4">
        <Stat label="ALIVE" value={hud.alivePlayers} tone="text-emerald-300" />
        <Stat label="KILLS" value={hud.kills} tone="text-amber-300" />
        <Stat label="TIME" value={formatTime(hud.timeLeft)} tone="text-sky-300" />
      </div>

      {/* ---------- top-right: minimap + buttons ---------- */}
      <div className="absolute right-2 top-2 flex flex-col items-end gap-2 sm:right-4 sm:top-4">
        <div className="flex gap-1.5">
          <IconBtn label="Map" onPress={() => setShowMap((v) => !v)} active={showMap}>🗺️</IconBtn>
          <IconBtn label="Scoreboard" onPress={() => setShowBoard((v) => !v)} active={showBoard}>📊</IconBtn>
          <IconBtn label="Chat" onPress={() => setChatOpen((v) => !v)} active={chatOpen}>💬</IconBtn>
          <IconBtn label="Pause / settings" onPress={onPause}>⏸️</IconBtn>
        </div>
        <Minimap hud={hud} expanded={showMap} />
        <div className="w-[160px] space-y-1 text-[11px] sm:w-[190px]">
          {hud.killFeed.slice(0, 5).map((k, i) => (
            <div key={`${k.at}-${i}`} className="truncate rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 backdrop-blur">
              <span className="font-bold text-emerald-300">{k.killer}</span>
              <span className="mx-1 text-slate-400">{k.head ? "💥" : "☠️"}</span>
              <span className="font-bold text-rose-300">{k.victim}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- crosshair ---------- */}
      {hud.alive && hud.matchState !== "ended" && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Crosshair spread={hud.crosshair} hit={hud.hitMarker > 0} />
        </div>
      )}

      {/* ---------- damage direction ---------- */}
      {hud.damageDirs.map((d, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2"
          style={{ transform: `translate(-50%,-50%) rotate(${(d.dir * 180) / Math.PI}deg)` }}
        >
          <div className="mx-auto -mt-28 h-8 w-20 rounded-t-full bg-gradient-to-t from-transparent to-rose-500/80 blur-[1px]" />
        </div>
      ))}

      {/* ---------- interact prompt ---------- */}
      {hud.interact && hud.alive && (
        <div className="absolute left-1/2 top-[58%] -translate-x-1/2 rounded-xl border border-amber-300/40 bg-slate-950/80 px-4 py-2 text-sm font-bold text-amber-200 backdrop-blur">
          {isMobile ? "Tap ✋ to " : "Press [E] to "} {hud.interact}
        </div>
      )}

      {/* ---------- countdown / respawn / ended ---------- */}
      {hud.matchState === "countdown" && (
        <Center>
          <div className="text-7xl font-black text-amber-300 drop-shadow-[0_6px_0_rgba(0,0,0,.6)]">{hud.countdown || "GO!"}</div>
          <p className="mt-2 text-sm font-bold uppercase tracking-[.3em] text-slate-300">{gameName}</p>
        </Center>
      )}
      {!hud.alive && hud.matchState === "live" && (
        <Center>
          <div className="text-4xl font-black text-rose-400">ELIMINATED</div>
          <p className="mt-2 text-lg font-bold text-slate-200">Respawning in {hud.respawnIn}s</p>
        </Center>
      )}

      {/* ---------- bottom-centre: ammo + weapon slots ---------- */}
      <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 sm:bottom-4">
        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-1.5 backdrop-blur">
          <span className="text-xl">{hud.weaponEmoji}</span>
          <div className="text-right leading-none">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{hud.weaponName}</div>
            <div className="font-black">
              <span className={cn("text-2xl", hud.mag === 0 && "text-rose-400")}>{hud.mag}</span>
              <span className="text-sm text-slate-400"> / {hud.reserve}</span>
            </div>
          </div>
        </div>
        {hud.reloading && (
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-black/60">
            <div className="h-full bg-amber-400" style={{ width: `${Math.round(hud.reloadPct * 100)}%` }} />
          </div>
        )}
        <div className="flex gap-1.5">
          {hud.slots.map((s, i) => (
            <button
              key={s.id + i}
              className={cn(
                "pointer-events-auto flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold backdrop-blur transition",
                s.active ? "border-amber-300/70 bg-amber-400/20 text-amber-200" : "border-white/10 bg-slate-950/60 text-slate-400",
              )}
              onClick={() => onButton(`slot${i + 1}` as GameAction, true)}
            >
              <span className="opacity-60">{i + 1}</span> {s.emoji} {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- mobile controls ---------- */}
      {isMobile && (
        <>
          <Joystick onChange={onJoystick} />
          <div className="pointer-events-none absolute bottom-3 right-3 grid grid-cols-3 gap-2">
            <TouchBtn onPress={onButton} action="inventory" label="🎒" sub="Bag" />
            <TouchBtn onPress={onButton} action="interact" label="✋" sub="Use" />
            <TouchBtn onPress={onButton} action="reload" label="🔄" sub="Reload" />
            <TouchBtn onPress={onButton} action="crouch" label="🫳" sub="Crouch" hold />
            <TouchBtn onPress={onButton} action="aim" label="🎯" sub="Aim" hold />
            <TouchBtn onPress={onButton} action="jump" label="⬆️" sub="Jump" />
            <TouchBtn onPress={onButton} action="slot2" label="🔫" sub="Swap" />
            <TouchBtn onPress={onButton} action="sprint" label="🏃" sub="Sprint" hold />
            <TouchBtn onPress={onButton} action="fire" label="🔥" sub="Fire" hold big />
          </div>
        </>
      )}

      {/* ---------- scoreboard ---------- */}
      {showBoard && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 p-4">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/95 p-4">
            <h3 className="mb-3 text-center text-sm font-black uppercase tracking-[.2em] text-amber-300">Scoreboard</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="pb-1 text-left">#</th>
                  <th className="pb-1 text-left">Player</th>
                  <th className="pb-1 text-right">K</th>
                  <th className="pb-1 text-right">D</th>
                  {hud.mode === "online" && <th className="pb-1 text-right">Ping</th>}
                </tr>
              </thead>
              <tbody>
                {hud.scoreboard.map((s, i) => (
                  <tr key={s.name + i} className={cn("border-t border-white/5", s.isSelf && "bg-amber-400/10 font-bold text-amber-200")}>
                    <td className="py-1">{i + 1}</td>
                    <td className="truncate py-1">{s.name}</td>
                    <td className="py-1 text-right">{s.kills}</td>
                    <td className="py-1 text-right">{s.deaths}</td>
                    {hud.mode === "online" && <td className="py-1 text-right text-slate-400">{s.ping ?? 0}ms</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="mt-3 w-full rounded-xl bg-white/10 py-2 text-xs font-bold" onClick={() => setShowBoard(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* ---------- chat ---------- */}
      <div className="absolute bottom-24 left-2 w-[min(70vw,300px)] space-y-1 text-[11px] sm:bottom-28 sm:left-4">
        {hud.chat.slice(-5).map((c, i) => (
          <div key={i} className="truncate rounded-lg bg-slate-950/60 px-2 py-1 backdrop-blur">
            <span className="font-bold text-sky-300">{c.name}: </span>
            <span className="text-slate-200">{c.msg}</span>
          </div>
        ))}
        {chatOpen && (
          <form
            className="pointer-events-auto flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const t = chatText.trim();
              if (t) onChat(t);
              setChatText("");
              setChatOpen(false);
            }}
          >
            <input
              autoFocus
              value={chatText}
              maxLength={140}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Say something…"
              className="flex-1 rounded-lg border border-white/15 bg-slate-950/90 px-2 py-1.5 text-xs outline-none"
            />
            <button className="rounded-lg bg-sky-500 px-3 text-xs font-bold">Send</button>
          </form>
        )}
      </div>

      {hud.fps > 0 && (
        <div className="absolute bottom-1 left-1 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300">{hud.fps} FPS</div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- fragments */
function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 px-2.5 py-1 text-center backdrop-blur">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cn("text-sm font-black leading-tight", tone)}>{value}</div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 grid place-items-center text-center">{children}</div>;
}

function IconBtn({ children, onPress, label, active }: { children: React.ReactNode; onPress: () => void; label: string; active?: boolean }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onPress}
      className={cn(
        "pointer-events-auto grid h-9 w-9 place-items-center rounded-xl border text-base backdrop-blur transition active:scale-95",
        active ? "border-amber-300/60 bg-amber-400/20" : "border-white/10 bg-slate-950/70 hover:bg-slate-800/80",
      )}
    >
      {children}
    </button>
  );
}

function Crosshair({ spread, hit }: { spread: number; hit: boolean }) {
  const gap = 4 + Math.min(26, spread * 340);
  const color = hit ? "#f87171" : "#eaf6ff";
  return (
    <div className="relative h-14 w-14">
      {[0, 90, 180, 270].map((deg) => (
        <span
          key={deg}
          className="absolute left-1/2 top-1/2 block h-[2px] w-2.5 rounded-full transition-all duration-75"
          style={{
            background: color,
            boxShadow: "0 0 3px rgba(0,0,0,.8)",
            transform: `translate(-50%,-50%) rotate(${deg}deg) translateX(${gap}px)`,
          }}
        />
      ))}
      <span className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: color }} />
      {hit && <span className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-sm border-2 border-rose-400/80" />}
    </div>
  );
}

function Minimap({ hud, expanded }: { hud: HudState; expanded: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = expanded ? 220 : 110;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    cv.width = size * dpr;
    cv.height = size * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    g.fillStyle = "rgba(8,13,22,.78)";
    g.fillRect(0, 0, size, size);

    const half = hud.minimap.half;
    const scale = size / (half * 2);
    const toXY = (x: number, z: number) => [size / 2 + x * scale, size / 2 + z * scale] as const;

    g.strokeStyle = "rgba(255,255,255,.12)";
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo((size / 4) * i, 0);
      g.lineTo((size / 4) * i, size);
      g.moveTo(0, (size / 4) * i);
      g.lineTo(size, (size / 4) * i);
      g.stroke();
    }

    for (const b of hud.minimap.blips) {
      const [x, y] = toXY(b.x, b.z);
      g.fillStyle = "#f87171";
      g.beginPath();
      g.arc(x, y, 3.2, 0, Math.PI * 2);
      g.fill();
    }

    const [sx, sy] = toXY(hud.minimap.self.x, hud.minimap.self.z);
    g.save();
    g.translate(sx, sy);
    g.rotate(-hud.minimap.self.yaw);
    g.fillStyle = "#38bdf8";
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.5, 5);
    g.lineTo(-4.5, 5);
    g.closePath();
    g.fill();
    g.restore();
  }, [hud, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="rounded-xl border border-white/15 shadow-lg" />;
}

function TouchBtn({
  onPress,
  action,
  label,
  sub,
  hold,
  big,
}: {
  onPress: (a: GameAction, down: boolean) => void;
  action: GameAction;
  label: string;
  sub: string;
  hold?: boolean;
  big?: boolean;
}) {
  const [down, setDown] = useState(false);
  const press = (v: boolean) => {
    setDown(v);
    if (hold) onPress(action, v);
    else if (v) {
      onPress(action, true);
      window.setTimeout(() => onPress(action, false), 60);
    }
  };
  return (
    <button
      aria-label={sub}
      onTouchStart={(e) => {
        e.preventDefault();
        press(true);
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        press(false);
      }}
      onMouseDown={() => press(true)}
      onMouseUp={() => press(false)}
      onMouseLeave={() => down && press(false)}
      className={cn(
        "pointer-events-auto grid place-items-center rounded-full border text-xl backdrop-blur transition",
        big ? "h-[72px] w-[72px] border-rose-300/50 bg-rose-500/30" : "h-[56px] w-[56px] border-white/15 bg-slate-900/60",
        down && "scale-95 bg-amber-400/40",
      )}
    >
      <span>{label}</span>
      <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">{sub}</span>
    </button>
  );
}

function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const idRef = useRef<number | null>(null);

  const update = (cx: number, cy: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = cx - (r.left + r.width / 2);
    const dy = cy - (r.top + r.height / 2);
    const max = r.width / 2;
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len / max);
    const nx = (dx / len) * k;
    const ny = (dy / len) * k;
    setKnob({ x: nx * max * 0.7, y: ny * max * 0.7 });
    onChange(nx, -ny);
  };

  return (
    <div
      ref={base}
      className="pointer-events-auto absolute bottom-5 left-5 h-[128px] w-[128px] touch-none rounded-full border border-white/15 bg-slate-900/40 backdrop-blur"
      onTouchStart={(e) => {
        const t = e.changedTouches[0];
        idRef.current = t.identifier;
        update(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        for (const t of Array.from(e.changedTouches)) if (t.identifier === idRef.current) update(t.clientX, t.clientY);
      }}
      onTouchEnd={() => {
        idRef.current = null;
        setKnob({ x: 0, y: 0 });
        onChange(0, 0);
      }}
    >
      <div
        className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-gradient-to-b from-slate-200/80 to-slate-500/70 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
