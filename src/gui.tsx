import { For, Show, createEffect, createSignal, onCleanup } from "solid-js"
import { Portal } from "solid-js/web"
import { Plugin, Slot } from "@opencode/plugin/gui"

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
  let button: HTMLButtonElement | undefined
  let hideTimer: number | undefined

  const load = async (directory: string) => {
    const usage = props.ctx.client?.experimental?.usage ?? props.ctx.client?.usage
    if (!usage?.limits) return
    try {
      const body = await usage.limits({ location: { directory } })
      setInfo(infoOf(body))
    } catch {
      // Keep the last good values.
    }
  }

  createEffect(() => {
    const directory = props.session?.directory
    if (!directory) return
    void load(directory)
    const timer = window.setInterval(() => void load(directory), REFRESH_MS)
    onCleanup(() => window.clearInterval(timer))
  })

  const place = () => {
    if (!button) return
    const rect = button.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8))
    setPosition({ top: rect.bottom + 8, left })
  }

  const show = () => {
    window.clearTimeout(hideTimer)
    place()
    setOpen(true)
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
              <span style={{ "font-size": "11px", color: COLORS.muted }}>
                {info()?.workspace?.name ?? "OpenCode Go"}
              </span>
            </div>

            <Show
              when={rows().length > 0}
              fallback={
                <div style={{ color: COLORS.muted, "font-size": "12px", padding: "12px 0 4px" }}>
                  Quota unavailable. Sign in to OpenCode Console and try again.
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
                <button
                  type="button"
                  onClick={() => openLink(link())}
                  style={{
                    display: "block",
                    width: "100%",
                    "margin-top": "12px",
                    "padding-top": "10px",
                    border: "none",
                    "border-top": `1px solid ${COLORS.border}`,
                    "border-radius": 0,
                    background: "transparent",
                    color: COLORS.muted,
                    "font-size": "11px",
                    "text-align": "left",
                    cursor: "pointer",
                  }}
                >
                  Open Console usage
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
    ctx.add(Slot, {
      at: "session.header",
      order: 11,
      render: (input) => <QuotaIndicator ctx={ctx} session={input.session} />,
    })
  },
})
