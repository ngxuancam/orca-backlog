import { createContext, h } from './vendor/preact.js';
import { useContext, useEffect, useLayoutEffect, useReducer, useRef, useState } from './vendor/hooks.js';
import { textOn, typeColor } from './app.js';
import { Icon } from './icons.js';
import { Store } from './store.js';
// --- The app -------------------------------------------------------------------------------------
export const AppContext = createContext(null);
/** The app and its state; the calling view draws again on every change. */
export function useApp() {
    const app = useContext(AppContext);
    const [, redraw] = useReducer((n) => n + 1, 0);
    useEffect(() => app.store.subscribe(() => redraw(undefined)), [app]);
    return [app.state, app];
}
export const cx = (...names) => names.filter(Boolean).join(' ');
export function Button(p) {
    return (h("button", { type: p.type ?? 'button', class: cx('btn', `btn-${p.variant ?? 'default'}`, p.size === 'sm' && 'btn-sm', p.active && 'is-active', p.class), title: p.title, disabled: p.disabled, onClick: (e) => p.onClick?.(e) },
        p.icon ? h(Icon, { name: p.icon, size: p.size === 'sm' ? 14 : 16 }) : null,
        p.children ? h("span", null, p.children) : null));
}
export function IconButton(p) {
    return (h("button", { type: "button", class: cx('icon-btn', p.active && 'is-active', p.tone === 'danger' && 'is-danger', p.class), title: p.label, "aria-label": p.label, disabled: p.disabled, onClick: (e) => {
            e.stopPropagation();
            p.onClick?.(e);
        } },
        h(Icon, { name: p.icon })));
}
// --- Feedback ------------------------------------------------------------------------------------
export function Spinner({ label }) {
    return (h("div", { class: "spinner", role: "status" },
        h("span", { class: "spinner-dot" }),
        label ? h("span", { class: "muted" }, label) : null));
}
/** What an empty list shows: never a blank space. */
export function Empty({ icon = 'list', children }) {
    return (h("div", { class: "empty" },
        h(Icon, { name: icon, size: 18 }),
        h("span", null, children)));
}
export function Callout({ tone = 'neutral', title, children }) {
    return (h("div", { class: `callout tone-${tone}`, role: tone === 'danger' ? 'alert' : undefined },
        tone === 'warning' || tone === 'danger' ? h(Icon, { name: "warning" }) : null,
        h("div", null,
            title ? h("div", { class: "callout-title" }, title) : null,
            children ? h("div", { class: "callout-body" }, children) : null)));
}
/** The last result for one place, as a line where the action was. */
export function Notice({ place }) {
    const [s] = useApp();
    const n = s.notice;
    if (n?.place !== place)
        return null;
    return h("div", { class: `notice tone-${n.tone}` }, n.text);
}
/** A coloured pill, as Backlog draws statuses and issue types. */
/** A label in a colour from Backlog: an issue type (`type`, squarer; text by contrast) or a status (round, white text as Backlog draws it). */
export function Pill({ color: given, children, title, kind = 'status' }) {
    // Issue types take Backlog's dark shade in a dark theme (the panel redraws on a theme change).
    const color = kind === 'type' ? typeColor(given, document.documentElement.classList.contains('dark')) : given;
    return (h("span", { class: cx('pill', `pill-${kind}`), style: color ? { background: color, color: kind === 'type' ? textOn(color) : '#fff' } : undefined, title: title }, children));
}
export function Badge({ tone = 'neutral', children }) {
    return h("span", { class: `badge tone-${tone}` }, children);
}
// Backlog's colours for its four default statuses; custom statuses carry their own.
const STATUS_COLORS = { 1: '#ed8077', 2: '#4488c5', 3: '#5eb5a6', 4: '#b0be3c' };
export const statusColor = (id, own) => own || STATUS_COLORS[id] || '#a1a1aa';
/** Backlog's priority arrows: High up in red, Normal across, Low down in green. */
export function Priority({ name }) {
    if (!name)
        return null;
    const p = name.toLowerCase();
    const icon = p === 'high' ? 'arrowUp' : p === 'low' ? 'arrowDown' : 'arrowRight';
    return (h("span", { class: cx('priority', `priority-${p === 'high' ? 'high' : p === 'low' ? 'low' : 'normal'}`), title: name },
        h(Icon, { name: icon, size: 14 }),
        h("span", { class: "priority-label" }, name)));
}
// --- Sections ------------------------------------------------------------------------------------
/** A collapsible block whose open state the app keeps across screens and reloads. */
export function Section(p) {
    const [s, app] = useApp();
    const open = !s.closedSections.includes(p.id);
    const ref = useRef(null);
    useEffect(() => {
        if (s.focusSection !== p.id)
            return;
        ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        app.set({ focusSection: null });
    }, [s.focusSection]);
    return (h("section", { ref: ref, class: cx('section', !open && 'is-closed') },
        h("header", { class: "section-head" },
            h("button", { type: "button", class: "section-toggle", "aria-expanded": open, onClick: () => app.toggleSection(p.id) },
                h(Icon, { name: open ? 'down' : 'next', size: 14 }),
                h("span", { class: "section-title" }, p.title),
                p.count !== undefined ? h("span", { class: "count" }, p.count) : null),
            p.actions ? h("div", { class: "section-actions" }, p.actions) : null),
        open ? h("div", { class: "section-body" }, p.children) : null));
}
// --- Form controls -------------------------------------------------------------------------------
export function Field({ label, hideLabel, children, hint }) {
    return (h("label", { class: cx('field', hideLabel && 'field-bare') },
        hideLabel ? null : h("span", { class: "field-label" }, label),
        children,
        hint ? h("span", { class: "field-hint" }, hint) : null));
}
/** For searching: lower case, without accents, so "nguyen" finds "Nguyễn" and "e" finds "é". */
export const fold = (text) => text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
/** How many matches a list draws at once; typing narrows the rest. */
const MAX_SHOWN = 300;
/**
 * A dropdown with a search box: a button showing the choice, and a list under it that the typed
 * words narrow (case and accents ignored). ↑ ↓ move, Enter picks, Esc closes.
 */
export function Select(p) {
    const [open, setOpen] = useState(false);
    const button = useRef(null);
    const current = p.options.find((o) => o.value === p.value);
    const close = (focus = true) => {
        setOpen(false);
        if (focus)
            button.current?.focus();
    };
    return (h("div", { class: cx('field', p.hideLabel && 'field-bare') },
        p.hideLabel ? null : h("span", { class: "field-label" }, p.label),
        h("button", { ref: button, type: "button", class: cx('control', 'select-btn', open && 'is-open'), "aria-label": p.hideLabel ? p.label : undefined, "aria-haspopup": "listbox", "aria-expanded": open, title: current?.label, disabled: p.disabled, onClick: () => setOpen(!open), onKeyDown: (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setOpen(true);
                }
            } },
            current?.color ? h("span", { class: "dot", style: { background: current.color } }) : null,
            h("span", { class: "select-value" }, current?.label ?? ''),
            h(Icon, { name: "down", size: 14, class: "select-caret" })),
        open && button.current ? (h(SelectList, { anchor: button.current, label: p.label, options: p.options, value: p.value, onPick: (value) => {
                close();
                if (value !== p.value)
                    p.onChange(value);
            }, onClose: close })) : null));
}
function SelectList(p) {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const box = useRef(null);
    const list = useRef(null);
    const words = fold(query).split(/\s+/).filter(Boolean);
    const matches = words.length ? p.options.filter((o) => words.every((w) => fold(o.label).includes(w))) : p.options;
    const shown = matches.slice(0, MAX_SHOWN);
    // Start on the current choice.
    useLayoutEffect(() => {
        const at = shown.findIndex((o) => o.value === p.value);
        setActive(at < 0 ? 0 : at);
    }, []);
    useEffect(() => setActive(0), [query]);
    useLayoutEffect(() => {
        list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active, query]);
    // Placed under the button (above it when there is no room), clear of the window's edges.
    const [pos, setPos] = useState(null);
    useLayoutEffect(() => {
        const r = p.anchor.getBoundingClientRect();
        const width = Math.min(Math.max(r.width, 220), window.innerWidth - 8);
        const left = Math.max(4, Math.min(r.left, window.innerWidth - width - 4));
        const below = window.innerHeight - r.bottom - 8;
        const above = r.top - 8;
        const up = below < 220 && above > below;
        const maxHeight = Math.min(340, up ? above : below);
        setPos({ left, width, maxHeight, top: up ? r.top - 4 - maxHeight : r.bottom + 4 });
    }, []);
    useEffect(() => {
        const outside = (e) => {
            const t = e.target;
            if (box.current?.contains(t) || p.anchor.contains(t))
                return;
            p.onClose(false);
        };
        const scrolled = (e) => {
            if (box.current?.contains(e.target))
                return;
            p.onClose(false);
        };
        window.addEventListener('pointerdown', outside, true);
        document.addEventListener('scroll', scrolled, true);
        window.addEventListener('resize', scrolled);
        window.addEventListener('blur', scrolled);
        return () => {
            window.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('scroll', scrolled, true);
            window.removeEventListener('resize', scrolled);
            window.removeEventListener('blur', scrolled);
        };
    }, []);
    return (h("div", { ref: box, class: "select-pop", style: pos ? { left: `${pos.left}px`, top: `${pos.top}px`, width: `${pos.width}px`, maxHeight: `${pos.maxHeight}px` } : { visibility: 'hidden' }, onKeyDown: (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                p.onClose();
            }
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (shown.length)
                    setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length);
            }
            else if (e.key === 'Enter') {
                e.preventDefault();
                const pick = shown[active];
                if (pick)
                    p.onPick(pick.value);
            }
            else if (e.key === 'Tab')
                p.onClose(false);
        } },
        h("div", { class: "select-search" },
            h(Icon, { name: "search", size: 14 }),
            h("input", { type: "text", "aria-label": `Search ${p.label}`, placeholder: "Search", value: query, ref: (el) => el?.focus({ preventScroll: true }), onInput: (e) => setQuery(e.currentTarget.value) })),
        h("ul", { ref: list, class: "select-list", role: "listbox", "aria-label": p.label },
            shown.map((o, i) => (h("li", { key: o.value, "data-index": i, role: "option", "aria-selected": o.value === p.value, class: cx('select-option', i === active && 'is-active', o.value === p.value && 'is-chosen'), onPointerMove: () => i !== active && setActive(i), onClick: () => p.onPick(o.value) },
                o.color ? h("span", { class: "dot", style: { background: o.color } }) : null,
                h("span", { class: "select-option-label" }, o.label),
                h("span", { class: "select-check" }, o.value === p.value ? h(Icon, { name: "check", size: 13 }) : null)))),
            !matches.length ? h("li", { class: "select-empty" }, p.options.length ? 'No match' : 'No options') : null,
            matches.length > shown.length ? h("li", { class: "select-empty" }, `${matches.length - shown.length} more: type to narrow`) : null)));
}
export function Input(p) {
    const ref = useRef(null);
    useEffect(() => {
        if (p.autoFocus)
            ref.current?.focus({ preventScroll: true });
    }, []);
    return (h(Field, { label: p.label, hideLabel: p.hideLabel },
        h("input", { ref: ref, class: cx('control', p.invalid && 'is-invalid'), "aria-label": p.label, type: p.type ?? 'text', value: p.value, placeholder: p.placeholder, onInput: (e) => p.onInput(e.currentTarget.value), onKeyDown: (e) => {
                if (e.key === 'Enter')
                    p.onEnter?.();
            } })));
}
/** A text box that grows with what is typed; Ctrl/Cmd+Enter submits. */
export function Textarea(p) {
    const ref = useRef(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el)
            return;
        el.style.height = 'auto';
        const line = parseFloat(getComputedStyle(el).lineHeight) || 18;
        const max = line * (p.maxRows ?? 12) + 16;
        el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    }, [p.value]);
    useEffect(() => {
        if (p.autoFocus)
            ref.current?.focus({ preventScroll: true });
    }, []);
    return (h(Field, { label: p.label, hideLabel: p.hideLabel },
        h("textarea", { ref: ref, class: "control textarea", "aria-label": p.label, rows: p.rows ?? 3, value: p.value, placeholder: p.placeholder, onInput: (e) => p.onInput(e.currentTarget.value), onPaste: (e) => p.onPaste?.(e), onKeyDown: (e) => {
                // Never while an input method (Vietnamese, Japanese…) is still composing a word.
                if (e.isComposing || e.keyCode === 229)
                    return;
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (p.enterSends && !e.shiftKey))) {
                    e.preventDefault();
                    p.onSubmit?.();
                }
            } })));
}
export function Checkbox(p) {
    return (h("label", { class: cx('checkbox', p.disabled && 'is-disabled') },
        h("input", { type: "checkbox", checked: p.checked, disabled: p.disabled, onChange: (e) => p.onChange(e.currentTarget.checked) }),
        h("span", null,
            p.label,
            p.hint ? h("span", { class: "field-hint" }, p.hint) : null)));
}
/** Backlog's segmented tabs, each with its count. */
export function Segmented(p) {
    return (h("div", { class: "segmented", role: "tablist" }, p.options.map((o) => (h("button", { key: o.value, type: "button", role: "tab", "aria-selected": o.value === p.value, class: cx('segment', o.value === p.value && 'is-active'), onClick: () => p.onChange(o.value) },
        o.label,
        p.counts?.[o.value] !== undefined ? h("span", { class: "count" }, p.counts[o.value]) : null)))));
}
const menuStore = new Store({ menu: null });
/** Opens the menu at the pointer (right-click) or under the element that was pressed (⋯). */
export function openMenu(e, items) {
    e.preventDefault();
    e.stopPropagation();
    const fromKeyboardOrButton = e.type !== 'contextmenu';
    let x = e.clientX;
    let y = e.clientY;
    if (fromKeyboardOrButton && e.currentTarget instanceof Element) {
        const r = e.currentTarget.getBoundingClientRect();
        x = r.right;
        y = r.bottom + 2;
    }
    menuStore.set({ menu: { x, y, items } });
}
export const closeMenu = () => menuStore.set({ menu: null });
/** Right-click handler props for an element. */
export const contextMenu = (items) => ({
    onContextMenu: (e) => openMenu(e, items())
});
/** The one floating menu; kept inside the panel and closed on any outside press, Esc or scroll. */
export function MenuLayer() {
    const [, redraw] = useReducer((n) => n + 1, 0);
    useEffect(() => menuStore.subscribe(() => redraw(undefined)), []);
    const menu = menuStore.state.menu;
    const ref = useRef(null);
    const [pos, setPos] = useState(null);
    useLayoutEffect(() => {
        if (!menu || !ref.current)
            return setPos(null);
        const r = ref.current.getBoundingClientRect();
        const left = Math.max(4, Math.min(menu.x - (menu.x > window.innerWidth / 2 ? r.width : 0), window.innerWidth - r.width - 4));
        const top = menu.y + r.height > window.innerHeight - 4 ? Math.max(4, menu.y - r.height) : menu.y;
        setPos({ left, top });
    }, [menu]);
    useEffect(() => {
        if (!menu)
            return;
        const close = (e) => {
            if (e instanceof KeyboardEvent && e.key !== 'Escape')
                return;
            if (e.type === 'pointerdown' && ref.current?.contains(e.target))
                return;
            closeMenu();
        };
        window.addEventListener('pointerdown', close, true);
        window.addEventListener('keydown', close, true);
        window.addEventListener('blur', close);
        window.addEventListener('resize', close);
        document.addEventListener('scroll', close, true);
        ref.current?.querySelector('button:not([disabled])')?.focus();
        return () => {
            window.removeEventListener('pointerdown', close, true);
            window.removeEventListener('keydown', close, true);
            window.removeEventListener('blur', close);
            window.removeEventListener('resize', close);
            document.removeEventListener('scroll', close, true);
        };
    }, [menu]);
    if (!menu)
        return null;
    return (h("div", { ref: ref, class: "menu", role: "menu", style: pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : { left: `${menu.x}px`, top: `${menu.y}px`, visibility: 'hidden' }, onKeyDown: (e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')
                return;
            e.preventDefault();
            const buttons = [...(ref.current?.querySelectorAll('button:not([disabled])') ?? [])];
            const at = buttons.indexOf(document.activeElement);
            buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        } }, menu.items.map((item, i) => item === 'separator' ? (h("div", { key: i, class: "menu-sep", role: "separator" })) : (h("button", { key: i, type: "button", role: "menuitem", class: cx('menu-item', item.danger && 'is-danger'), disabled: item.disabled, onClick: () => {
            closeMenu();
            item.onSelect();
        } },
        item.icon ? h(Icon, { name: item.icon, size: 14 }) : h("span", { class: "menu-gap" }),
        h("span", null, item.label))))));
}
/** The ⋯ button that opens the same menu as a right-click. */
export function MoreButton({ label, items }) {
    return h(IconButton, { icon: "more", label: label, onClick: (e) => openMenu(e, items()), class: "more-btn" });
}
// --- Bottom sheet --------------------------------------------------------------------------------
/** A panel that rises from the bottom over the screen, with a dimmed backdrop; Esc closes it. */
export function Sheet(p) {
    useEffect(() => {
        if (!p.open)
            return;
        const key = (e) => e.key === 'Escape' && p.onClose();
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, [p.open]);
    return (h("div", { class: cx('sheet-layer', p.open && 'is-open'), "aria-hidden": !p.open },
        h("div", { class: "sheet-backdrop", onClick: p.onClose }),
        h("div", { class: "sheet", role: "dialog", "aria-label": p.title },
            h("div", { class: "sheet-grip", onClick: p.onClose }),
            h("header", { class: "sheet-head" },
                h("span", { class: "sheet-title" }, p.title),
                h(IconButton, { icon: "close", label: "Close", onClick: p.onClose })),
            h("div", { class: "sheet-body" }, p.open ? p.children : null),
            p.footer && p.open ? h("footer", { class: "sheet-foot" }, p.footer) : null)));
}
const dialogStore = new Store({ dialog: null });
/** What the app asks through (app.ts `Dialogs`): drawn by DialogLayer, one at a time. */
export const uiDialogs = {
    confirm: (o) => new Promise((done) => dialogStore.set({ dialog: { kind: 'confirm', o, done } })),
    pickMember: (o) => new Promise((done) => dialogStore.set({ dialog: { kind: 'member', o, done } }))
};
const closeDialog = () => dialogStore.set({ dialog: null });
/**
 * A user's avatar: their Backlog icon once it loads (one request per user, cached), initials until
 * then or when they have none.
 */
export function Avatar({ userId, name, size = 28 }) {
    const app = useContext(AppContext);
    const [src, setSrc] = useState(null);
    useEffect(() => {
        setSrc(null);
        if (!userId)
            return;
        let live = true;
        app
            .userIcon(userId)
            .then((url) => live && setSrc(url))
            .catch(() => undefined);
        return () => {
            live = false;
        };
    }, [userId]);
    const initials = (name ?? '?')
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    return (h("span", { class: "avatar", style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }, "aria-hidden": "true", title: name ?? undefined }, src ? h("img", { src: src, alt: "" }) : initials));
}
function ConfirmDialog({ o, done }) {
    const answer = (yes) => {
        closeDialog();
        done(yes);
    };
    return (h("div", { class: "dialog", role: "alertdialog", "aria-modal": "true", "aria-label": o.title, onKeyDown: (e) => e.key === 'Escape' && answer(false) },
        h("div", { class: "dialog-title" }, o.title),
        o.message ? h("div", { class: "dialog-message" }, o.message) : null,
        h("div", { class: "dialog-buttons" },
            h("button", { type: "button", class: cx('btn', o.danger ? 'btn-danger-soft' : 'btn-default'), onClick: () => answer(true) }, o.yes),
            h("button", { type: "button", class: "btn btn-primary", ref: (el) => el?.focus({ preventScroll: true }), onClick: () => answer(false) }, o.no ?? 'No'))));
}
function MemberDialog({ o, done }) {
    const app = useContext(AppContext);
    const [members, setMembers] = useState(null);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    useEffect(() => {
        app.membersOf(o.projectId).then(setMembers, (e) => setError(e instanceof Error ? e.message : String(e)));
    }, []);
    const answer = (pick) => {
        closeDialog();
        done(pick);
    };
    const words = fold(query).split(/\s+/).filter(Boolean);
    const list = [
        ...(words.length ? [] : [{ id: null, name: 'Unassigned' }]),
        ...(members ?? []).filter((m) => words.every((w) => fold(m.label).includes(w))).map((m) => ({ id: Number(m.value), name: m.label }))
    ];
    useEffect(() => setActive(0), [query]);
    return (h("div", { class: "dialog dialog-picker", role: "dialog", "aria-modal": "true", "aria-label": o.title, onKeyDown: (e) => {
            if (e.key === 'Escape')
                answer(undefined);
            else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (list.length)
                    setActive((active + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length);
            }
            else if (e.key === 'Enter' && list[active]) {
                e.preventDefault();
                answer(list[active]);
            }
        } },
        h("div", { class: "dialog-title" }, o.title),
        h("div", { class: "search-row" },
            h(Icon, { name: "search" }),
            h("input", { class: "search-input", "aria-label": "Search members", placeholder: "Search members", value: query, ref: (el) => el?.focus({ preventScroll: true }), onInput: (e) => setQuery(e.currentTarget.value) })),
        error ? h("div", { class: "notice tone-danger" }, error) : null,
        !members && !error ? h(Spinner, { label: "Loading members" }) : null,
        h("ul", { class: "member-list", role: "listbox", "aria-label": "Members" },
            list.map((m, i) => (h("li", { key: String(m.id), role: "option", "aria-selected": m.id === o.current, class: cx('member', i === active && 'is-active'), onPointerMove: () => i !== active && setActive(i), onClick: () => answer(m) },
                m.id === null ? h("span", { class: "avatar avatar-none", "aria-hidden": "true" }, "\u2013") : h(Avatar, { userId: m.id, name: m.name, size: 24 }),
                h("span", { class: "member-name" }, m.name),
                m.id === o.current ? h(Icon, { name: "check", size: 14, class: "member-check" }) : null))),
            members && !list.length ? (h("li", null,
                h(Empty, { icon: "user" }, "No member matches."))) : null),
        h("div", { class: "dialog-buttons end" },
            h("button", { type: "button", class: "btn btn-default", onClick: () => answer(undefined) }, "Cancel"))));
}
/** The one dialog at a time, over a dimmed panel; a press outside cancels. */
export function DialogLayer() {
    const [, redraw] = useReducer((n) => n + 1, 0);
    useEffect(() => dialogStore.subscribe(() => redraw(undefined)), []);
    const d = dialogStore.state.dialog;
    if (!d)
        return null;
    const cancel = () => {
        closeDialog();
        if (d.kind === 'confirm')
            d.done(false);
        else
            d.done(undefined);
    };
    return (h("div", { class: "dialog-layer" },
        h("div", { class: "dialog-backdrop", onClick: cancel }),
        d.kind === 'confirm' ? h(ConfirmDialog, { o: d.o, done: d.done }) : h(MemberDialog, { o: d.o, done: d.done })));
}
