"use client";

/** EGG WARS - All out-of-match screens. Every button has a real action. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CharacterPreview } from "./CharacterPreview";
import { Bar, Btn, Field, ItemIcon, Modal, Panel, Pill, RarityChip, cn, inputCls } from "./ui";
import {
  api,
  ApiError,
  equippedItem,
  visualOf,
  type Catalog,
  type Item,
  type InventoryRow,
  type MissionProgressRow,
  type PaymentRow,
  type MatchRow,
  type RoomInfo,
  type User,
} from "@/lib/client-api";
import { ACTION_LABELS, DEFAULT_BINDINGS } from "@/game/input";
import type { GameSettings, MatchResultSummary } from "@/game/engine";
import { CATEGORY_META, type ItemCategory } from "@/shared/catalog";
import { DIFFICULTIES, WEAPONS, type Difficulty } from "@/shared/weapons";

export type Ctx = {
  user: User;
  catalog: Catalog;
  inventory: InventoryRow[];
  missionProgress: MissionProgressRow[];
  payments: PaymentRow[];
  recentMatches: MatchRow[];
  refresh: () => Promise<void>;
  toast: (msg: string, tone?: "ok" | "error") => void;
  settings: GameSettings;
  setSettings: (s: GameSettings) => void;
};

/* ==================================================================== */
/*  AUTH                                                                 */
/* ==================================================================== */
type GoogleIdApi = {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
      renderButton: (el: HTMLElement, o: Record<string, string | number>) => void;
    };
  };
};
type FacebookApi = {
  init: (o: { appId: string; version: string; cookie: boolean; xfbml: boolean }) => void;
  login: (cb: (r: { authResponse?: { accessToken: string } }) => void, o: { scope: string }) => void;
};

export function AuthScreen({ onAuthed, gameName }: { onAuthed: (u: User) => void; gameName: string }) {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<{ google: boolean; googleClientId: string; facebook: boolean; facebookAppId: string } | null>(null);
  const googleHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.providers().then(setProviders).catch(() => setProviders(null));
  }, []);

  // Google Identity Services — rendered only when a client ID is configured.
  useEffect(() => {
    if (!providers?.google || !googleHost.current) return;
    const id = "gsi-script";
    const run = () => {
      const g = (window as unknown as { google?: GoogleIdApi }).google;
      if (!g || !googleHost.current) return;
      g.accounts.id.initialize({
        client_id: providers.googleClientId,
        callback: async (resp) => {
          try {
            setBusy(true);
            const r = await api.google(resp.credential);
            onAuthed(r.user);
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Google sign-in failed");
          } finally {
            setBusy(false);
          }
        },
      });
      g.accounts.id.renderButton(googleHost.current, { theme: "filled_black", size: "large", width: 280, text: "continue_with" });
    };
    if (document.getElementById(id)) run();
    else {
      const s = document.createElement("script");
      s.id = id;
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = run;
      document.head.appendChild(s);
    }
  }, [providers, onAuthed]);

  const facebookLogin = () => {
    if (!providers?.facebook) return;
    const start = () => {
      const FB = (window as unknown as { FB?: FacebookApi }).FB;
      if (!FB) return;
      FB.init({ appId: providers.facebookAppId, version: "v19.0", cookie: true, xfbml: false });
      FB.login(
        async (r) => {
          if (!r.authResponse) return;
          try {
            setBusy(true);
            const res = await api.facebook(r.authResponse.accessToken);
            onAuthed(res.user);
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Facebook sign-in failed");
          } finally {
            setBusy(false);
          }
        },
        { scope: "public_profile,email" },
      );
    };
    if ((window as unknown as { FB?: FacebookApi }).FB) start();
    else {
      const s = document.createElement("script");
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true;
      s.onload = start;
      document.head.appendChild(s);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = tab === "login" ? await api.login(email, password) : await api.signup(email, password, name || email.split("@")[0]);
      onAuthed(r.user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const guest = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.guest();
      onAuthed(r.user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start guest session");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ew-bg flex min-h-[100dvh] items-center justify-center p-4">
      <div className="ew-pop w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-2xl backdrop-blur-xl">
        <div className="mb-5 text-center">
          <div className="mb-2 text-6xl">🥚</div>
          <h1 className="ew-title text-4xl">{gameName}</h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[.25em] text-slate-400">Shoot · Survive · Win</p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
          {(["login", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("rounded-lg py-2 text-xs font-black uppercase tracking-wider transition", tab === t ? "bg-sky-500 text-white" : "text-slate-400")}
            >
              {t === "login" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {tab === "signup" && (
            <Field label="Display name">
              <input className={inputCls} value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="EggSlayer99" />
            </Field>
          )}
          <Field label="Email">
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Password" hint={tab === "signup" ? "At least 8 characters" : undefined}>
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••••••"
            />
          </Field>
          {error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-300">{error}</p>}
          <Btn onClick={submit} loading={busy} size="lg" className="w-full">
            {tab === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
          </Btn>
        </div>

        <div className="my-4 flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">
          <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
        </div>

        <div className="space-y-2">
          {providers?.google ? (
            <div ref={googleHost} className="flex justify-center" />
          ) : (
            <Btn variant="ghost" className="w-full" disabled title="Set GOOGLE_CLIENT_ID on the server to enable Google sign-in">
              🔒 Google sign-in not configured
            </Btn>
          )}
          {providers?.facebook ? (
            <Btn variant="dark" className="w-full" onClick={facebookLogin}>
              f Continue with Facebook
            </Btn>
          ) : (
            <Btn variant="ghost" className="w-full" disabled title="Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to enable Facebook sign-in">
              🔒 Facebook sign-in not configured
            </Btn>
          )}
          <Btn variant="gold" className="w-full" onClick={guest} loading={busy}>
            ▶ PLAY AS GUEST
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================== */
/*  PLAY SETUP                                                           */
/* ==================================================================== */
export function OfflineSetup({
  ctx,
  onStart,
  onClose,
}: {
  ctx: Ctx;
  onStart: (o: { mapId: string; difficulty: Difficulty; loadout: string[] }) => void;
  onClose: () => void;
}) {
  const ownedWeapons = useMemo(() => {
    const ids = new Set(ctx.inventory.map((i) => i.itemId));
    return ctx.catalog.items.filter((i) => i.category === "weapon" && ids.has(i.id) && i.stats?.weaponId);
  }, [ctx.catalog.items, ctx.inventory]);

  const [mapId, setMapId] = useState(ctx.catalog.maps[0]?.id ?? "island");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [loadout, setLoadout] = useState<string[]>(() => ownedWeapons.slice(0, 2).map((w) => String(w.stats.weaponId)));

  const toggle = (wid: string) => {
    setLoadout((cur) => (cur.includes(wid) ? cur.filter((x) => x !== wid) : cur.length >= 3 ? cur : [...cur, wid]));
  };

  return (
    <Modal open onClose={onClose} title="Offline Match — vs NPCs" wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">Runs fully on your device · no internet required</p>
          <Btn variant="gold" size="lg" onClick={() => onStart({ mapId, difficulty, loadout: loadout.length ? loadout : ["cluck9"] })}>
            ▶ START MATCH
          </Btn>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">1 · Choose map</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ctx.catalog.maps.map((m) => (
              <button
                key={m.id}
                onClick={() => setMapId(m.id)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  mapId === m.id ? "border-amber-300/70 bg-amber-400/15" : "border-white/10 bg-white/5 hover:bg-white/10",
                )}
              >
                <div className="text-2xl">{m.emoji}</div>
                <div className="mt-1 text-sm font-bold text-white">{m.name}</div>
                <div className="text-[10px] leading-tight text-slate-400">{m.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">2 · NPC difficulty</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {Object.values(DIFFICULTIES).map((d) => (
              <button
                key={d.id}
                onClick={() => setDifficulty(d.id)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  difficulty === d.id ? "border-white/40 bg-white/10" : "border-white/10 bg-white/5 hover:bg-white/10",
                )}
                style={difficulty === d.id ? { boxShadow: `inset 0 0 0 2px ${d.color}` } : undefined}
              >
                <div className="text-sm font-black" style={{ color: d.color }}>{d.label}</div>
                <ul className="mt-1 space-y-0.5 text-[10px] text-slate-400">
                  <li>• {d.botCount} NPCs · {d.botHealth} HP</li>
                  <li>• Reaction {d.reaction.toFixed(2)}s · aim error ±{(d.aimError * 100).toFixed(1)}°</li>
                  <li>• Cover use {Math.round(d.coverBias * 100)}% · speed {Math.round(d.moveScale * 100)}%</li>
                </ul>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">3 · Loadout (up to 3)</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ownedWeapons.map((w) => {
              const def = WEAPONS[String(w.stats.weaponId)];
              const active = loadout.includes(String(w.stats.weaponId));
              return (
                <button
                  key={w.id}
                  onClick={() => toggle(String(w.stats.weaponId))}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border p-2 text-left transition",
                    active ? "border-sky-400/70 bg-sky-400/15" : "border-white/10 bg-white/5 hover:bg-white/10",
                  )}
                >
                  <ItemIcon emoji={w.emoji} iconUrl={w.iconUrl} color={w.colorPrimary} size={40} name={w.name} />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold">{w.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {def ? `${def.damage} dmg · ${def.rps}/s · ${def.mag} rds` : "—"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {!ownedWeapons.length && <p className="text-xs text-slate-400">You own no weapons. Visit the shop to buy one.</p>}
        </div>
      </div>
    </Modal>
  );
}

export function MultiplayerLobby({
  ctx,
  onJoin,
  onClose,
}: {
  ctx: Ctx;
  onJoin: (info: { roomId: string; playerId: string; secret: string; mapId: string; code: string }) => void;
  onClose: () => void;
}) {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [mapId, setMapId] = useState(ctx.catalog.maps[0]?.id ?? "island");
  const [mode, setMode] = useState<"ffa" | "tdm">("ffa");
  const [roomName, setRoomName] = useState(`${ctx.user.displayName}'s Arena`);
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.rooms();
      setRooms(r.rooms);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const join = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const loadout = ctx.catalog.items
        .filter((i) => i.category === "weapon" && ctx.inventory.some((v) => v.itemId === i.id) && i.stats?.weaponId)
        .map((i) => String(i.stats.weaponId))
        .slice(0, 3);
      const r = await api.joinRoom({ mapId, mode, loadout, ...body });
      onJoin({ roomId: r.roomId, playerId: r.playerId, secret: r.secret, mapId: r.mapId, code: r.code });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not join the match");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Multiplayer — real players" wide>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Quick match" className="bg-slate-900/50">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Map">
                <select className={inputCls} value={mapId} onChange={(e) => setMapId(e.target.value)}>
                  {ctx.catalog.maps.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Mode">
                <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as "ffa" | "tdm")}>
                  <option value="ffa">Free-for-all</option>
                  <option value="tdm">Team deathmatch</option>
                </select>
              </Field>
            </div>
            <Btn variant="gold" className="w-full" size="lg" loading={busy} onClick={() => join({})}>
              ⚡ QUICK MATCH
            </Btn>
            <p className="text-[11px] text-slate-400">
              Matches start when 2+ real players are in the room. Server-authoritative: the server validates movement,
              fire rate, ammo and damage.
            </p>
          </div>
        </Panel>

        <Panel title="Create / join a room" className="bg-slate-900/50">
          <div className="space-y-3">
            <Field label="Room name">
              <input className={inputCls} value={roomName} maxLength={40} onChange={(e) => setRoomName(e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              Private room (invite code only)
            </label>
            <Btn className="w-full" loading={busy} onClick={() => join({ create: true, name: roomName, isPrivate })}>
              ➕ Create room
            </Btn>
            <div className="flex gap-2">
              <input
                className={inputCls}
                placeholder="Invite code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
              />
              <Btn variant="ghost" disabled={!code} loading={busy} onClick={() => join({ code })}>
                Join
              </Btn>
            </div>
          </div>
        </Panel>

        <div className="lg:col-span-2">
          <Panel title={`Open rooms (${rooms.length})`} className="bg-slate-900/50" right={<Btn size="sm" variant="ghost" onClick={load}>↻ Refresh</Btn>}>
            {status === "error" && <p className="text-xs text-rose-300">Could not reach the game server.</p>}
            {!rooms.length && status !== "error" && (
              <p className="py-3 text-center text-xs text-slate-400">
                No public rooms yet — create one, then open the game in a second browser/device and join it.
              </p>
            )}
            <div className="space-y-2">
              {rooms.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{r.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {r.mapId} · {r.mode.toUpperCase()} · {r.state} · {r.players}/{r.maxPlayers} players
                    </div>
                  </div>
                  <Btn size="sm" disabled={r.players >= r.maxPlayers} loading={busy} onClick={() => join({ roomId: r.id })}>
                    {r.players >= r.maxPlayers ? "Full" : "Join"}
                  </Btn>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        {error && <p className="lg:col-span-2 rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-300">{error}</p>}
      </div>
    </Modal>
  );
}

/* ==================================================================== */
/*  CHARACTER / INVENTORY / SHOP                                         */
/* ==================================================================== */
export function CharacterScreen({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const owned = new Set(ctx.inventory.map((i) => i.itemId));
  const outfits = ctx.catalog.items.filter((i) => i.category === "outfit");
  const equipped = equippedItem(ctx.catalog.items, ctx.inventory, "outfit");
  const [selected, setSelected] = useState<Item | undefined>(equipped ?? outfits[0]);
  const [busy, setBusy] = useState(false);
  const skin = equippedItem(ctx.catalog.items, ctx.inventory, "skin");

  const equip = async (item: Item) => {
    setBusy(true);
    try {
      await api.playerAction({ action: "equip", itemId: item.id });
      await ctx.refresh();
      ctx.toast(`${item.name} equipped`);
    } catch (e) {
      ctx.toast(e instanceof ApiError ? e.message : "Could not equip", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Character" wide>
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div>
          <CharacterPreview
            visual={visualOf(selected)}
            weaponId={String(ctx.catalog.items.find((i) => i.category === "weapon" && owned.has(i.id))?.stats?.weaponId ?? "yolk_ar")}
            tint={typeof skin?.stats?.tint === "number" ? skin.stats.tint : undefined}
            height={300}
          />
          <p className="mt-2 text-center text-[11px] text-slate-400">Drag to rotate</p>
          {selected && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-black">{selected.name}</h4>
                <RarityChip rarity={selected.rarity} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{selected.description}</p>
              <div className="mt-3">
                {owned.has(selected.id) ? (
                  <Btn
                    className="w-full"
                    variant={equipped?.id === selected.id ? "ghost" : "primary"}
                    disabled={equipped?.id === selected.id || busy}
                    onClick={() => equip(selected)}
                  >
                    {equipped?.id === selected.id ? "✓ Equipped" : "Equip"}
                  </Btn>
                ) : (
                  <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-center text-[11px] font-bold text-amber-300">
                    {selected.unlock === "mission" ? "Unlock by completing its mission" : "Buy in the shop to unlock"}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:max-h-[420px] md:overflow-y-auto">
          {outfits.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelected(o)}
              className={cn(
                "relative rounded-xl border p-2 text-left transition",
                selected?.id === o.id ? "border-amber-300/70 bg-amber-400/10" : "border-white/10 bg-white/5 hover:bg-white/10",
              )}
            >
              <ItemIcon emoji={o.emoji} iconUrl={o.iconUrl} color={o.colorPrimary} size={56} name={o.name} />
              <div className="mt-1.5 truncate text-xs font-bold">{o.name}</div>
              <RarityChip rarity={o.rarity} />
              {!owned.has(o.id) && <span className="absolute right-1.5 top-1.5 text-xs">🔒</span>}
              {equippedItem(ctx.catalog.items, ctx.inventory, "outfit")?.id === o.id && (
                <span className="absolute right-1.5 top-1.5 rounded bg-emerald-500/80 px-1 text-[9px] font-black">ON</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function InventoryScreen({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const owned = ctx.inventory;
  const [busy, setBusy] = useState<string | null>(null);
  const byCat = useMemo(() => {
    const map = new Map<ItemCategory, Item[]>();
    for (const row of owned) {
      const item = ctx.catalog.items.find((i) => i.id === row.itemId);
      if (!item) continue;
      const arr = map.get(item.category) ?? [];
      arr.push(item);
      map.set(item.category, arr);
    }
    return map;
  }, [owned, ctx.catalog.items]);

  const equip = async (item: Item) => {
    setBusy(item.id);
    try {
      await api.playerAction({ action: "equip", itemId: item.id });
      await ctx.refresh();
      ctx.toast(`${item.name} equipped`);
    } catch (e) {
      ctx.toast(e instanceof ApiError ? e.message : "Could not equip", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={onClose} title="Inventory" wide>
      {![...byCat.keys()].length && <p className="text-sm text-slate-400">Your backpack is empty.</p>}
      <div className="space-y-5">
        {[...byCat.entries()].map(([cat, list]) => (
          <div key={cat}>
            <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">
              {CATEGORY_META[cat]?.emoji} {CATEGORY_META[cat]?.label ?? cat}
            </h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((item) => {
                const row = owned.find((o) => o.itemId === item.id);
                const equippable = ["outfit", "helmet", "vest", "backpack", "skin"].includes(item.category);
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2">
                    <ItemIcon emoji={item.emoji} iconUrl={item.iconUrl} color={item.colorPrimary} size={48} name={item.name} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold">{item.name}</div>
                      <RarityChip rarity={item.rarity} />
                      <p className="mt-0.5 truncate text-[10px] text-slate-500">{item.description}</p>
                    </div>
                    {equippable && (
                      <Btn
                        size="sm"
                        variant={row?.equipped ? "ghost" : "primary"}
                        disabled={row?.equipped || busy === item.id}
                        onClick={() => equip(item)}
                      >
                        {row?.equipped ? "✓" : "Equip"}
                      </Btn>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function ShopScreen({ ctx, onClose, onTopUp }: { ctx: Ctx; onClose: () => void; onTopUp: () => void }) {
  const [cat, setCat] = useState<ItemCategory | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const owned = new Set(ctx.inventory.map((i) => i.itemId));
  const list = ctx.catalog.items.filter((i) => i.unlock === "shop" && (cat === "all" || i.category === cat));

  const buy = async (item: Item, currency: "gold" | "diamonds") => {
    setBusy(item.id);
    try {
      await api.playerAction({ action: "buy", itemId: item.id, currency });
      await ctx.refresh();
      ctx.toast(`Purchased ${item.name}`);
    } catch (e) {
      ctx.toast(e instanceof ApiError ? e.message : "Purchase failed", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Shop"
      wide
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Pill icon="🪙" value={ctx.user.gold} />
            <Pill icon="💎" value={ctx.user.diamonds} tone="diamond" />
          </div>
          <Btn variant="diamond" size="sm" onClick={onTopUp}>💎 Top up diamonds</Btn>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["all", ...Object.keys(CATEGORY_META)] as (ItemCategory | "all")[]).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition",
              cat === c ? "bg-sky-500 text-white" : "bg-white/5 text-slate-400 hover:bg-white/10",
            )}
          >
            {c === "all" ? "All" : CATEGORY_META[c].label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((item) => {
          const have = owned.has(item.id);
          return (
            <div key={item.id} className={cn("rounded-xl border p-3", item.featured ? "border-amber-300/40 bg-amber-400/5" : "border-white/10 bg-white/5")}>
              <div className="flex gap-3">
                <ItemIcon emoji={item.emoji} iconUrl={item.iconUrl} color={item.colorPrimary} size={56} name={item.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="truncate text-sm font-bold">{item.name}</h4>
                    {item.featured && <span className="text-[9px] font-black text-amber-300">HOT</span>}
                  </div>
                  <RarityChip rarity={item.rarity} />
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{item.description}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {have ? (
                  <Btn size="sm" variant="ghost" className="w-full" disabled>✓ Owned</Btn>
                ) : (
                  <>
                    {item.priceGold > 0 && (
                      <Btn size="sm" variant="gold" className="flex-1" loading={busy === item.id} onClick={() => buy(item, "gold")}>
                        🪙 {item.priceGold.toLocaleString()}
                      </Btn>
                    )}
                    {item.priceDiamonds > 0 && (
                      <Btn size="sm" variant="diamond" className="flex-1" loading={busy === item.id} onClick={() => buy(item, "diamonds")}>
                        💎 {item.priceDiamonds.toLocaleString()}
                      </Btn>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

/* ==================================================================== */
/*  MISSIONS / PROFILE / SETTINGS / TOPUP                                */
/* ==================================================================== */
export function MissionsScreen({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const claim = async (key: string) => {
    setBusy(key);
    try {
      const r = await api.playerAction<{ reward: { gold: number; diamonds: number } }>({ action: "claim", missionKey: key });
      await ctx.refresh();
      ctx.toast(`Claimed 🪙${r.reward.gold}${r.reward.diamonds ? ` + 💎${r.reward.diamonds}` : ""}`);
    } catch (e) {
      ctx.toast(e instanceof ApiError ? e.message : "Could not claim", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={onClose} title="Missions" wide>
      <div className="space-y-4">
        {["daily", "weekly", "career"].map((type) => {
          const list = ctx.catalog.missions.filter((m) => m.type === type);
          if (!list.length) return null;
          return (
            <div key={type}>
              <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">{type} tasks</h4>
              <div className="space-y-2">
                {list.map((m) => {
                  const prog = ctx.missionProgress.find((p) => p.missionKey === m.key);
                  const value = prog?.progress ?? 0;
                  const done = value >= m.goal;
                  return (
                    <div key={m.key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-bold">{m.title}</div>
                          <p className="text-[11px] text-slate-400">{m.description}</p>
                        </div>
                        <div className="shrink-0 text-right text-[11px] font-bold">
                          <div className="text-amber-300">🪙 {m.rewardGold}</div>
                          {m.rewardDiamonds > 0 && <div className="text-cyan-300">💎 {m.rewardDiamonds}</div>}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex-1">
                          <Bar value={value} max={m.goal} color={done ? "#22c55e" : "#38bdf8"} />
                        </div>
                        <span className="w-16 text-right text-[11px] font-bold text-slate-400">{Math.min(value, m.goal)}/{m.goal}</span>
                        <Btn size="sm" variant={done && !prog?.claimed ? "gold" : "ghost"} disabled={!done || prog?.claimed || busy === m.key} onClick={() => claim(m.key)}>
                          {prog?.claimed ? "Claimed" : done ? "Claim" : "Locked"}
                        </Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function ProfileScreen({ ctx, onClose, onLogout }: { ctx: Ctx; onClose: () => void; onLogout: () => void }) {
  const u = ctx.user;
  const kd = u.deaths ? (u.kills / u.deaths).toFixed(2) : String(u.kills);
  return (
    <Modal open onClose={onClose} title="Profile">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-b from-amber-300 to-amber-600 text-3xl">🥚</div>
          <div>
            <div className="text-lg font-black">{u.displayName}</div>
            <div className="text-[11px] text-slate-400">{u.email}</div>
            <div className="mt-1 flex gap-2">
              <Pill icon="⭐" value={`Lv ${u.level}`} tone="slate" />
              <Pill icon="🪙" value={u.gold} />
              <Pill icon="💎" value={u.diamonds} tone="diamond" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Kills", u.kills],
            ["Deaths", u.deaths],
            ["K/D", kd],
            ["Wins", u.wins],
            ["Matches", u.matches],
            ["Headshots", u.headshots],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-white/10 bg-white/5 p-2">
              <div className="text-base font-black text-amber-300">{value}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
            </div>
          ))}
        </div>
        <div>
          <h4 className="mb-1.5 text-xs font-black uppercase tracking-widest text-slate-400">XP progress</h4>
          <Bar value={u.xp % 1000} max={1000} color="#a855f7" />
          <p className="mt-1 text-[11px] text-slate-500">{u.xp % 1000}/1000 to level {u.level + 1}</p>
        </div>
        <div>
          <h4 className="mb-1.5 text-xs font-black uppercase tracking-widest text-slate-400">Recent matches</h4>
          <div className="space-y-1">
            {ctx.recentMatches.length === 0 && <p className="text-[11px] text-slate-500">No matches yet.</p>}
            {ctx.recentMatches.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px]">
                <span className="font-bold">{m.mode === "multiplayer" ? "🌐" : "🤖"} {m.mapId}</span>
                <span className="text-slate-400">{m.kills}K / {m.deaths}D</span>
                <span className={m.won ? "font-bold text-emerald-400" : "text-slate-500"}>{m.won ? "WIN" : "—"}</span>
                <span className="font-bold text-amber-300">+🪙{m.rewardGold}</span>
              </div>
            ))}
          </div>
        </div>
        <Btn variant="danger" className="w-full" onClick={onLogout}>Sign out</Btn>
      </div>
    </Modal>
  );
}

export function SettingsScreen({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [s, setS] = useState<GameSettings>(ctx.settings);
  const [rebinding, setRebinding] = useState<string | null>(null);

  useEffect(() => {
    if (!rebinding) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      setS((cur) => ({ ...cur, bindings: { ...cur.bindings, [rebinding]: e.code } }));
      setRebinding(null);
    };
    window.addEventListener("keydown", onKey, { once: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [rebinding]);

  const apply = () => {
    ctx.setSettings(s);
    void api.playerAction({ action: "settings", settings: s as unknown as Record<string, unknown> }).catch(() => {});
    ctx.toast("Settings saved");
    onClose();
  };

  const row = (label: string, node: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs font-semibold text-slate-300">{label}</span>
      {node}
    </div>
  );
  const slider = (key: keyof GameSettings, min: number, max: number, step: number) => (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(s[key])}
        onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })}
        className="w-36 accent-sky-400"
      />
      <span className="w-10 text-right text-[11px] font-mono text-slate-400">{Number(s[key]).toFixed(2)}</span>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Settings"
      wide
      footer={
        <div className="flex justify-between gap-2">
          <Btn variant="ghost" onClick={() => setS({ ...s, bindings: { ...DEFAULT_BINDINGS } })}>Reset keys</Btn>
          <Btn variant="gold" onClick={apply}>Save settings</Btn>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Audio" className="bg-slate-900/50">
          {row("Master volume", slider("masterVolume", 0, 1, 0.05))}
          {row("Music volume", slider("musicVolume", 0, 1, 0.05))}
          {row("SFX volume", slider("sfxVolume", 0, 1, 0.05))}
        </Panel>
        <Panel title="Controls" className="bg-slate-900/50">
          {row("Mouse sensitivity", slider("sensitivity", 0.2, 3, 0.05))}
          {row("Aim (ADS) sensitivity", slider("adsSensitivity", 0.2, 2, 0.05))}
          {row(
            "Invert Y axis",
            <input type="checkbox" checked={s.invertY} onChange={(e) => setS({ ...s, invertY: e.target.checked })} className="h-4 w-4 accent-sky-400" />,
          )}
        </Panel>
        <Panel title="Graphics" className="bg-slate-900/50">
          {row(
            "Quality",
            <select className={cn(inputCls, "w-32 py-1.5")} value={s.quality} onChange={(e) => setS({ ...s, quality: e.target.value as GameSettings["quality"] })}>
              <option value="low">Low (mobile)</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>,
          )}
          {row("Field of view", slider("fov", 60, 100, 1))}
          {row(
            "FPS limit",
            <select className={cn(inputCls, "w-32 py-1.5")} value={s.fpsLimit} onChange={(e) => setS({ ...s, fpsLimit: Number(e.target.value) })}>
              <option value={0}>Unlimited</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={120}>120</option>
            </select>,
          )}
          {row(
            "Show FPS counter",
            <input type="checkbox" checked={s.showFps} onChange={(e) => setS({ ...s, showFps: e.target.checked })} className="h-4 w-4 accent-sky-400" />,
          )}
        </Panel>
        <Panel title="Key bindings" className="bg-slate-900/50">
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {Object.keys(DEFAULT_BINDINGS).map((action) => (
              <button
                key={action}
                onClick={() => setRebinding(action)}
                className="flex w-full items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 text-left text-[11px] hover:bg-white/10"
              >
                <span className="text-slate-300">{ACTION_LABELS[action]}</span>
                <span className={cn("rounded bg-black/50 px-2 py-0.5 font-mono", rebinding === action && "animate-pulse text-amber-300")}>
                  {rebinding === action ? "press a key…" : (s.bindings[action] ?? DEFAULT_BINDINGS[action]).replace("Key", "").replace("Digit", "")}
                </span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </Modal>
  );
}

export function TopUpScreen({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [packId, setPackId] = useState(ctx.catalog.diamondPacks[1]?.id ?? "");
  const [methodId, setMethodId] = useState(ctx.catalog.paymentMethods[0]?.id ?? "");
  const [txRef, setTxRef] = useState("");
  const [shot, setShot] = useState<{ url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const method = ctx.catalog.paymentMethods.find((m) => m.id === methodId);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const r = await api.upload(file, "payment");
      setShot({ url: r.url });
      ctx.toast("Screenshot uploaded & verified");
    } catch (e) {
      ctx.toast(e instanceof ApiError ? e.message : "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.playerAction({ action: "topup", methodId, packId, txRef, screenshotUrl: shot?.url });
      await ctx.refresh();
      ctx.toast("Request sent — an admin will review it shortly");
      setShot(null);
      setTxRef("");
    } catch (e) {
      ctx.toast(e instanceof ApiError ? e.message : "Could not send the request", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Buy Diamonds" wide>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">1 · Choose a pack</h4>
          <div className="grid grid-cols-2 gap-2">
            {ctx.catalog.diamondPacks.map((p) => (
              <button
                key={p.id}
                onClick={() => setPackId(p.id)}
                className={cn("rounded-xl border p-3 text-center transition", packId === p.id ? "border-cyan-300/70 bg-cyan-400/15" : "border-white/10 bg-white/5")}
              >
                <div className="text-2xl">💎</div>
                <div className="text-sm font-black text-cyan-200">{(p.diamonds + p.bonus).toLocaleString()}</div>
                {p.bonus > 0 && <div className="text-[10px] font-bold text-emerald-400">+{p.bonus} bonus</div>}
                <div className="mt-1 text-[11px] text-slate-400">${p.usd.toFixed(2)}</div>
              </button>
            ))}
          </div>
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">2 · Payment method</h4>
          <select className={inputCls} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
            {ctx.catalog.paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {method && (
            <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-[11px] text-amber-100">
              <div className="font-bold">Send payment to:</div>
              <div className="mt-1 break-all rounded bg-black/40 px-2 py-1 font-mono text-amber-200">{method.address}</div>
              <p className="mt-1.5 text-amber-200/80">{method.instructions}</p>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">3 · Upload proof</h4>
          <Field label="Transaction ID / reference (optional)">
            <input className={inputCls} value={txRef} onChange={(e) => setTxRef(e.target.value)} placeholder="e.g. 98217364" />
          </Field>
          <Field label="Payment screenshot" hint="PNG / JPG / WebP · max 4 MB · validated on upload">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </Field>
          {shot && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shot.url} alt="Payment proof" className="max-h-40 rounded-xl border border-white/10 object-contain" />
          )}
          <Btn variant="diamond" className="w-full" disabled={!shot || !packId || !methodId} loading={busy} onClick={submit}>
            Submit payment request
          </Btn>
          <div>
            <h4 className="mb-1.5 text-xs font-black uppercase tracking-widest text-slate-400">Your requests</h4>
            <div className="space-y-1">
              {!ctx.payments.length && <p className="text-[11px] text-slate-500">No requests yet.</p>}
              {ctx.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px]">
                  <span>💎 {p.diamondsRequested} · ${p.amountUsd}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-bold uppercase",
                      p.status === "approved" ? "bg-emerald-500/20 text-emerald-300" : p.status === "rejected" ? "bg-rose-500/20 text-rose-300" : "bg-amber-500/20 text-amber-300",
                    )}
                  >
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ==================================================================== */
/*  RESULTS                                                              */
/* ==================================================================== */
export function ResultsScreen({
  result,
  rewardGold,
  onReplay,
  onMenu,
}: {
  result: MatchResultSummary;
  rewardGold: number | null;
  onReplay: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/80 p-4 backdrop-blur">
      <div className="ew-pop w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/95 p-6 text-center shadow-2xl">
        <div className="text-6xl">{result.won ? "🏆" : result.placement <= 3 ? "🥈" : "💀"}</div>
        <h2 className="ew-title mt-2 text-3xl">{result.won ? "VICTORY!" : `#${result.placement} PLACE`}</h2>
        <p className="text-xs uppercase tracking-[.2em] text-slate-400">
          {result.mode === "offline" ? `Offline · ${DIFFICULTIES[result.difficulty].label}` : "Multiplayer"} · {result.mapId}
        </p>
        <div className="my-4 grid grid-cols-4 gap-2">
          {[
            ["Kills", result.kills],
            ["Deaths", result.deaths],
            ["Headshots", result.headshots],
            ["Damage", result.damage],
          ].map(([l, v]) => (
            <div key={String(l)} className="rounded-xl bg-white/5 p-2">
              <div className="text-xl font-black text-amber-300">{v}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{l}</div>
            </div>
          ))}
        </div>
        {rewardGold !== null && (
          <div className="mb-4 rounded-xl border border-amber-300/30 bg-amber-400/10 py-2 text-sm font-black text-amber-200">
            + 🪙 {rewardGold.toLocaleString()} gold coins earned
          </div>
        )}
        <div className="mb-4 max-h-40 overflow-y-auto rounded-xl bg-white/5 p-2 text-left text-xs">
          {result.scoreboard.slice(0, 8).map((s, i) => (
            <div key={s.name + i} className={cn("flex justify-between px-2 py-1", s.isSelf && "rounded bg-amber-400/15 font-bold text-amber-200")}>
              <span>{i + 1}. {s.name}</span>
              <span>{s.kills} kills</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" className="flex-1" onClick={onMenu}>Main menu</Btn>
          <Btn variant="gold" className="flex-1" onClick={onReplay}>Play again</Btn>
        </div>
      </div>
    </div>
  );
}
