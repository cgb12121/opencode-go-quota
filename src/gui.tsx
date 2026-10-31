import { For, Show, createEffect, createSignal, on, onCleanup } from "solid-js"
import { Portal } from "solid-js/web"
import { Plugin, Slot, Style } from "@opencode/plugin/gui"

type Meter = { percent?: number; limited?: boolean; resetsAt?: number }
type Info = {
  workspace?: { name?: string; usageURL?: string }
  go?: { rolling?: Meter; weekly?: Meter; monthly?: Meter }
}
type Ctx = any

const REFRESH_MS = 60_000
const PANEL_WIDTH = 340
const WINDOWS = [
  { key: "rolling", label: "Rolling usage" },
  { key: "weekly", label: "Weekly usage" },
  { key: "monthly", label: "Monthly usage" },
] as const

const COLORS = {
  panel: "#1b1b1b",
  text: "#ececec",
  muted: "#a0a0a0",
  border: "rgba(255,255,255,0.10)",
  badge: "rgba(255,255,255,0.34)",
  track: "rgba(255,255,255,0.16)",
  fill: "#e6e6e6",
  danger: "#ff7a70",
}

const css = `
@keyframes goq-spin { to { transform: rotate(360deg); } }
.goq-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #a0a0a0;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.goq-icon-btn:hover { background: rgba(255,255,255,0.13); color: #fff; }
.goq-icon-btn:active { background: rgba(255,255,255,0.22); }
.goq-icon-btn:disabled { cursor: default; opacity: 0.65; }
.goq-icon-btn[data-busy="true"] svg { animation: goq-spin 0.8s linear infinite; }
.goq-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin-top: 12px;
  padding-top: 10px;
  border: none;
  border-top: 1px solid rgba(255,255,255,0.1);
  border-radius: 0;
  background: transparent;
  color: #a0a0a0;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
  transition: color 120ms ease;
}
.goq-link:hover { color: #fff; text-decoration: underline; }
.goq-flash { color: #fff; }
`

function infoOf(body: any): Info | undefined {
  if (!body) return undefined
  if (body.go || body.workspace) return body
  return body.data ?? undefined
}

function percent(meter: Meter | undefined): number {
  if (!meter || typeof meter.percent !== "number") return 0
  return Math.max(0, Math.min(100, Math.round(meter.percent)))
}

function duration(until?: number): string {
  if (!until) return ""
  const left = until - Date.now()
  if (left <= 0) return "now"
  const minutes = Math.ceil(left / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

function QuotaIndicator(props: { ctx: Ctx; session?: { directory?: string } }) {
  const [info, setInfo] = createSignal<Info | undefined>()
  const [open, setOpen] = createSignal(false)
  const [pinned, setPinned] = createSignal(false)
  const [hovered, setHovered] = createSignal(false)
  const [position, setPosition] = createSignal({ top: 0, left: 0 })
  const [updatedAt, setUpdatedAt] = createSignal(0)
  const [failed, setFailed] = createSignal(false)
  const [refreshing, setRefreshing] = createSignal(false)
  const [flash, setFlash] = createSignal(false)
  let button: HTMLButtonElement | undefined
  let hideTimer: number | undefined
  let flashTimer: number | undefined
  let inflight = 0

  const load = async (directory: string, feedback = false) => {
    const usage = props.ctx.client?.experimental?.usage ?? props.ctx.client?.usage
    if (!usage?.limits) return
    inflight += 1
    setRefreshing(true)
    try {
      const body = await usage.limits({ location: { directory } })
      setInfo(infoOf(body))
      setFailed(false)
      setUpdatedAt(Date.now())
      if (feedback) {
        window.clearTimeout(flashTimer)
        setFlash(true)
        flashTimer = window.setTimeout(() => setFlash(false), 1200)
      }
    } catch {
      setFailed(true)
    } finally {
      inflight -= 1
      if (inflight <= 0) {
        inflight = 0
        setRefreshing(false)
      }
    }
  }

  createEffect(
    on(
      () => props.session?.directory,
      (directory) => {
        if (!directory) return
        void load(directory)
        const timer = window.setInterval(() => void load(directory), REFRESH_MS)
        onCleanup(() => window.clearInterval(timer))
      },
    ),
  )

  const place = () => {
    if (!button) return
    const rect = button.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8))
    setPosition({ top: rect.bottom + 8, left })
  }

  const refresh = () => {
    const directory = props.session?.directory
    if (directory) void load(directory, true)
  }

  const show = () => {
    window.clearTimeout(hideTimer)
    place()
    setOpen(true)
    if (Date.now() - updatedAt() > 5_000) refresh()
  }

  const hide = () => {
    if (pinned()) return
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => setOpen(false), 180)
  }

  const toggle = () => {
    if (open() && pinned()) {
      setPinned(false)
      setOpen(false)
      return
    }
    setPinned(true)
    show()
  }

  createEffect(() => {
    if (!open()) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (button?.contains(event.target as Node)) return
      if (target?.closest?.("[data-go-usage-panel]")) return
      setPinned(false)
      setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    onCleanup(() => document.removeEventListener("pointerdown", onPointerDown))
  })

  const rows = () => {
    const go = info()?.go
    if (!go) return []
    return WINDOWS.flatMap(({ key, label }) => {
      const meter = go[key]
      if (!meter) return []
      return [
        {
          key,
          label,
          percent: percent(meter),
          limited: !!meter.limited,
          reset: duration(meter.resetsAt),
        },
      ]
    })
  }

  const url = () => info()?.workspace?.usageURL

  const updated = () => {
    const at = updatedAt()
    if (!at) return ""
    return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  }

  const openLink = (href: string) => {
    try {
      if (props.ctx.system?.openExternal) {
        props.ctx.system.openExternal(href)
        return
      }
    } catch {
      // Fall through to the browser.
    }
    try {
      window.open(href, "_blank", "noopener")
    } catch {
      // Nothing else to try.
    }
  }

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={button}
        type="button"
        title="OpenCode Go quota"
        onMouseEnter={() => {
          setHovered(true)
          show()
        }}
        onMouseLeave={() => {
          setHovered(false)
          hide()
        }}
        onClick={toggle}
        style={{
          display: "inline-flex",
          "align-items": "center",
          height: "24px",
          padding: "0 9px",
          border: `1px solid ${hovered() || open() ? "rgba(127,127,127,0.6)" : "rgba(127,127,127,0.32)"}`,
          "border-radius": "6px",
          background: hovered() || open() ? "rgba(127,127,127,0.14)" : "transparent",
          color: "inherit",
          cursor: "pointer",
          "font-size": "11px",
          "font-weight": 500,
          "line-height": 1,
          "white-space": "nowrap",
        }}
      >
        Quota
      </button>

      <Show when={open()}>
        <Portal>
          <div
            data-go-usage-panel
            onMouseEnter={show}
            onMouseLeave={hide}
            style={{
              position: "fixed",
              top: `${position().top}px`,
              left: `${position().left}px`,
              width: `${PANEL_WIDTH}px`,
              "z-index": 2147483000,
              background: COLORS.panel,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
              "border-radius": "10px",
              "box-shadow": "0 12px 36px rgba(0,0,0,0.5)",
              padding: "12px 14px",
              "font-size": "13px",
              "line-height": 1.4,
              "text-align": "left",
            }}
          >
            <div style={{ display: "flex", "align-items": "baseline", "justify-content": "space-between", gap: "8px" }}>
              <span style={{ "font-weight": 600 }}>Quota</span>
              <span style={{ display: "flex", "align-items": "center", gap: "8px", "font-size": "11px", color: COLORS.muted }}>
                <span>{info()?.workspace?.name ?? "OpenCode Go"}</span>
                <Show when={refreshing() || updated()}>
                  <span classList={{ "goq-flash": flash() }}>
                    · {refreshing() ? "Refreshing…" : `Updated ${updated()}`}
                  </span>
                </Show>
                <button
                  type="button"
                  class="goq-icon-btn"
                  data-busy={refreshing() ? "true" : "false"}
                  disabled={refreshing()}
                  title={refreshing() ? "Refreshing…" : "Refresh quota"}
                  aria-label="Refresh quota"
                  onClick={refresh}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V6H9.5"
                      stroke="currentColor"
                      stroke-width="1.3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </span>
            </div>

            <Show
              when={rows().length > 0}
              fallback={
                <div style={{ color: COLORS.muted, "font-size": "12px", padding: "12px 0 4px" }}>
                  {failed()
                    ? "Quota unavailable. Sign in to OpenCode Console and try again."
                    : "Loading quota…"}
                </div>
              }
            >
              <For each={rows()}>
                {(row) => (
                  <div
                    style={{
                      "border-top": `1px solid ${COLORS.border}`,
                      "margin-top": "10px",
                      "padding-top": "10px",
                    }}
                  >
                    <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                      <span style={{ "font-weight": 600 }}>{row.label}</span>
                      <span
                        style={{
                          "font-size": "11px",
                          padding: "1px 6px",
                          border: `1px solid ${row.limited ? COLORS.danger : COLORS.badge}`,
                          color: row.limited ? COLORS.danger : COLORS.text,
                          "border-radius": "5px",
                        }}
                      >
                        {row.percent}% used
                      </span>
                      <span style={{ "margin-left": "auto", "font-size": "11px", color: COLORS.muted }}>
                        Resets in {row.reset}
                      </span>
                    </div>
                    <div
                      style={{
                        height: "8px",
                        "border-radius": "999px",
                        background: COLORS.track,
                        "margin-top": "8px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${row.percent}%`,
                          "border-radius": "999px",
                          background: row.limited ? COLORS.danger : COLORS.fill,
                          transition: "width 200ms ease",
                        }}
                      />
                    </div>
                  </div>
                )}
              </For>
            </Show>

            <Show when={url()}>
              {(link) => (
                <button type="button" class="goq-link" onClick={() => openLink(link())}>
                  <span>Open Console usage</span>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M6 3h7v7M13 3 5 11"
                      stroke="currentColor"
                      stroke-width="1.3"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              )}
            </Show>
          </div>
        </Portal>
      </Show>
    </span>
  )
}

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, css)
    ctx.add(Slot, {
      at: "session.header",
      order: 11,
      render: (input) => <QuotaIndicator ctx={ctx} session={input.session} />,
    })
  },
})
