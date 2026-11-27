// Backlog's issue table: drag a column's edge to size it, press a header to sort, right-click a row
// (or ⋯) for its actions, Columns to pick what shows. Widths and columns are kept per table.
import { h } from './vendor/preact.js';
import { useRef, useState } from './vendor/hooks.js';
import { ago, COLUMN_ORDER, COLUMNS, columnsOf, MIN_WIDTH, widthOf } from './app.js';
import { Icon } from './icons.js';
import { Button, Checkbox, cx, Empty, openMenu, Pill, Priority, Spinner, statusColor, useApp } from './ui.js';
export const issueUrl = (space, key) => `https://${space}/view/${encodeURIComponent(key)}`;
/** What a right-click on an issue offers, wherever it is listed. */
export function issueMenu(app, key, summary, issue) {
    const space = app.state.session?.space ?? '';
    const url = issueUrl(space, key);
    return [
        { label: 'Open', icon: 'next', onSelect: () => app.openFromList(key) },
        ...(issue?.projectId
            ? [{ label: 'Assign to…', icon: 'user', onSelect: () => void app.assignIssue({ key, projectId: issue.projectId, assigneeId: issue.assigneeId ?? null }, 'issues') }]
            : []),
        { label: 'Open in browser', icon: 'external', onSelect: () => void app.linkAction('issues', url, 'browser') },
        { label: "Open in Orca's browser", icon: 'globe', onSelect: () => void app.linkAction('issues', url, 'orca') },
        'separator',
        { label: 'Copy key', icon: 'copy', onSelect: () => void app.copyText('issues', key, `Copied ${key}`) },
        ...(summary ? [{ label: 'Copy key and subject', icon: 'copy', onSelect: () => void app.copyText('issues', `${key} ${summary}`, `Copied ${key} and its subject`) }] : []),
        { label: 'Copy link', icon: 'link', onSelect: () => void app.linkAction('issues', url, 'copy') }
    ];
}
const today = () => new Date().toISOString().slice(0, 10);
function Cell({ column, row }) {
    switch (column) {
        case 'type':
            return h(Pill, { kind: "type", color: row.typeColor }, row.type);
        case 'key':
            return h("span", { class: "issue-key" }, row.key);
        case 'summary':
            return h("span", { class: "summary" }, row.summary);
        case 'status':
            return h(Pill, { color: statusColor(row.statusId, row.statusColor) }, row.status);
        case 'priority':
            return h(Priority, { name: row.priority });
        case 'due':
            return row.due ? h("span", { class: cx(row.due < today() && row.statusId !== 4 && 'overdue') }, row.due) : null;
        case 'created':
        case 'updated':
            return h("span", { title: new Date(row[column]).toLocaleString() }, ago(row[column]));
        case 'estimatedHours':
        case 'actualHours':
            return h("span", null, row[column] ?? '');
        default:
            return h("span", null, String(row[column] ?? ''));
    }
}
function ColumnPicker({ table, defaults, onClose }) {
    const [s, app] = useApp();
    const shown = columnsOf(s, table, defaults);
    return (h("div", { class: "column-picker" },
        h("div", { class: "column-grid" }, COLUMN_ORDER.map((c) => (h(Checkbox, { key: c, label: COLUMNS[c].label, checked: shown.includes(c), disabled: c === 'key', onChange: (on) => app.toggleColumn(table, defaults, c, on) })))),
        h("div", { class: "row-end" },
            h(Button, { size: "sm", variant: "ghost", icon: "refresh", onClick: () => app.resetColumns(table) }, "Reset columns and widths"),
            h(Button, { size: "sm", variant: "ghost", onClick: onClose }, "Done"))));
}
export function IssueTable(p) {
    const [s, app] = useApp();
    const [picking, setPicking] = useState(false);
    /** The width of the column being dragged, drawn live and saved on release. */
    const [drag, setDrag] = useState(null);
    const columns = columnsOf(s, p.table, p.defaults);
    const width = (c) => (drag?.column === c ? drag.width : widthOf(s, p.table, c));
    const total = columns.reduce((sum, c) => sum + width(c), 0);
    const startX = useRef(0);
    const startResize = (e, column) => {
        e.preventDefault();
        e.stopPropagation();
        const from = width(column);
        startX.current = e.clientX;
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        let last = from;
        const move = (ev) => {
            last = Math.max(MIN_WIDTH, from + ev.clientX - startX.current);
            setDrag({ column, width: last });
        };
        const up = () => {
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', up);
            target.removeEventListener('pointercancel', up);
            setDrag(null);
            app.setWidth(p.table, column, last);
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
    };
    const sortBy = (column) => {
        if (!COLUMNS[column]?.sortable)
            return;
        const direction = p.sort.column === column && p.sort.direction === 'asc' ? 'desc' : 'asc';
        p.onSort({ column, direction });
    };
    return (h("div", { class: "issue-table" },
        h("div", { class: "table-toolbar" },
            h("span", { class: "muted" }, p.list.loading && !p.list.rows.length ? 'Loading…' : `${p.list.rows.length} of ${p.list.total}`),
            h(Button, { size: "sm", variant: "ghost", icon: "columns", active: picking, onClick: () => setPicking(!picking) }, `Columns (${columns.length})`)),
        picking ? h(ColumnPicker, { table: p.table, defaults: p.defaults, onClose: () => setPicking(false) }) : null,
        p.list.error ? h("div", { class: "notice tone-danger" }, p.list.error) : null,
        h("div", { class: "table-scroll" },
            h("table", { class: "table", style: { width: `${total}px` }, "aria-label": p.label },
                h("colgroup", null, columns.map((c) => (h("col", { key: c, style: { width: `${width(c)}px` } })))),
                h("thead", null,
                    h("tr", null, columns.map((c) => {
                        const def = COLUMNS[c];
                        const sorted = p.sort.column === c;
                        return (h("th", { key: c, class: cx(def.sortable && 'sortable', sorted && 'is-sorted', def.align === 'end' && 'align-end'), "aria-sort": sorted ? (p.sort.direction === 'asc' ? 'ascending' : 'descending') : undefined, onClick: () => sortBy(c) },
                            h("span", { class: "th-label" }, def.label),
                            sorted ? h(Icon, { name: p.sort.direction === 'asc' ? 'up' : 'down', size: 12 }) : null,
                            h("span", { class: cx('resizer', drag?.column === c && 'is-dragging'), title: `Drag to size ${def.label}; double-click for the default`, onPointerDown: (e) => startResize(e, c), onClick: (e) => e.stopPropagation(), onDblClick: (e) => {
                                    e.stopPropagation();
                                    app.setWidth(p.table, c, def.width);
                                } })));
                    }))),
                h("tbody", null, p.list.rows.map((row) => (h("tr", { key: row.key, tabIndex: 0, class: "issue-row", onClick: () => app.openFromList(row.key), onKeyDown: (e) => {
                        if (e.key === 'Enter')
                            app.openFromList(row.key);
                        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))
                            openMenu(e, issueMenu(app, row.key, row.summary, row));
                    }, onContextMenu: (e) => openMenu(e, issueMenu(app, row.key, row.summary, row)) }, columns.map((c) => (h("td", { key: c, class: cx(`col-${c}`, COLUMNS[c].align === 'end' && 'align-end'), title: c === 'summary' ? row.summary : undefined },
                    h(Cell, { column: c, row: row }))))))))),
            !p.list.rows.length && !p.list.loading && !p.list.error ? h(Empty, { icon: "list" }, "No issues to display.") : null),
        p.list.loading ? h(Spinner, { label: "Loading issues" }) : null,
        !p.list.loading && p.list.rows.length < p.list.total ? (h(Button, { variant: "ghost", class: "load-more", onClick: p.onLoadMore }, `Load more (${p.list.total - p.list.rows.length} left)`)) : null));
}
