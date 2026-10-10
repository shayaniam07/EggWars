"use client";

/**
 * EGG WARS - Application shell.
 * Owns authentication state, the player bundle, the main menu and the match
 * lifecycle (engine creation, pause, results, reward submission).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Hud } from "./Hud";
import { CharacterPreview } from "./CharacterPreview";
import {
  AuthScreen,
  CharacterScreen,
  InventoryScreen,
  MissionsScreen,
  MultiplayerLobby,
  OfflineSetup,
  ProfileScreen,
  ResultsScreen,
  SettingsScreen,
  ShopScreen,
  TopUpScreen,
  type Ctx,
} from "./MenuScreens";
import { Btn, Panel, Pill, Toasts, cn } from "./ui";
import {
  api,
  ApiError,
  cacheGet,
  cacheSet,
  equippedItem,
  flushQueue,
  isMobileDevice,
  loadSettings,
  ownedLoadout,
  queueMatch,
  saveSettings,
  visualOf,
  type Catalog,
  type PlayerBundle,
  type User,
} from "@/lib/client-api";
import {
  GameClient,
  type GameSettings,
  type HudState,
  type MatchConfig,
  type MatchResultSummary,
} from "@/game/engine";
import type { GameAction } from "@/game/input";
import type { Difficulty } from "@/shared/weapons";

type Phase = "loading" | "auth" | "menu" | "game";
type Screen = null | "offline" | "multiplayer" | "character" | "inventory" | "shop" | "missions" | "settings" | "profile" | "topup";

export default function GameShell() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [bundle, setBundle] = useState<PlayerBundle | null>(null);
  const [screen, setScreen] = useState<Screen>(null);
  const [settings, setSettingsState] = useState<GameSettings>(() => loadSettings());
  const [hud, setHud] = useState<HudState | null>(null);
  const [result, setResult] = useState<MatchResultSummary | null>(null);
  const [rewardGold, setRewardGold] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string; tone?: string }[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameClient | null>(null);
  const pendingRef = useRef<MatchConfig | null>(null);
  const lastMatchRef = useRef<MatchConfig | null>(null);

  const toast = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  /* ------------------------------------------------------- bootstrap */
  const refresh = useCallback(async () => {
    const p = await api.player();
    setBundle(p);
    cacheSet("player", p);
  }, []);

  useEffect(() => {
    setIsMobile(isMobileDevice());
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    (async () => {
      try {
        const [cat, me] = await Promise.all([api.catalog(), api.me()]);
        setCatalog(cat);
        cacheSet("catalog", cat);
        if (me.user) {
          const p = await api.player();
          setBundle(p);
          cacheSet("player", p);
          setPhase("menu");
          const flushed = await flushQueue();
          if (flushed > 0) {
            toast(`Synced ${flushed} offline match result${flushed > 1 ? "s" : ""}`);
            await refresh().catch(() => {});
          }
        } else {
          setPhase("auth");
        }
      } catch (e) {
        // Offline fallback: boot the menu from the last cached snapshot.
        const cat = cacheGet<Catalog>("catalog");
        const p = cacheGet<PlayerBundle>("player");
        if (cat && p) {
          setCatalog(cat);
          setBundle(p);
          setPhase("menu");
          setBootError("You are offline — playing from cached data. Offline matches work; results sync later.");
        } else {
          setBootError(e instanceof ApiError ? e.message : "Could not reach the game server");
          setPhase("auth");
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSettings = useCallback((s: GameSettings) => {
    setSettingsState(s);
    saveSettings(s);
    engineRef.current?.setSettings(s);
  }, []);

  /* ------------------------------------------------------ match flow */
  const launch = useCallback((cfg: MatchConfig) => {
    pendingRef.current = cfg;
    lastMatchRef.current = cfg;
    setResult(null);
    setRewardGold(null);
    setPaused(false);
    setScreen(null);
    setPhase("game");
  }, []);

  const onEnd = useCallback(
    async (summary: MatchResultSummary) => {
      setResult(summary);
      try {
        if (summary.mode === "offline") {
          const r = await api.playerAction<{ rewardGold: number }>({
            action: "match",
            mapId: summary.mapId,
            difficulty: summary.difficulty,
            kills: summary.kills,
            deaths: summary.deaths,
            headshots: summary.headshots,
            damage: summary.damage,
            placement: summary.placement,
            won: summary.won,
            durationSec: summary.durationSec,
          });
          setRewardGold(r.rewardGold);
        } else {
          const online = lastMatchRef.current?.online;
          if (online) {
            const r = await api.mpResult({ roomId: online.roomId, playerId: online.playerId, secret: online.secret });
            setRewardGold(r.rewardGold);
          }
        }
        await refresh();
      } catch (e) {
        if (summary.mode === "offline") {
          queueMatch({
            mapId: summary.mapId,
            difficulty: summary.difficulty,
            kills: summary.kills,
            deaths: summary.deaths,
            headshots: summary.headshots,
            damage: summary.damage,
            placement: summary.placement,
            won: summary.won,
            durationSec: summary.durationSec,
          });
          toast("Offline — rewards queued and will sync when you reconnect");
        } else {
          toast(e instanceof ApiError ? e.message : "Could not save match rewards", "error");
        }
      }
    },
    [refresh, toast],
  );

  // Create the engine once the canvas exists.
  useEffect(() => {
    if (phase !== "game" || !canvasRef.current || !pendingRef.current) return;
    const cfg = pendingRef.current;
    pendingRef.current = null;
    const engine = new GameClient(canvasRef.current, {
      onHud: setHud,
      onEnd: (s) => void onEnd(s),
      onNotice: (m) => toast(m),
    });
    engineRef.current = engine;
    engine.setSettings(settings);
    void engine.start(cfg);
    if (!isMobileDevice()) window.setTimeout(() => engine.requestLock(), 320);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Esc toggles the pause overlay while in a match.
  useEffect(() => {
    if (phase !== "game") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setPaused((p) => {
          const next = !p;
          engineRef.current?.setPaused(next && (lastMatchRef.current?.mode ?? "offline") === "offline");
          if (!next) engineRef.current?.requestLock();
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  const exitToMenu = useCallback(() => {
    engineRef.current?.stop();
    setPhase("menu");
    setPaused(false);
    setResult(null);
    setHud(null);
    setRoomCode(null);
    void refresh().catch(() => {});
  }, [refresh]);

  /* --------------------------------------------------------- renders */
  if (phase === "loading") {
    return (
      <div className="ew-bg grid min-h-[100dvh] place-items-center">
        <div className="text-center">
          <div className="mb-3 animate-bounce text-6xl">🥚</div>
          <p className="text-sm font-bold uppercase tracking-[.3em] text-slate-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (phase === "auth" || !bundle || !catalog) {
    return (
      <>
        <AuthScreen
          gameName={catalog?.gameName ?? "EGG WARS"}
          onAuthed={async (u: User) => {
            try {
              const [cat, p] = await Promise.all([api.catalog(), api.player()]);
              setCatalog(cat);
              setBundle(p);
              setPhase("menu");
              toast(`Welcome, ${u.displayName}!`);
            } catch (e) {
              toast(e instanceof ApiError ? e.message : "Could not load your profile", "error");
            }
          }}
        />
        {bootError && (
          <p className="fixed bottom-3 left-1/2 w-[min(92vw,460px)] -translate-x-1/2 rounded-xl bg-rose-950/90 px-4 py-2 text-center text-xs text-rose-200">
            {bootError}
          </p>
        )}
        <Toasts items={toasts} />
      </>
    );
  }

  const ctx: Ctx = {
    user: bundle.user,
    catalog,
    inventory: bundle.inventory,
    missionProgress: bundle.missionProgress,
    payments: bundle.payments,
    recentMatches: bundle.recentMatches,
    refresh,
    toast,
    settings,
    setSettings,
  };

  const outfit = equippedItem(catalog.items, bundle.inventory, "outfit");
  const skin = equippedItem(catalog.items, bundle.inventory, "skin");
  const armor =
    (Number(equippedItem(catalog.items, bundle.inventory, "helmet")?.stats?.armor) || 0) +
    (Number(equippedItem(catalog.items, bundle.inventory, "vest")?.stats?.armor) || 0);

  const baseConfig = (mode: "offline" | "online", mapId: string, difficulty: Difficulty, loadout: string[]): MatchConfig => ({
    mode,
    mapId,
    difficulty,
    loadout,
    outfit: visualOf(outfit),
    playerName: bundle.user.displayName,
    armor: Math.min(100, armor),
    weaponTint: typeof skin?.stats?.tint === "number" ? skin.stats.tint : undefined,
    matchSeconds: 300,
    scoreLimit: 25,
  });

  /* ------------------------------------------------------------ GAME */
  if (phase === "game") {
    return (
      <div className="relative h-[100dvh] w-full overflow-hidden bg-black">
        <canvas ref={canvasRef} className="block h-full w-full touch-none" onClick={() => !paused && engineRef.current?.requestLock()} />
        {hud && (
          <Hud
            hud={{ ...hud, fps: settings.showFps ? hud.fps : 0 }}
            isMobile={isMobile}
            gameName={catalog.gameName}
            onButton={(a: GameAction, down: boolean) => engineRef.current?.input.setButton(a, down)}
            onJoystick={(x, y) => engineRef.current?.input.setJoystick(x, y)}
            onChat={(m) => engineRef.current?.sendChat(m)}
            onPause={() => {
              setPaused(true);
              engineRef.current?.setPaused((lastMatchRef.current?.mode ?? "offline") === "offline");
            }}
          />
        )}

        {roomCode && hud?.matchState === "countdown" && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-xl border border-white/15 bg-slate-950/80 px-4 py-2 text-xs text-slate-200">
            Invite code: <span className="font-mono font-black text-amber-300">{roomCode}</span>
          </div>
        )}

        {paused && !result && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-black/75 p-4 backdrop-blur">
            <Panel className="w-full max-w-sm text-center" title="Paused">
              <p className="mb-3 text-[11px] text-slate-400">
                {lastMatchRef.current?.mode === "online"
                  ? "Online matches keep running on the server while this menu is open."
                  : "The offline match is frozen."}
              </p>
              <div className="space-y-2">
                <Btn
                  className="w-full"
                  variant="gold"
                  onClick={() => {
                    setPaused(false);
                    engineRef.current?.setPaused(false);
                    engineRef.current?.requestLock();
                  }}
                >
                  Resume
                </Btn>
                <Btn className="w-full" variant="ghost" onClick={() => setScreen("settings")}>Settings</Btn>
                <Btn className="w-full" variant="danger" onClick={exitToMenu}>Leave match</Btn>
              </div>
            </Panel>
          </div>
        )}

        {result && (
          <ResultsScreen
            result={result}
            rewardGold={rewardGold}
            onMenu={exitToMenu}
            onReplay={() => {
              const cfg = lastMatchRef.current;
              engineRef.current?.stop();
              setResult(null);
              if (cfg && cfg.mode === "offline") {
                setPhase("menu");
                window.setTimeout(() => launch(cfg), 60);
              } else {
                exitToMenu();
              }
            }}
          />
        )}

        {screen === "settings" && <SettingsScreen ctx={ctx} onClose={() => setScreen(null)} />}
        <Toasts items={toasts} />
      </div>
    );
  }

  /* ------------------------------------------------------------ MENU */
  const navItems: { id: Screen; label: string; icon: string }[] = [
    { id: "character", label: "Character", icon: "🧍" },
    { id: "inventory", label: "Inventory", icon: "🎒" },
    { id: "shop", label: "Shop", icon: "🛒" },
    { id: "missions", label: "Missions", icon: "🎯" },
    { id: "settings", label: "Settings", icon: "⚙️" },
    { id: "profile", label: "Profile", icon: "👤" },
  ];

  return (
    <div className="ew-bg min-h-[100dvh] w-full">
      {/* top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950/70 px-3 py-2 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-amber-300 to-amber-600 text-xl">🥚</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black leading-tight">{bundle.user.displayName}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Level {bundle.user.level}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Pill icon="🪙" value={bundle.user.gold} />
          <Pill icon="💎" value={bundle.user.diamonds} tone="diamond" />
          <button
            onClick={() => setScreen("topup")}
            title="Buy diamonds"
            className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-500/20 text-sm ring-1 ring-cyan-300/30 hover:bg-cyan-500/30"
          >
            ＋
          </button>
          {(bundle.user.role === "admin" || bundle.user.role === "moderator") && (
            <Link href="/admin" className="grid h-8 w-8 place-items-center rounded-lg bg-rose-500/20 text-sm ring-1 ring-rose-300/30 hover:bg-rose-500/30" title="Admin panel">
              🛡️
            </Link>
          )}
        </div>
      </header>

      {bootError && (
        <p className="mx-3 mt-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-center text-[11px] font-semibold text-amber-200">
          {bootError}
        </p>
      )}

      <main className="mx-auto grid max-w-6xl gap-4 p-3 lg:grid-cols-[220px_1fr_300px]">
        {/* nav */}
        <nav className="order-2 grid grid-cols-3 gap-2 lg:order-1 lg:grid-cols-1 lg:content-start">
          {navItems.map((n) => (
            <button
              key={n.id}
              onClick={() => setScreen(n.id)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5 text-left text-xs font-bold transition hover:border-amber-300/40 hover:bg-slate-800/70 active:scale-[.98]"
            >
              <span className="text-base">{n.icon}</span>
              <span className="truncate">{n.label}</span>
            </button>
          ))}
        </nav>

        {/* hero + character */}
        <section className="order-1 lg:order-2">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-sky-900/40 via-slate-900/60 to-slate-950/80 p-4">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl" />
            <h1 className="ew-title text-center text-4xl sm:text-5xl">{catalog.gameName}</h1>
            <p className="mt-1 text-center text-[10px] font-bold uppercase tracking-[.25em] text-slate-400">{catalog.tagline}</p>
            <CharacterPreview visual={visualOf(outfit)} weaponId={ownedLoadout(catalog.items, bundle.inventory)[0]} tint={typeof skin?.stats?.tint === "number" ? skin.stats.tint : undefined} height={260} />
            <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-slate-400">
              <span>{outfit?.name ?? "Recruit Egg"}</span>
              <button onClick={() => setScreen("character")} className="rounded-lg bg-white/10 px-2 py-1 font-bold text-slate-200 hover:bg-white/20">
                Change outfit
              </button>
            </div>
          </div>
        </section>

        {/* play panel */}
        <section className="order-3 space-y-3">
          <Panel title="Game modes" className="bg-slate-900/60">
            <div className="space-y-2">
              <button
                onClick={() => setScreen("offline")}
                className="group flex w-full items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-left transition hover:bg-emerald-500/20"
              >
                <span className="text-2xl">🤖</span>
                <span className="min-w-0">
                  <span className="block text-sm font-black">OFFLINE MODE</span>
                  <span className="block text-[11px] text-slate-300">Play vs NPCs · 3 difficulties · no internet needed</span>
                </span>
              </button>
              <button
                onClick={() => setScreen("multiplayer")}
                className="group flex w-full items-center gap-3 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-3 text-left transition hover:bg-sky-500/20"
              >
                <span className="text-2xl">🌐</span>
                <span className="min-w-0">
                  <span className="block text-sm font-black">MULTIPLAYER</span>
                  <span className="block text-[11px] text-slate-300">Real players · server-authoritative rooms</span>
                </span>
              </button>
            </div>
          </Panel>

          <Btn
            size="lg"
            variant="gold"
            className="w-full py-5 text-xl"
            onClick={() => setScreen("offline")}
          >
            ▶ PLAY
          </Btn>

          <Panel title="Daily missions" className="bg-slate-900/60">
            <div className="space-y-1.5">
              {catalog.missions.filter((m) => m.type === "daily").slice(0, 3).map((m) => {
                const p = bundle.missionProgress.find((x) => x.missionKey === m.key);
                return (
                  <div key={m.key} className="text-[11px]">
                    <div className="flex justify-between">
                      <span className="truncate text-slate-300">{m.title}</span>
                      <span className="font-bold text-amber-300">{Math.min(p?.progress ?? 0, m.goal)}/{m.goal}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/50">
                      <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, ((p?.progress ?? 0) / m.goal) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <Btn size="sm" variant="ghost" className="mt-2 w-full" onClick={() => setScreen("missions")}>
              View all missions
            </Btn>
          </Panel>
        </section>
      </main>

      <footer className="px-4 pb-6 text-center text-[10px] text-slate-600">
        {catalog.gameName} · original egg-soldier shooter · {isMobile ? "touch controls enabled" : "WASD · Mouse · Space · Shift · C · R · E · Tab"}
      </footer>

      {/* screens */}
      {screen === "offline" && (
        <OfflineSetup
          ctx={ctx}
          onClose={() => setScreen(null)}
          onStart={({ mapId, difficulty, loadout }) => launch(baseConfig("offline", mapId, difficulty, loadout))}
        />
      )}
      {screen === "multiplayer" && (
        <MultiplayerLobby
          ctx={ctx}
          onClose={() => setScreen(null)}
          onJoin={(info) => {
            setRoomCode(info.code);
            launch({
              ...baseConfig("online", info.mapId, "medium", ownedLoadout(catalog.items, bundle.inventory)),
              online: { roomId: info.roomId, playerId: info.playerId, secret: info.secret },
            });
          }}
        />
      )}
      {screen === "character" && <CharacterScreen ctx={ctx} onClose={() => setScreen(null)} />}
      {screen === "inventory" && <InventoryScreen ctx={ctx} onClose={() => setScreen(null)} />}
      {screen === "shop" && <ShopScreen ctx={ctx} onClose={() => setScreen(null)} onTopUp={() => setScreen("topup")} />}
      {screen === "missions" && <MissionsScreen ctx={ctx} onClose={() => setScreen(null)} />}
      {screen === "settings" && <SettingsScreen ctx={ctx} onClose={() => setScreen(null)} />}
      {screen === "topup" && <TopUpScreen ctx={ctx} onClose={() => setScreen(null)} />}
      {screen === "profile" && (
        <ProfileScreen
          ctx={ctx}
          onClose={() => setScreen(null)}
          onLogout={async () => {
            await api.logout().catch(() => {});
            setBundle(null);
            setPhase("auth");
          }}
        />
      )}
      <Toasts items={toasts} />
      <div className={cn("hidden", screen === null && "hidden")} />
    </div>
  );
}
