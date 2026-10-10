"use client";

/**
 * EGG WARS - Administration panel.
 * Server-side permission checks live in /api/admin/[section]; this UI simply
 * surfaces them. Every destructive action asks for confirmation and every
 * mutation is written to the admin_logs audit trail.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CharacterPreview } from "@/components/CharacterPreview";
import { Btn, Field, ItemIcon, Modal, Panel, RarityChip, Toasts, cn, inputCls } from "@/components/ui";
import { api, ApiError, type Item } from "@/lib/client-api";
import { CATEGORY_META, RARITY_META, type ItemCategory, type OutfitVisual, type Rarity } from "@/shared/catalog";
import { WEAPON_IDS } from "@/shared/weapons";

type Section = "dashboard" | "items" | "users" | "payments" | "methods" | "missions" | "assets" | "logs";

type AdminUser = {
  id: number;
  email: string;
  displayName: string;
  provider: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  gold: number;
  diamonds: number;
  level: number;
  kills: number;
  matches: number;
  lastSeenAt: string;
};

type PaymentRecord = {
  req: {
    id: number;
    userId: number;
    methodId: string;
    amountUsd: number;
    diamondsRequested: number;
    diamondsGranted: number;
    txRef: string;
    screenshotUrl: string;
    status: string;
    adminNote: string;
    createdAt: string;
  };
  userName: string | null;
  userEmail: string | null;
  userDiamonds: number | null;
};

type MethodRow = { id: string; name: string; kind: string; address: string; instructions: string; qrUrl: string | null; enabled: boolean; sortOrder: number };
type MissionRow = { id: number; key: string; title: string; description: string; type: string; metric: string; goal: number; rewardGold: number; rewardDiamonds: number; rewardItemId: string | null; active: boolean };
type LogRow = { id: number; actorName: string; action: string; targetType: string; targetId: string; details: Record<string, unknown>; createdAt: string };
type AssetRow = { id: number; path: string; originalName: string; mime: string; bytes: number; width: number; height: number; kind: string; valid: boolean };

const EMPTY_ITEM: Item = {
  id: "",
  name: "",
  description: "",
  category: "outfit",
  rarity: "common",
  priceGold: 0,
  priceDiamonds: 0,
  unlock: "shop",
  emoji: "📦",
  colorPrimary: "#f59e0b",
  colorSecondary: "#38bdf8",
  iconUrl: null,
  stats: {},
  enabled: true,
  featured: false,
};

export default function AdminPanel({ initialName }: { initialName: string }) {
  const [section, setSection] = useState<Section>("dashboard");
  const [toasts, setToasts] = useState<{ id: number; text: string; tone?: string }[]>([]);
  const [authError, setAuthError] = useState(false);

  const toast = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setAuthError(true);
      toast(e instanceof ApiError ? e.message : "Request failed", "error");
    },
    [toast],
  );

  const nav: { id: Section; label: string; icon: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "items", label: "Items", icon: "📦" },
    { id: "users", label: "Users", icon: "👥" },
    { id: "payments", label: "Payments", icon: "💳" },
    { id: "methods", label: "Pay methods", icon: "🏦" },
    { id: "missions", label: "Missions", icon: "🎯" },
    { id: "assets", label: "Assets", icon: "🖼️" },
    { id: "logs", label: "Logs", icon: "📜" },
  ];

  return (
    <div className="ew-bg min-h-[100dvh]">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-4 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🛡️</span>
          <div>
            <div className="text-sm font-black uppercase tracking-wider text-rose-300">Admin Panel</div>
            <div className="text-[10px] text-slate-500">Signed in as {initialName}</div>
          </div>
        </div>
        <Link href="/" className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20">← Back to game</Link>
      </header>

      {authError && (
        <div className="m-4 rounded-xl border border-rose-400/40 bg-rose-950/60 p-4 text-sm text-rose-200">
          Your session no longer has administrator permissions. <Link href="/" className="underline">Sign in again</Link>.
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-4 p-3 lg:grid-cols-[190px_1fr]">
        <nav className="grid grid-cols-4 gap-1.5 lg:grid-cols-1 lg:content-start">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition",
                section === n.id ? "border-rose-400/50 bg-rose-500/15 text-rose-200" : "border-white/10 bg-slate-900/60 text-slate-300 hover:bg-slate-800/70",
              )}
            >
              <span>{n.icon}</span>
              <span className="hidden truncate sm:inline">{n.label}</span>
            </button>
          ))}
        </nav>

        <main className="min-w-0">
          {section === "dashboard" && <Dashboard onError={handle} />}
          {section === "items" && <Items toast={toast} onError={handle} />}
          {section === "users" && <Users toast={toast} onError={handle} />}
          {section === "payments" && <Payments toast={toast} onError={handle} />}
          {section === "methods" && <Methods toast={toast} onError={handle} />}
          {section === "missions" && <Missions toast={toast} onError={handle} />}
          {section === "assets" && <Assets toast={toast} onError={handle} />}
          {section === "logs" && <Logs onError={handle} />}
        </main>
      </div>
      <Toasts items={toasts} />
    </div>
  );
}

/* ==================================================================== */
function Dashboard({ onError }: { onError: (e: unknown) => void }) {
  const [data, setData] = useState<{
    totalItems: number;
    totalUsers: number;
    bannedUsers: number;
    pendingPayments: number;
    totalMatches: number;
    itemsByCategory: { category: string; n: number }[];
    logs: LogRow[];
    assetHealth: { total: number; broken: { path: string; reason: string }[] };
    recentItems: Item[];
  } | null>(null);

  useEffect(() => {
    api.admin<typeof data & object>("dashboard").then(setData).catch(onError);
  }, [onError]);

  if (!data) return <Panel>Loading dashboard…</Panel>;
  const cards = [
    { label: "Items", value: data.totalItems, icon: "📦" },
    { label: "Registered players", value: data.totalUsers, icon: "👥" },
    { label: "Banned", value: data.bannedUsers, icon: "🚫" },
    { label: "Pending payments", value: data.pendingPayments, icon: "💳" },
    { label: "Matches played", value: data.totalMatches, icon: "🎮" },
    { label: "Broken assets", value: data.assetHealth.broken.length, icon: "🖼️" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-center">
            <div className="text-xl">{c.icon}</div>
            <div className="text-xl font-black text-amber-300">{c.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Items by category">
          <div className="space-y-1 text-xs">
            {data.itemsByCategory.map((r) => (
              <div key={r.category} className="flex justify-between rounded-lg bg-white/5 px-2.5 py-1.5">
                <span>{CATEGORY_META[r.category as ItemCategory]?.emoji} {CATEGORY_META[r.category as ItemCategory]?.label ?? r.category}</span>
                <span className="font-bold text-amber-300">{r.n}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Asset health">
          <p className="text-xs text-slate-300">{data.assetHealth.total} registered uploads · {data.assetHealth.broken.length} failing</p>
          <div className="mt-2 space-y-1 text-[11px]">
            {data.assetHealth.broken.length === 0 && <p className="text-emerald-400">All uploaded assets verified on disk ✓</p>}
            {data.assetHealth.broken.map((b) => (
              <div key={b.path} className="rounded bg-rose-500/10 px-2 py-1 text-rose-300">{b.path} — {b.reason}</div>
            ))}
          </div>
        </Panel>
        <Panel title="Recently updated items">
          <div className="space-y-1.5">
            {data.recentItems.map((i) => (
              <div key={i.id} className="flex items-center gap-2 rounded-lg bg-white/5 p-1.5">
                <ItemIcon emoji={i.emoji} iconUrl={i.iconUrl} color={i.colorPrimary} size={34} name={i.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold">{i.name}</div>
                  <div className="text-[10px] text-slate-500">{i.id}</div>
                </div>
                <RarityChip rarity={i.rarity} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Recent admin actions">
          <div className="space-y-1 text-[11px]">
            {data.logs.map((l) => (
              <div key={l.id} className="flex justify-between gap-2 rounded bg-white/5 px-2 py-1">
                <span className="truncate"><b className="text-sky-300">{l.actorName}</b> {l.action} {l.targetId}</span>
                <span className="shrink-0 text-slate-500">{new Date(l.createdAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ==================================================================== */
function Items({ toast, onError }: { toast: (m: string, t?: "ok" | "error") => void; onError: (e: unknown) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [rarity, setRarity] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);
  const [bulk, setBulk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.admin<{ items: Item[] }>("items", { search, category, rarity });
      setItems(r.items);
    } catch (e) {
      onError(e);
    } finally {
      setLoading(false);
    }
  }, [search, category, rarity, onError]);

  useEffect(() => {
    const t = setTimeout(load, 220);
    return () => clearTimeout(t);
  }, [load]);

  const toggle = async (item: Item) => {
    try {
      await api.adminPost("items", { op: "toggle", id: item.id });
      toast(`${item.name} ${item.enabled ? "disabled" : "enabled"}`);
      void load();
    } catch (e) {
      onError(e);
    }
  };

  const remove = async (item: Item) => {
    try {
      await api.adminPost("items", { op: "delete", id: item.id });
      toast(`${item.name} deleted`);
      setConfirmDelete(null);
      void load();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <div className="space-y-3">
      <Panel
        title="Manage items"
        right={
          <div className="flex gap-1.5">
            <Btn size="sm" variant="ghost" onClick={() => setBulk("[\n  {\n    \"id\": \"outfit_example\",\n    \"name\": \"Example Outfit\",\n    \"category\": \"outfit\",\n    \"rarity\": \"rare\",\n    \"priceGold\": 500,\n    \"emoji\": \"🥚\"\n  }\n]")}>
              ⇪ Bulk import
            </Btn>
            <Btn size="sm" onClick={() => { setEditing({ ...EMPTY_ITEM }); setIsNew(true); }}>+ Add item</Btn>
          </div>
        }
      >
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <input className={inputCls} placeholder="Search by name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {Object.entries(CATEGORY_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select className={inputCls} value={rarity} onChange={(e) => setRarity(e.target.value)}>
            <option value="">All rarities</option>
            {Object.entries(RARITY_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                <th className="p-2 text-left">Item</th>
                <th className="p-2 text-left">Category</th>
                <th className="p-2 text-left">Rarity</th>
                <th className="p-2 text-right">Gold</th>
                <th className="p-2 text-right">Diamonds</th>
                <th className="p-2 text-center">Live</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-white/5">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <ItemIcon emoji={i.emoji} iconUrl={i.iconUrl} color={i.colorPrimary} size={36} name={i.name} />
                      <div className="min-w-0">
                        <div className="truncate font-bold">{i.name}</div>
                        <div className="font-mono text-[10px] text-slate-500">{i.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-2">{CATEGORY_META[i.category]?.label ?? i.category}</td>
                  <td className="p-2"><RarityChip rarity={i.rarity} /></td>
                  <td className="p-2 text-right text-amber-300">{i.priceGold || "—"}</td>
                  <td className="p-2 text-right text-cyan-300">{i.priceDiamonds || "—"}</td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => toggle(i)}
                      title={i.enabled ? "Disable (hides it in-game)" : "Enable"}
                      className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", i.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-600/30 text-slate-400")}
                    >
                      {i.enabled ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Btn size="sm" variant="ghost" onClick={() => { setEditing({ ...i }); setIsNew(false); }}>✏️</Btn>
                      <Btn size="sm" variant="danger" onClick={() => setConfirmDelete(i)}>🗑️</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && !loading && <p className="py-6 text-center text-xs text-slate-500">No items match those filters.</p>}
        </div>
      </Panel>

      {editing && (
        <ItemEditor
          item={editing}
          isNew={isNew}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast("Item saved — live in the game immediately");
            void load();
          }}
          onError={onError}
        />
      )}

      {confirmDelete && (
        <Modal open onClose={() => setConfirmDelete(null)} title="Delete item?">
          <p className="text-sm text-slate-300">
            Delete <b className="text-white">{confirmDelete.name}</b> (<span className="font-mono text-xs">{confirmDelete.id}</span>)? This also removes
            it from every player&apos;s inventory. This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => remove(confirmDelete)}>Delete permanently</Btn>
          </div>
        </Modal>
      )}

      {bulk !== null && (
        <Modal open onClose={() => setBulk(null)} title="Bulk import items (JSON)" wide>
          <textarea className={cn(inputCls, "h-64 font-mono text-[11px]")} value={bulk} onChange={(e) => setBulk(e.target.value)} />
          <div className="mt-3 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setBulk(null)}>Cancel</Btn>
            <Btn
              onClick={async () => {
                try {
                  const parsed = JSON.parse(bulk) as unknown;
                  const r = await api.adminPost<{ results: { id: string; ok: boolean; error?: string }[] }>("items", { op: "bulk", items: parsed });
                  const good = r.results.filter((x) => x.ok).length;
                  toast(`${good}/${r.results.length} items imported`);
                  setBulk(null);
                  void load();
                } catch (e) {
                  onError(e instanceof SyntaxError ? new ApiError("Invalid JSON", 400) : e);
                }
              }}
            >
              Import
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ItemEditor({
  item,
  isNew,
  onClose,
  onSaved,
  onError,
}: {
  item: Item;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const [form, setForm] = useState<Item>(item);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setForm((f) => ({ ...f, [k]: v }));
  const stats = form.stats ?? {};
  const visual = (stats.visual ?? {
    body: 0xfdf6e3,
    accent: 0xe2c89a,
    hat: "none",
    face: "default",
    extra: "none",
    pattern: "none",
  }) as OutfitVisual;
  const setVisual = (v: Partial<OutfitVisual>) => setForm((f) => ({ ...f, stats: { ...f.stats, visual: { ...visual, ...v } } }));

  const save = async () => {
    setBusy(true);
    try {
      await api.adminPost("items", { op: isNew ? "create" : "update", item: form });
      onSaved();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const r = await api.upload(file, "item-icon");
      set("iconUrl", r.url);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const hex = (n: number) => "#" + (n >>> 0).toString(16).padStart(6, "0");

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={isNew ? "Add item" : `Edit ${item.name}`}
      footer={
        <div className="flex justify-between gap-2">
          <span className="self-center text-[11px] text-slate-500">Changes appear in the game catalog instantly.</span>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn variant="gold" loading={busy} onClick={save}>{isNew ? "Create item" : "Save changes"}</Btn>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Item ID" hint="lowercase, numbers, underscores · must be unique">
              <input className={inputCls} value={form.id} disabled={!isNew} onChange={(e) => set("id", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} />
            </Field>
            <Field label="Display name">
              <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
          </div>
          <Field label="Description">
            <textarea className={cn(inputCls, "h-16")} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Category">
              <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value as ItemCategory)}>
                {Object.entries(CATEGORY_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Rarity">
              <select className={inputCls} value={form.rarity} onChange={(e) => set("rarity", e.target.value as Rarity)}>
                {Object.entries(RARITY_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Unlock method">
              <select className={inputCls} value={form.unlock} onChange={(e) => set("unlock", e.target.value)}>
                <option value="shop">Shop purchase</option>
                <option value="default">Free for everyone</option>
                <option value="mission">Mission reward</option>
                <option value="event">Event</option>
                <option value="admin">Admin grant only</option>
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Price (gold)">
              <input className={inputCls} type="number" min={0} value={form.priceGold} onChange={(e) => set("priceGold", Number(e.target.value))} />
            </Field>
            <Field label="Price (diamonds)">
              <input className={inputCls} type="number" min={0} value={form.priceDiamonds} onChange={(e) => set("priceDiamonds", Number(e.target.value))} />
            </Field>
            <Field label="Emoji icon">
              <input className={inputCls} value={form.emoji} maxLength={4} onChange={(e) => set("emoji", e.target.value)} />
            </Field>
            <Field label="Featured">
              <select className={inputCls} value={form.featured ? "1" : "0"} onChange={(e) => set("featured", e.target.value === "1")}>
                <option value="0">No</option>
                <option value="1">Yes</option>
              </select>
            </Field>
          </div>

          {/* category-specific fields only */}
          {(form.category === "weapon" || form.category === "throwable" || form.category === "skin") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Linked weapon" hint="Uses the balance table in shared/weapons.ts">
                <select
                  className={inputCls}
                  value={String(stats.weaponId ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, stats: { ...f.stats, weaponId: e.target.value } }))}
                >
                  <option value="">— select —</option>
                  {WEAPON_IDS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </Field>
              {form.category === "skin" && (
                <Field label="Skin tint">
                  <input
                    type="color"
                    className="h-10 w-full rounded-xl bg-slate-950/70"
                    value={hex(Number(stats.tint ?? 0xffffff))}
                    onChange={(e) => setForm((f) => ({ ...f, stats: { ...f.stats, tint: parseInt(e.target.value.slice(1), 16) } }))}
                  />
                </Field>
              )}
            </div>
          )}
          {(form.category === "helmet" || form.category === "vest") && (
            <Field label="Armour points">
              <input
                className={inputCls}
                type="number"
                min={0}
                max={200}
                value={Number(stats.armor ?? 0)}
                onChange={(e) => setForm((f) => ({ ...f, stats: { ...f.stats, armor: Number(e.target.value) } }))}
              />
            </Field>
          )}
          {form.category === "consumable" && (
            <Field label="Heal amount">
              <input
                className={inputCls}
                type="number"
                min={0}
                max={500}
                value={Number(stats.heal ?? 0)}
                onChange={(e) => setForm((f) => ({ ...f, stats: { ...f.stats, heal: Number(e.target.value) } }))}
              />
            </Field>
          )}
          {form.category === "backpack" && (
            <Field label="Ammo capacity multiplier">
              <input
                className={inputCls}
                type="number"
                step={0.1}
                min={1}
                max={3}
                value={Number(stats.capacity ?? 1)}
                onChange={(e) => setForm((f) => ({ ...f, stats: { ...f.stats, capacity: Number(e.target.value) } }))}
              />
            </Field>
          )}
          {form.category === "outfit" && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h4 className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-400">Outfit appearance</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Shell colour">
                  <input type="color" className="h-10 w-full rounded-xl bg-slate-950/70" value={hex(visual.body)} onChange={(e) => setVisual({ body: parseInt(e.target.value.slice(1), 16) })} />
                </Field>
                <Field label="Accent colour">
                  <input type="color" className="h-10 w-full rounded-xl bg-slate-950/70" value={hex(visual.accent)} onChange={(e) => setVisual({ accent: parseInt(e.target.value.slice(1), 16) })} />
                </Field>
                <Field label="Headgear">
                  <select className={inputCls} value={visual.hat} onChange={(e) => setVisual({ hat: e.target.value as OutfitVisual["hat"] })}>
                    {["none", "crown", "cap", "helmet", "bandana", "bubble", "horns", "visor", "hood"].map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Face">
                  <select className={inputCls} value={visual.face} onChange={(e) => setVisual({ face: e.target.value as OutfitVisual["face"] })}>
                    {["default", "angry", "cool", "happy", "ninja", "fierce"].map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Back accessory">
                  <select className={inputCls} value={visual.extra} onChange={(e) => setVisual({ extra: e.target.value as OutfitVisual["extra"] })}>
                    {["none", "backpack", "cape", "wings", "jetpack"].map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Shell pattern">
                  <select className={inputCls} value={visual.pattern} onChange={(e) => setVisual({ pattern: e.target.value as OutfitVisual["pattern"] })}>
                    {["none", "camo", "stripes", "circuit", "scales"].map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Panel title="Live preview" className="bg-slate-900/50">
            {form.category === "outfit" ? (
              <CharacterPreview visual={visual} height={200} />
            ) : (
              <div className="grid h-[200px] place-items-center rounded-xl bg-slate-950/60">
                <ItemIcon emoji={form.emoji} iconUrl={form.iconUrl} color={form.colorPrimary} size={110} name={form.name} />
              </div>
            )}
            <div className="mt-2">
              <div className="text-sm font-bold">{form.name || "Untitled item"}</div>
              <RarityChip rarity={form.rarity} />
            </div>
          </Panel>
          <Field label="Icon image" hint="PNG/JPG/WebP ≤ 4 MB · validated by magic bytes">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="w-full text-[11px] file:mr-2 file:rounded-lg file:border-0 file:bg-sky-500 file:px-2 file:py-1.5 file:text-[11px] file:font-bold file:text-white"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </Field>
          {form.iconUrl && (
            <Btn size="sm" variant="ghost" className="w-full" onClick={() => set("iconUrl", null)}>Remove uploaded icon</Btn>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Primary colour">
              <input type="color" className="h-9 w-full rounded-lg bg-slate-950/70" value={form.colorPrimary} onChange={(e) => set("colorPrimary", e.target.value)} />
            </Field>
            <Field label="Secondary">
              <input type="color" className="h-9 w-full rounded-lg bg-slate-950/70" value={form.colorSecondary} onChange={(e) => set("colorSecondary", e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Enabled (visible in game)
          </label>
        </div>
      </div>
    </Modal>
  );
}

/* ==================================================================== */
function Users({ toast, onError }: { toast: (m: string, t?: "ok" | "error") => void; onError: (e: unknown) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [gold, setGold] = useState(0);
  const [diamonds, setDiamonds] = useState(0);
  const [mode, setMode] = useState<"add" | "set">("add");
  const [banReason, setBanReason] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.admin<{ users: AdminUser[] }>("users", { search });
      setUsers(r.users);
    } catch (e) {
      onError(e);
    }
  }, [search, onError]);

  useEffect(() => {
    const t = setTimeout(load, 220);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (body: Record<string, unknown>, msg: string) => {
    try {
      await api.adminPost("users", body);
      toast(msg);
      void load();
      setTarget(null);
    } catch (e) {
      onError(e);
    }
  };

  return (
    <Panel title="Players" right={<input className={cn(inputCls, "w-48 py-1.5")} placeholder="Search name/email…" value={search} onChange={(e) => setSearch(e.target.value)} />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="p-2 text-left">Player</th>
              <th className="p-2 text-left">Provider</th>
              <th className="p-2 text-left">Role</th>
              <th className="p-2 text-right">Gold</th>
              <th className="p-2 text-right">Diamonds</th>
              <th className="p-2 text-center">Status</th>
              <th className="p-2 text-right">Manage</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-white/5">
                <td className="p-2">
                  <div className="font-bold">{u.displayName}</div>
                  <div className="text-[10px] text-slate-500">{u.email}</div>
                </td>
                <td className="p-2 capitalize">{u.provider}</td>
                <td className="p-2">
                  <select
                    className="rounded bg-slate-800 px-1.5 py-1 text-[11px]"
                    value={u.role}
                    onChange={(e) => act({ op: "role", userId: u.id, role: e.target.value }, `${u.displayName} is now ${e.target.value}`)}
                  >
                    <option value="player">player</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="p-2 text-right text-amber-300">{u.gold.toLocaleString()}</td>
                <td className="p-2 text-right text-cyan-300">{u.diamonds.toLocaleString()}</td>
                <td className="p-2 text-center">
                  {u.banned ? <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-black text-rose-300">BANNED</span> : <span className="text-[10px] text-emerald-400">active</span>}
                </td>
                <td className="p-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Btn size="sm" variant="ghost" onClick={() => { setTarget(u); setGold(0); setDiamonds(0); setBanReason(u.banReason ?? ""); }}>💰 Currency</Btn>
                    <Btn
                      size="sm"
                      variant={u.banned ? "primary" : "danger"}
                      onClick={() =>
                        u.banned
                          ? act({ op: "ban", userId: u.id, banned: false }, `${u.displayName} unbanned`)
                          : act({ op: "ban", userId: u.id, banned: true, reason: "Violation of the fair-play rules" }, `${u.displayName} banned`)
                      }
                    >
                      {u.banned ? "Unban" : "Ban"}
                    </Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target && (
        <Modal open onClose={() => setTarget(null)} title={`Manage ${target.displayName}`}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Gold">
                <input className={inputCls} type="number" value={gold} onChange={(e) => setGold(Number(e.target.value))} />
              </Field>
              <Field label="Diamonds">
                <input className={inputCls} type="number" value={diamonds} onChange={(e) => setDiamonds(Number(e.target.value))} />
              </Field>
            </div>
            <Field label="Mode">
              <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as "add" | "set")}>
                <option value="add">Add to current balance</option>
                <option value="set">Set exact balance</option>
              </select>
            </Field>
            <Btn className="w-full" variant="gold" onClick={() => act({ op: "currency", userId: target.id, gold, diamonds, mode }, "Balance updated")}>
              Apply currency change
            </Btn>
            <hr className="border-white/10" />
            <Field label="Ban reason (shown to the player)">
              <input className={inputCls} value={banReason} onChange={(e) => setBanReason(e.target.value)} />
            </Field>
            <Btn className="w-full" variant="danger" onClick={() => act({ op: "ban", userId: target.id, banned: true, reason: banReason }, "Player banned")}>
              Ban player
            </Btn>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

/* ==================================================================== */
function Payments({ toast, onError }: { toast: (m: string, t?: "ok" | "error") => void; onError: (e: unknown) => void }) {
  const [rows, setRows] = useState<PaymentRecord[]>([]);
  const [status, setStatus] = useState("pending");
  const [review, setReview] = useState<PaymentRecord | null>(null);
  const [grant, setGrant] = useState(0);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.admin<{ payments: PaymentRecord[] }>("payments", { status });
      setRows(r.payments);
    } catch (e) {
      onError(e);
    }
  }, [status, onError]);

  useEffect(() => {
    // queueMicrotask keeps the state update out of the synchronous effect body
    queueMicrotask(() => void load());
  }, [load]);

  const act = async (op: "approve" | "reject") => {
    if (!review) return;
    try {
      await api.adminPost("payments", { op, id: review.req.id, diamonds: grant, note });
      toast(op === "approve" ? `Granted 💎${grant}` : "Request rejected");
      setReview(null);
      void load();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <Panel
      title="Diamond payment requests"
      right={
        <select className={cn(inputCls, "w-36 py-1.5")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
      }
    >
      {!rows.length && <p className="py-6 text-center text-xs text-slate-500">No requests in this state.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.req.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{r.userName ?? `User #${r.req.userId}`}</div>
                <div className="truncate text-[10px] text-slate-500">{r.userEmail}</div>
                <div className="mt-1 text-xs">
                  💎 <b className="text-cyan-300">{r.req.diamondsRequested}</b> · ${r.req.amountUsd} · {r.req.methodId}
                </div>
                {r.req.txRef && <div className="text-[10px] text-slate-400">Ref: {r.req.txRef}</div>}
              </div>
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-black uppercase", r.req.status === "pending" ? "bg-amber-500/20 text-amber-300" : r.req.status === "approved" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300")}>
                {r.req.status}
              </span>
            </div>
            {r.req.screenshotUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.req.screenshotUrl} alt="Payment proof" className="mt-2 max-h-36 w-full rounded-lg border border-white/10 object-contain" />
            )}
            {r.req.status === "pending" && (
              <Btn size="sm" className="mt-2 w-full" onClick={() => { setReview(r); setGrant(r.req.diamondsRequested); setNote(""); }}>
                Review
              </Btn>
            )}
            {r.req.adminNote && <p className="mt-1 text-[10px] text-slate-400">Note: {r.req.adminNote}</p>}
          </div>
        ))}
      </div>

      {review && (
        <Modal open onClose={() => setReview(null)} title={`Review request #${review.req.id}`}>
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={review.req.screenshotUrl} alt="Payment proof" className="max-h-72 w-full rounded-xl border border-white/10 object-contain" />
            <p className="text-xs text-slate-300">
              {review.userName} requested <b>💎 {review.req.diamondsRequested}</b> for ${review.req.amountUsd} via {review.req.methodId}.
              Current balance: 💎 {review.userDiamonds ?? 0}
            </p>
            <Field label="Diamonds to grant">
              <input className={inputCls} type="number" min={0} value={grant} onChange={(e) => setGrant(Number(e.target.value))} />
            </Field>
            <Field label="Admin note (shown to the player)">
              <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Verified on Binance" />
            </Field>
            <div className="flex gap-2">
              <Btn variant="danger" className="flex-1" onClick={() => act("reject")}>Reject</Btn>
              <Btn variant="gold" className="flex-1" onClick={() => act("approve")}>Approve &amp; grant</Btn>
            </div>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

/* ==================================================================== */
function Methods({ toast, onError }: { toast: (m: string, t?: "ok" | "error") => void; onError: (e: unknown) => void }) {
  const [rows, setRows] = useState<MethodRow[]>([]);
  const [edit, setEdit] = useState<MethodRow | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.admin<{ methods: MethodRow[] }>("methods");
      setRows(r.methods);
    } catch (e) {
      onError(e);
    }
  }, [onError]);

  useEffect(() => {
    // queueMicrotask keeps the state update out of the synchronous effect body
    queueMicrotask(() => void load());
  }, [load]);

  const blank: MethodRow = { id: "", name: "", kind: "binance", address: "", instructions: "", qrUrl: null, enabled: true, sortOrder: rows.length + 1 };

  return (
    <Panel title="Payment methods" right={<Btn size="sm" onClick={() => setEdit(blank)}>+ Add method</Btn>}>
      <div className="space-y-2">
        {rows.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="min-w-0">
              <div className="text-sm font-bold">{m.name} {!m.enabled && <span className="text-[10px] text-slate-500">(disabled)</span>}</div>
              <div className="truncate font-mono text-[11px] text-slate-400">{m.address}</div>
            </div>
            <div className="flex gap-1">
              <Btn size="sm" variant="ghost" onClick={() => setEdit(m)}>Edit</Btn>
              <Btn
                size="sm"
                variant="danger"
                onClick={async () => {
                  try {
                    await api.adminPost("methods", { op: "delete", id: m.id });
                    toast("Method removed");
                    void load();
                  } catch (e) {
                    onError(e);
                  }
                }}
              >
                Delete
              </Btn>
            </div>
          </div>
        ))}
      </div>

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : "Add payment method"}>
          <div className="space-y-3">
            <Field label="Method ID" hint="lowercase, unique">
              <input className={inputCls} value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} />
            </Field>
            <Field label="Display name">
              <input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Kind">
              <select className={inputCls} value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
                <option value="binance">Binance</option>
                <option value="bank">Bank transfer</option>
                <option value="wallet">Mobile wallet</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Address / account">
              <input className={inputCls} value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </Field>
            <Field label="Instructions for players">
              <textarea className={cn(inputCls, "h-20")} value={edit.instructions} onChange={(e) => setEdit({ ...edit, instructions: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> Enabled
            </label>
            <Btn
              className="w-full"
              variant="gold"
              onClick={async () => {
                try {
                  await api.adminPost("methods", { op: "save", method: edit });
                  toast("Payment method saved");
                  setEdit(null);
                  void load();
                } catch (e) {
                  onError(e);
                }
              }}
            >
              Save method
            </Btn>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

/* ==================================================================== */
function Missions({ toast, onError }: { toast: (m: string, t?: "ok" | "error") => void; onError: (e: unknown) => void }) {
  const [rows, setRows] = useState<MissionRow[]>([]);
  const [edit, setEdit] = useState<MissionRow | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.admin<{ missions: MissionRow[] }>("missions");
      setRows(r.missions);
    } catch (e) {
      onError(e);
    }
  }, [onError]);

  useEffect(() => {
    // queueMicrotask keeps the state update out of the synchronous effect body
    queueMicrotask(() => void load());
  }, [load]);

  const blank: MissionRow = {
    id: 0, key: "", title: "", description: "", type: "daily", metric: "kills", goal: 10,
    rewardGold: 200, rewardDiamonds: 0, rewardItemId: null, active: true,
  };

  return (
    <Panel title="Missions" right={<Btn size="sm" onClick={() => setEdit(blank)}>+ Add mission</Btn>}>
      <div className="space-y-2">
        {rows.map((m) => (
          <div key={m.key} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
            <div className="min-w-0">
              <div className="font-bold">{m.title} <span className="text-[10px] text-slate-500">({m.type})</span></div>
              <div className="text-slate-400">{m.metric} ≥ {m.goal} → 🪙{m.rewardGold} 💎{m.rewardDiamonds}</div>
            </div>
            <div className="flex gap-1">
              <Btn size="sm" variant="ghost" onClick={() => setEdit(m)}>Edit</Btn>
              <Btn
                size="sm"
                variant="danger"
                onClick={async () => {
                  try {
                    await api.adminPost("missions", { op: "delete", key: m.key });
                    toast("Mission deleted");
                    void load();
                  } catch (e) {
                    onError(e);
                  }
                }}
              >
                Delete
              </Btn>
            </div>
          </div>
        ))}
      </div>

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.key ? `Edit ${edit.title}` : "Add mission"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Key"><input className={inputCls} value={edit.key} onChange={(e) => setEdit({ ...edit, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} /></Field>
            <Field label="Title"><input className={inputCls} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Type">
              <select className={inputCls} value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
                <option value="career">career</option>
              </select>
            </Field>
            <Field label="Metric">
              <select className={inputCls} value={edit.metric} onChange={(e) => setEdit({ ...edit, metric: e.target.value })}>
                {["kills", "matches", "wins", "headshots", "damage", "login"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Goal"><input className={inputCls} type="number" value={edit.goal} onChange={(e) => setEdit({ ...edit, goal: Number(e.target.value) })} /></Field>
            <Field label="Reward gold"><input className={inputCls} type="number" value={edit.rewardGold} onChange={(e) => setEdit({ ...edit, rewardGold: Number(e.target.value) })} /></Field>
            <Field label="Reward diamonds"><input className={inputCls} type="number" value={edit.rewardDiamonds} onChange={(e) => setEdit({ ...edit, rewardDiamonds: Number(e.target.value) })} /></Field>
            <Field label="Reward item ID (optional)"><input className={inputCls} value={edit.rewardItemId ?? ""} onChange={(e) => setEdit({ ...edit, rewardItemId: e.target.value || null })} /></Field>
            <div className="sm:col-span-2">
              <Field label="Description"><input className={inputCls} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            </div>
            <div className="sm:col-span-2">
              <Btn
                className="w-full"
                variant="gold"
                onClick={async () => {
                  try {
                    await api.adminPost("missions", { op: "save", mission: edit });
                    toast("Mission saved");
                    setEdit(null);
                    void load();
                  } catch (e) {
                    onError(e);
                  }
                }}
              >
                Save mission
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </Panel>
  );
}

/* ==================================================================== */
function Assets({ toast, onError }: { toast: (m: string, t?: "ok" | "error") => void; onError: (e: unknown) => void }) {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [health, setHealth] = useState<{ total: number; broken: { path: string; reason: string }[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.admin<{ assets: AssetRow[]; health: { total: number; broken: { path: string; reason: string }[] } }>("assets");
      setRows(r.assets);
      setHealth(r.health);
    } catch (e) {
      onError(e);
    }
  }, [onError]);

  useEffect(() => {
    // queueMicrotask keeps the state update out of the synchronous effect body
    queueMicrotask(() => void load());
  }, [load]);

  return (
    <Panel
      title="Uploaded assets"
      right={
        <Btn
          size="sm"
          variant="ghost"
          onClick={async () => {
            try {
              await api.adminPost("assets", { op: "validate" });
              toast("Asset validation finished");
              void load();
            } catch (e) {
              onError(e);
            }
          }}
        >
          ✓ Re-validate all
        </Btn>
      }
    >
      {health && (
        <p className="mb-3 text-xs text-slate-300">
          {health.total} files registered · {health.broken.length ? <span className="text-rose-300">{health.broken.length} failing</span> : <span className="text-emerald-400">all verified</span>}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rows.map((a) => (
          <div key={a.id} className={cn("rounded-xl border p-2", a.valid ? "border-white/10 bg-white/5" : "border-rose-400/40 bg-rose-500/10")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.path} alt={a.originalName} className="h-20 w-full rounded-lg object-contain" />
            <div className="mt-1 truncate text-[10px] font-bold">{a.originalName}</div>
            <div className="text-[10px] text-slate-500">{a.width}×{a.height} · {(a.bytes / 1024).toFixed(0)} KB</div>
            <div className="text-[10px]">{a.valid ? <span className="text-emerald-400">verified</span> : <span className="text-rose-300">missing/changed</span>}</div>
          </div>
        ))}
        {!rows.length && <p className="col-span-full py-6 text-center text-xs text-slate-500">No uploads yet.</p>}
      </div>
    </Panel>
  );
}

/* ==================================================================== */
function Logs({ onError }: { onError: (e: unknown) => void }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  useEffect(() => {
    api.admin<{ logs: LogRow[] }>("logs").then((r) => setRows(r.logs)).catch(onError);
  }, [onError]);
  const grouped = useMemo(() => rows, [rows]);
  return (
    <Panel title="Audit log">
      <div className="space-y-1 text-[11px]">
        {grouped.map((l) => (
          <div key={l.id} className="flex items-start justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
            <div className="min-w-0">
              <span className="font-bold text-sky-300">{l.actorName}</span> <span className="font-mono text-amber-300">{l.action}</span>{" "}
              <span className="text-slate-400">{l.targetType} {l.targetId}</span>
              {l.details && Object.keys(l.details).length > 0 && (
                <div className="truncate font-mono text-[10px] text-slate-600">{JSON.stringify(l.details)}</div>
              )}
            </div>
            <span className="shrink-0 text-slate-500">{new Date(l.createdAt).toLocaleString()}</span>
          </div>
        ))}
        {!rows.length && <p className="py-6 text-center text-slate-500">No admin actions logged yet.</p>}
      </div>
    </Panel>
  );
}
