// The panel's building blocks: the app hook, buttons, form controls, sections, pills, the
// right-click / ⋯ menu and the bottom sheet. Styles are in panel.css.
import type { ComponentChildren, JSX } from './vendor/preact.js'
import { createContext, h } from './vendor/preact.js'
import { useContext, useEffect, useLayoutEffect, useReducer, useRef, useState } from './vendor/hooks.js'
import { textOn, typeColor, type App, type Dialogs, type Place, type State, type Tone } from './app.js'
import type { Option } from '../protocol.js'
import { Icon, type IconName } from './icons.js'
import { Store } from './store.js'

// --- The app -------------------------------------------------------------------------------------

export const AppContext = createContext<App | null>(null)

/** The app and its state; the calling view draws again on every change. */
export function useApp(): [State, App] {
  const app = useContext(AppContext)!
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useEffect(() => app.store.subscribe(() => redraw(undefined)), [app])
  return [app.state, app]
}

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ')

// --- Buttons -------------------------------------------------------------------------------------

type ButtonProps = {
  variant?: 'primary' | 'default' | 'ghost' | 'danger' | 'link'
  size?: 'sm' | 'md'
  icon?: IconName
  title?: string
  disabled?: boolean
  active?: boolean
  onClick?: (e: MouseEvent) => void
  children?: ComponentChildren
  class?: string
  type?: 'button' | 'submit'
}

export function Button(p: ButtonProps) {
  return (
    <button
      type={p.type ?? 'button'}
      class={cx('btn', `btn-${p.variant ?? 'default'}`, p.size === 'sm' && 'btn-sm', p.active && 'is-active', p.class)}
      title={p.title}
      disabled={p.disabled}
      onClick={(e) => p.onClick?.(e as unknown as MouseEvent)}
    >
      {p.icon ? <Icon name={p.icon} size={p.size === 'sm' ? 14 : 16} /> : null}
      {p.children ? <span>{p.children}</span> : null}
    </button>
  )
}

export function IconButton(p: { icon: IconName; label: string; onClick?: (e: MouseEvent) => void; disabled?: boolean; active?: boolean; tone?: 'danger'; class?: string }) {
  return (
    <button
      type="button"
      class={cx('icon-btn', p.active && 'is-active', p.tone === 'danger' && 'is-danger', p.class)}
      title={p.label}
      aria-label={p.label}
      disabled={p.disabled}
      onClick={(e) => {
        e.stopPropagation()
        p.onClick?.(e as unknown as MouseEvent)
      }}
    >
      <Icon name={p.icon} />
    </button>
  )
}

// --- Feedback ------------------------------------------------------------------------------------

export function Spinner({ label }: { label?: string }) {
  return (
    <div class="spinner" role="status">
      <span class="spinner-dot" />
      {label ? <span class="muted">{label}</span> : null}
    </div>
  )
}

/** What an empty list shows: never a blank space. */
export function Empty({ icon = 'list', children }: { icon?: IconName; children: ComponentChildren }) {
  return (
    <div class="empty">
      <Icon name={icon} size={18} />
      <span>{children}</span>
    </div>
  )
}

export function Callout({ tone = 'neutral', title, children }: { tone?: Tone; title?: string; children?: ComponentChildren }) {
  return (
    <div class={`callout tone-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      {tone === 'warning' || tone === 'danger' ? <Icon name="warning" /> : null}
      <div>
        {title ? <div class="callout-title">{title}</div> : null}
        {children ? <div class="callout-body">{children}</div> : null}
      </div>
    </div>
  )
}

/** The last result for one place, as a line where the action was. */
export function Notice({ place }: { place: Place }) {
  const [s] = useApp()
  const n = s.notice
  if (n?.place !== place) return null
  return <div class={`notice tone-${n.tone}`}>{n.text}</div>
}

/** A coloured pill, as Backlog draws statuses and issue types. */
/** A label in a colour from Backlog: an issue type (`type`, squarer; text by contrast) or a status (round, white text as Backlog draws it). */
export function Pill({ color: given, children, title, kind = 'status' }: { color?: string | null; children: ComponentChildren; title?: string; kind?: 'type' | 'status' }) {
  // Issue types take Backlog's dark shade in a dark theme (the panel redraws on a theme change).
  const color = kind === 'type' ? typeColor(given, document.documentElement.classList.contains('dark')) : given
  return (
    <span class={cx('pill', `pill-${kind}`)} style={color ? { background: color, color: kind === 'type' ? textOn(color) : '#fff' } : undefined} title={title}>
      {children}
    </span>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ComponentChildren }) {
  return <span class={`badge tone-${tone}`}>{children}</span>
}

// Backlog's colours for its four default statuses; custom statuses carry their own.
const STATUS_COLORS: Record<number, string> = { 1: '#ed8077', 2: '#4488c5', 3: '#5eb5a6', 4: '#b0be3c' }
export const statusColor = (id: number, own?: string | null) => own || STATUS_COLORS[id] || '#a1a1aa'

/** Backlog's priority arrows: High up in red, Normal across, Low down in green. */
export function Priority({ name }: { name: string }) {
  if (!name) return null
  const p = name.toLowerCase()
  const icon: IconName = p === 'high' ? 'arrowUp' : p === 'low' ? 'arrowDown' : 'arrowRight'
  return (
    <span class={cx('priority', `priority-${p === 'high' ? 'high' : p === 'low' ? 'low' : 'normal'}`)} title={name}>
      <Icon name={icon} size={14} />
      <span class="priority-label">{name}</span>
    </span>
  )
}

// --- Sections ------------------------------------------------------------------------------------

/** A collapsible block whose open state the app keeps across screens and reloads. */
export function Section(p: { id: string; title: string; count?: number; actions?: ComponentChildren; children?: ComponentChildren }) {
  const [s, app] = useApp()
  const open = !s.closedSections.includes(p.id)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (s.focusSection !== p.id) return
    ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    app.set({ focusSection: null })
  }, [s.focusSection])
  return (
    <section ref={ref} class={cx('section', !open && 'is-closed')}>
      <header class="section-head">
        <button type="button" class="section-toggle" aria-expanded={open} onClick={() => app.toggleSection(p.id)}>
          <Icon name={open ? 'down' : 'next'} size={14} />
          <span class="section-title">{p.title}</span>
          {p.count !== undefined ? <span class="count">{p.count}</span> : null}
        </button>
        {p.actions ? <div class="section-actions">{p.actions}</div> : null}
      </header>
      {open ? <div class="section-body">{p.children}</div> : null}
    </section>
  )
}

// --- Form controls -------------------------------------------------------------------------------

export function Field({ label, hideLabel, children, hint }: { label: string; hideLabel?: boolean; children: ComponentChildren; hint?: string }) {
  return (
    <label class={cx('field', hideLabel && 'field-bare')}>
      {hideLabel ? null : <span class="field-label">{label}</span>}
      {children}
      {hint ? <span class="field-hint">{hint}</span> : null}
    </label>
  )
}

/** For searching: lower case, without accents, so "nguyen" finds "Nguyễn" and "e" finds "é". */
export const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()

/** How many matches a list draws at once; typing narrows the rest. */
const MAX_SHOWN = 300

/**
 * A dropdown with a search box: a button showing the choice, and a list under it that the typed
 * words narrow (case and accents ignored). ↑ ↓ move, Enter picks, Esc closes.
 */
export function Select(p: { label: string; hideLabel?: boolean; value: string; options: readonly Option[]; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const current = p.options.find((o) => o.value === p.value)
  const close = (focus = true) => {
    setOpen(false)
    if (focus) button.current?.focus()
  }
  return (
    <div class={cx('field', p.hideLabel && 'field-bare')}>
      {p.hideLabel ? null : <span class="field-label">{p.label}</span>}
      <button
        ref={button}
        type="button"
        class={cx('control', 'select-btn', open && 'is-open')}
        aria-label={p.hideLabel ? p.label : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={current?.label}
        disabled={p.disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {current?.color ? <span class="dot" style={{ background: current.color }} /> : null}
        <span class="select-value">{current?.label ?? ''}</span>
        <Icon name="down" size={14} class="select-caret" />
      </button>
      {open && button.current ? (
        <SelectList
          anchor={button.current}
          label={p.label}
          options={p.options}
          value={p.value}
          onPick={(value) => {
            close()
            if (value !== p.value) p.onChange(value)
          }}
          onClose={close}
        />
      ) : null}
    </div>
  )
}

function SelectList(p: { anchor: HTMLElement; label: string; options: readonly Option[]; value: string; onPick: (value: string) => void; onClose: (focus?: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const words = fold(query).split(/\s+/).filter(Boolean)
  const matches = words.length ? p.options.filter((o) => words.every((w) => fold(o.label).includes(w))) : p.options
  const shown = matches.slice(0, MAX_SHOWN)
  // Start on the current choice.
  useLayoutEffect(() => {
    const at = shown.findIndex((o) => o.value === p.value)
    setActive(at < 0 ? 0 : at)
  }, [])
  useEffect(() => setActive(0), [query])
  useLayoutEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, query])
  // Placed under the button (above it when there is no room), clear of the window's edges.
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null)
  useLayoutEffect(() => {
    const r = p.anchor.getBoundingClientRect()
    const width = Math.min(Math.max(r.width, 220), window.innerWidth - 8)
    const left = Math.max(4, Math.min(r.left, window.innerWidth - width - 4))
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const up = below < 220 && above > below
    const maxHeight = Math.min(340, up ? above : below)
    setPos({ left, width, maxHeight, top: up ? r.top - 4 - maxHeight : r.bottom + 4 })
  }, [])
  useEffect(() => {
    const outside = (e: Event) => {
      const t = e.target as Node
      if (box.current?.contains(t) || p.anchor.contains(t)) return
      p.onClose(false)
    }
    const scrolled = (e: Event) => {
      if (box.current?.contains(e.target as Node)) return
      p.onClose(false)
    }
    window.addEventListener('pointerdown', outside, true)
    document.addEventListener('scroll', scrolled, true)
    window.addEventListener('resize', scrolled)
    window.addEventListener('blur', scrolled)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('scroll', scrolled, true)
      window.removeEventListener('resize', scrolled)
      window.removeEventListener('blur', scrolled)
    }
  }, [])
  return (
    <div
      ref={box}
      class="select-pop"
      style={pos ? { left: `${pos.left}px`, top: `${pos.top}px`, width: `${pos.width}px`, maxHeight: `${pos.maxHeight}px` } : { visibility: 'hidden' }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          p.onClose()
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          if (shown.length) setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          const pick = shown[active]
          if (pick) p.onPick(pick.value)
        } else if (e.key === 'Tab') p.onClose(false)
      }}
    >
      <div class="select-search">
        <Icon name="search" size={14} />
        <input
          type="text"
          aria-label={`Search ${p.label}`}
          placeholder="Search"
          value={query}
          ref={(el) => el?.focus({ preventScroll: true })}
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
        />
      </div>
      <ul ref={list} class="select-list" role="listbox" aria-label={p.label}>
        {shown.map((o, i) => (
          <li
            key={o.value}
            data-index={i}
            role="option"
            aria-selected={o.value === p.value}
            class={cx('select-option', i === active && 'is-active', o.value === p.value && 'is-chosen')}
            onPointerMove={() => i !== active && setActive(i)}
            onClick={() => p.onPick(o.value)}
          >
            {o.color ? <span class="dot" style={{ background: o.color }} /> : null}
            <span class="select-option-label">{o.label}</span>
            <span class="select-check">{o.value === p.value ? <Icon name="check" size={13} /> : null}</span>
          </li>
        ))}
        {!matches.length ? <li class="select-empty">{p.options.length ? 'No match' : 'No options'}</li> : null}
        {matches.length > shown.length ? <li class="select-empty">{`${matches.length - shown.length} more: type to narrow`}</li> : null}
      </ul>
    </div>
  )
}

export function Input(p: {
  label: string
  hideLabel?: boolean
  value: string
  onInput: (value: string) => void
  onEnter?: () => void
  placeholder?: string
  type?: 'text' | 'search' | 'password'
  invalid?: boolean
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (p.autoFocus) ref.current?.focus({ preventScroll: true })
  }, [])
  return (
    <Field label={p.label} hideLabel={p.hideLabel}>
      <input
        ref={ref}
        class={cx('control', p.invalid && 'is-invalid')}
        aria-label={p.label}
        type={p.type ?? 'text'}
        value={p.value}
        placeholder={p.placeholder}
        onInput={(e) => p.onInput((e.currentTarget as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') p.onEnter?.()
        }}
      />
    </Field>
  )
}

/** A text box that grows with what is typed; Ctrl/Cmd+Enter submits. */
export function Textarea(p: {
  label: string
  hideLabel?: boolean
  value: string
  onInput: (value: string) => void
  onSubmit?: () => void
  onPaste?: (e: ClipboardEvent) => void
  placeholder?: string
  rows?: number
  maxRows?: number
  autoFocus?: boolean
  /** Enter sends, Shift+Enter breaks the line (a chat); otherwise Ctrl/Cmd+Enter sends. */
  enterSends?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const line = parseFloat(getComputedStyle(el).lineHeight) || 18
    const max = line * (p.maxRows ?? 12) + 16
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
  }, [p.value])
  useEffect(() => {
    if (p.autoFocus) ref.current?.focus({ preventScroll: true })
  }, [])
  return (
    <Field label={p.label} hideLabel={p.hideLabel}>
      <textarea
        ref={ref}
        class="control textarea"
        aria-label={p.label}
        rows={p.rows ?? 3}
        value={p.value}
        placeholder={p.placeholder}
        onInput={(e) => p.onInput((e.currentTarget as HTMLTextAreaElement).value)}
        onPaste={(e) => p.onPaste?.(e as unknown as ClipboardEvent)}
        onKeyDown={(e) => {
          // Never while an input method (Vietnamese, Japanese…) is still composing a word.
          if (e.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (p.enterSends && !e.shiftKey))) {
            e.preventDefault()
            p.onSubmit?.()
          }
        }}
      />
    </Field>
  )
}

export function Checkbox(p: { label: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <label class={cx('checkbox', p.disabled && 'is-disabled')}>
      <input type="checkbox" checked={p.checked} disabled={p.disabled} onChange={(e) => p.onChange((e.currentTarget as HTMLInputElement).checked)} />
      <span>
        {p.label}
        {p.hint ? <span class="field-hint">{p.hint}</span> : null}
      </span>
    </label>
  )
}

/** Backlog's segmented tabs, each with its count. */
export function Segmented<T extends string>(p: { options: readonly { value: T; label: string }[]; value: T; counts?: Record<string, number>; onChange: (v: T) => void }) {
  return (
    <div class="segmented" role="tablist">
      {p.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === p.value}
          class={cx('segment', o.value === p.value && 'is-active')}
          onClick={() => p.onChange(o.value)}
        >
          {o.label}
          {p.counts?.[o.value] !== undefined ? <span class="count">{p.counts[o.value]}</span> : null}
        </button>
      ))}
    </div>
  )
}

// --- Menu: right-click and ⋯ ----------------------------------------------------------------------

export type MenuItem = { label: string; icon?: IconName; onSelect: () => void; danger?: boolean; disabled?: boolean } | 'separator'
type MenuState = { x: number; y: number; items: MenuItem[] } | null
const menuStore = new Store<{ menu: MenuState }>({ menu: null })

/** Opens the menu at the pointer (right-click) or under the element that was pressed (⋯). */
export function openMenu(e: MouseEvent, items: MenuItem[]): void {
  e.preventDefault()
  e.stopPropagation()
  const fromKeyboardOrButton = e.type !== 'contextmenu'
  let x = e.clientX
  let y = e.clientY
  if (fromKeyboardOrButton && e.currentTarget instanceof Element) {
    const r = e.currentTarget.getBoundingClientRect()
    x = r.right
    y = r.bottom + 2
  }
  menuStore.set({ menu: { x, y, items } })
}

export const closeMenu = () => menuStore.set({ menu: null })

/** Right-click handler props for an element. */
export const contextMenu = (items: () => MenuItem[]) => ({
  onContextMenu: (e: MouseEvent) => openMenu(e, items())
})

/** The one floating menu; kept inside the panel and closed on any outside press, Esc or scroll. */
export function MenuLayer() {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useEffect(() => menuStore.subscribe(() => redraw(undefined)), [])
  const menu = menuStore.state.menu
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null)
    const r = ref.current.getBoundingClientRect()
    const left = Math.max(4, Math.min(menu.x - (menu.x > window.innerWidth / 2 ? r.width : 0), window.innerWidth - r.width - 4))
    const top = menu.y + r.height > window.innerHeight - 4 ? Math.max(4, menu.y - r.height) : menu.y
    setPos({ left, top })
  }, [menu])
  useEffect(() => {
    if (!menu) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return
      closeMenu()
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    document.addEventListener('scroll', close, true)
    ref.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [menu])
  if (!menu) return null
  return (
    <div
      ref={ref}
      class="menu"
      role="menu"
      style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : { left: `${menu.x}px`, top: `${menu.y}px`, visibility: 'hidden' }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])]
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
      }}
    >
      {menu.items.map((item, i) =>
        item === 'separator' ? (
          <div key={i} class="menu-sep" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            class={cx('menu-item', item.danger && 'is-danger')}
            disabled={item.disabled}
            onClick={() => {
              closeMenu()
              item.onSelect()
            }}
          >
            {item.icon ? <Icon name={item.icon} size={14} /> : <span class="menu-gap" />}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  )
}

/** The ⋯ button that opens the same menu as a right-click. */
export function MoreButton({ label, items }: { label: string; items: () => MenuItem[] }) {
  return <IconButton icon="more" label={label} onClick={(e) => openMenu(e, items())} class="more-btn" />
}

// --- Bottom sheet --------------------------------------------------------------------------------

/** A panel that rises from the bottom over the screen, with a dimmed backdrop; Esc closes it. */
export function Sheet(p: { open: boolean; title: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren }) {
  useEffect(() => {
    if (!p.open) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [p.open])
  return (
    <div class={cx('sheet-layer', p.open && 'is-open')} aria-hidden={!p.open}>
      <div class="sheet-backdrop" onClick={p.onClose} />
      <div class="sheet" role="dialog" aria-label={p.title}>
        <div class="sheet-grip" onClick={p.onClose} />
        <header class="sheet-head">
          <span class="sheet-title">{p.title}</span>
          <IconButton icon="close" label="Close" onClick={p.onClose} />
        </header>
        <div class="sheet-body">{p.open ? p.children : null}</div>
        {p.footer && p.open ? <footer class="sheet-foot">{p.footer}</footer> : null}
      </div>
    </div>
  )
}

export type Children = ComponentChildren
export type Elem = JSX.Element

// --- Dialogs: confirm and pick a member --------------------------------------------------------

type ConfirmOptions = { title: string; message?: string; yes: string; no?: string; danger?: boolean }
type MemberOptions = { title: string; projectId: number; current: number | null }
type DialogState =
  | { kind: 'confirm'; o: ConfirmOptions; done: (yes: boolean) => void }
  | { kind: 'member'; o: MemberOptions; done: (pick: { id: number | null; name: string } | undefined) => void }
  | null
const dialogStore = new Store<{ dialog: DialogState }>({ dialog: null })

/** What the app asks through (app.ts `Dialogs`): drawn by DialogLayer, one at a time. */
export const uiDialogs: Dialogs = {
  confirm: (o) => new Promise((done) => dialogStore.set({ dialog: { kind: 'confirm', o, done } })),
  pickMember: (o) => new Promise((done) => dialogStore.set({ dialog: { kind: 'member', o, done } }))
}

const closeDialog = () => dialogStore.set({ dialog: null })

/**
 * A user's avatar: their Backlog icon once it loads (one request per user, cached), initials until
 * then or when they have none.
 */
export function Avatar({ userId, name, size = 28 }: { userId?: number | null; name: string | null; size?: number }) {
  const app = useContext(AppContext)!
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    setSrc(null)
    if (!userId) return
    let live = true
    app
      .userIcon(userId)
      .then((url) => live && setSrc(url))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [userId])
  const initials = (name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span class="avatar" style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }} aria-hidden="true" title={name ?? undefined}>
      {src ? <img src={src} alt="" /> : initials}
    </span>
  )
}

function ConfirmDialog({ o, done }: { o: ConfirmOptions; done: (yes: boolean) => void }) {
  const answer = (yes: boolean) => {
    closeDialog()
    done(yes)
  }
  return (
    <div class="dialog" role="alertdialog" aria-modal="true" aria-label={o.title} onKeyDown={(e) => e.key === 'Escape' && answer(false)}>
      <div class="dialog-title">{o.title}</div>
      {o.message ? <div class="dialog-message">{o.message}</div> : null}
      {/* Yes on the left, No on the right and the default: a stray Enter answers No. */}
      <div class="dialog-buttons">
        <button type="button" class={cx('btn', o.danger ? 'btn-danger-soft' : 'btn-default')} onClick={() => answer(true)}>
          {o.yes}
        </button>
        <button type="button" class="btn btn-primary" ref={(el) => el?.focus({ preventScroll: true })} onClick={() => answer(false)}>
          {o.no ?? 'No'}
        </button>
      </div>
    </div>
  )
}

function MemberDialog({ o, done }: { o: MemberOptions; done: (pick: { id: number | null; name: string } | undefined) => void }) {
  const app = useContext(AppContext)!
  const [members, setMembers] = useState<Option[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  useEffect(() => {
    app.membersOf(o.projectId).then(setMembers, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  const answer = (pick: { id: number | null; name: string } | undefined) => {
    closeDialog()
    done(pick)
  }
  const words = fold(query).split(/\s+/).filter(Boolean)
  const list: { id: number | null; name: string }[] = [
    ...(words.length ? [] : [{ id: null, name: 'Unassigned' }]),
    ...(members ?? []).filter((m) => words.every((w) => fold(m.label).includes(w))).map((m) => ({ id: Number(m.value), name: m.label }))
  ]
  useEffect(() => setActive(0), [query])
  return (
    <div
      class="dialog dialog-picker"
      role="dialog"
      aria-modal="true"
      aria-label={o.title}
      onKeyDown={(e) => {
        if (e.key === 'Escape') answer(undefined)
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          if (list.length) setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length)
        } else if (e.key === 'Enter' && list[active]) {
          e.preventDefault()
          answer(list[active])
        }
      }}
    >
      <div class="dialog-title">{o.title}</div>
      <div class="search-row">
        <Icon name="search" />
        <input class="search-input" aria-label="Search members" placeholder="Search members" value={query} ref={(el) => el?.focus({ preventScroll: true })} onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)} />
      </div>
      {error ? <div class="notice tone-danger">{error}</div> : null}
      {!members && !error ? <Spinner label="Loading members" /> : null}
      <ul class="member-list" role="listbox" aria-label="Members">
        {list.map((m, i) => (
          <li key={String(m.id)} role="option" aria-selected={m.id === o.current} class={cx('member', i === active && 'is-active')} onPointerMove={() => i !== active && setActive(i)} onClick={() => answer(m)}>
            {m.id === null ? <span class="avatar avatar-none" aria-hidden="true">–</span> : <Avatar userId={m.id} name={m.name} size={24} />}
            <span class="member-name">{m.name}</span>
            {m.id === o.current ? <Icon name="check" size={14} class="member-check" /> : null}
          </li>
        ))}
        {members && !list.length ? (
          <li>
            <Empty icon="user">No member matches.</Empty>
          </li>
        ) : null}
      </ul>
      <div class="dialog-buttons end">
        <button type="button" class="btn btn-default" onClick={() => answer(undefined)}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/** The one dialog at a time, over a dimmed panel; a press outside cancels. */
export function DialogLayer() {
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useEffect(() => dialogStore.subscribe(() => redraw(undefined)), [])
  const d = dialogStore.state.dialog
  if (!d) return null
  const cancel = () => {
    closeDialog()
    if (d.kind === 'confirm') d.done(false)
    else d.done(undefined)
  }
  return (
    <div class="dialog-layer">
      <div class="dialog-backdrop" onClick={cancel} />
      {d.kind === 'confirm' ? <ConfirmDialog o={d.o} done={d.done} /> : <MemberDialog o={d.o} done={d.done} />}
    </div>
  )
}
