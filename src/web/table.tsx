// Backlog's issue table: drag a column's edge to size it, press a header to sort, right-click a row
// (or ⋯) for its actions, Columns to pick what shows. Widths and columns are kept per table.
import { h } from './vendor/preact.js'
import { useRef, useState } from './vendor/hooks.js'
import type { IssueRow } from '../protocol.js'
import { ago, COLUMN_ORDER, COLUMNS, columnsOf, MIN_WIDTH, widthOf, type App, type ListState, type Sort } from './app.js'
import { Icon } from './icons.js'
import { Button, Checkbox, cx, Empty, openMenu, Pill, Priority, Spinner, statusColor, useApp, type MenuItem } from './ui.js'

export const issueUrl = (space: string, key: string) => `https://${space}/view/${encodeURIComponent(key)}`

/** What a right-click on an issue offers, wherever it is listed. */
export function issueMenu(app: App, key: string, summary?: string, issue?: { projectId?: number; assigneeId?: number | null }): MenuItem[] {
  const space = app.state.session?.space ?? ''
  const url = issueUrl(space, key)
  return [
    { label: 'Open', icon: 'next', onSelect: () => app.openFromList(key) },
    ...(issue?.projectId
      ? [{ label: 'Assign to…', icon: 'user' as const, onSelect: () => void app.assignIssue({ key, projectId: issue.projectId, assigneeId: issue.assigneeId ?? null }, 'issues') }]
      : []),
    { label: 'Open in browser', icon: 'external', onSelect: () => void app.linkAction('issues', url, 'browser') },
    { label: "Open in Orca's browser", icon: 'globe', onSelect: () => void app.linkAction('issues', url, 'orca') },
    'separator',
    { label: 'Copy key', icon: 'copy', onSelect: () => void app.copyText('issues', key, `Copied ${key}`) },
    ...(summary ? [{ label: 'Copy key and subject', icon: 'copy' as const, onSelect: () => void app.copyText('issues', `${key} ${summary}`, `Copied ${key} and its subject`) }] : []),
    { label: 'Copy link', icon: 'link', onSelect: () => void app.linkAction('issues', url, 'copy') }
  ]
}

const today = () => new Date().toISOString().slice(0, 10)

function Cell({ column, row }: { column: string; row: IssueRow }) {
  switch (column) {
    case 'type':
      return <Pill kind="type" color={row.typeColor}>{row.type}</Pill>
    case 'key':
      return <span class="issue-key">{row.key}</span>
    case 'summary':
      return <span class="summary">{row.summary}</span>
    case 'status':
      return <Pill color={statusColor(row.statusId, row.statusColor)}>{row.status}</Pill>
    case 'priority':
      return <Priority name={row.priority} />
    case 'due':
      return row.due ? <span class={cx(row.due < today() && row.statusId !== 4 && 'overdue')}>{row.due}</span> : null
    case 'created':
    case 'updated':
      return <span title={new Date(row[column]).toLocaleString()}>{ago(row[column])}</span>
    case 'estimatedHours':
    case 'actualHours':
      return <span>{row[column] ?? ''}</span>
    default:
      return <span>{String((row as unknown as Record<string, unknown>)[column] ?? '')}</span>
  }
}

function ColumnPicker({ table, defaults, onClose }: { table: string; defaults: readonly string[]; onClose: () => void }) {
  const [s, app] = useApp()
  const shown = columnsOf(s, table, defaults)
  return (
    <div class="column-picker">
      <div class="column-grid">
        {COLUMN_ORDER.map((c) => (
          <Checkbox key={c} label={COLUMNS[c]!.label} checked={shown.includes(c)} disabled={c === 'key'} onChange={(on) => app.toggleColumn(table, defaults, c, on)} />
        ))}
      </div>
      <div class="row-end">
        <Button size="sm" variant="ghost" icon="refresh" onClick={() => app.resetColumns(table)}>
          Reset columns and widths
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}

export function IssueTable(p: {
  table: string
  label: string
  list: ListState
  defaults: readonly string[]
  sort: Sort
  onSort: (sort: Sort) => void
  onLoadMore: () => void
}) {
  const [s, app] = useApp()
  const [picking, setPicking] = useState(false)
  /** The width of the column being dragged, drawn live and saved on release. */
  const [drag, setDrag] = useState<{ column: string; width: number } | null>(null)
  const columns = columnsOf(s, p.table, p.defaults)
  const width = (c: string) => (drag?.column === c ? drag.width : widthOf(s, p.table, c))
  const total = columns.reduce((sum, c) => sum + width(c), 0)
  const startX = useRef(0)

  const startResize = (e: PointerEvent, column: string) => {
    e.preventDefault()
    e.stopPropagation()
    const from = width(column)
    startX.current = e.clientX
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    let last = from
    const move = (ev: PointerEvent) => {
      last = Math.max(MIN_WIDTH, from + ev.clientX - startX.current)
      setDrag({ column, width: last })
    }
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
      setDrag(null)
      app.setWidth(p.table, column, last)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  const sortBy = (column: string) => {
    if (!COLUMNS[column]?.sortable) return
    const direction = p.sort.column === column && p.sort.direction === 'asc' ? 'desc' : 'asc'
    p.onSort({ column, direction })
  }

  return (
    <div class="issue-table">
      <div class="table-toolbar">
        <span class="muted">{p.list.loading && !p.list.rows.length ? 'Loading…' : `${p.list.rows.length} of ${p.list.total}`}</span>
        <Button size="sm" variant="ghost" icon="columns" active={picking} onClick={() => setPicking(!picking)}>
          {`Columns (${columns.length})`}
        </Button>
      </div>
      {picking ? <ColumnPicker table={p.table} defaults={p.defaults} onClose={() => setPicking(false)} /> : null}
      {p.list.error ? <div class="notice tone-danger">{p.list.error}</div> : null}
      <div class="table-scroll">
        <table class="table" style={{ width: `${total}px` }} aria-label={p.label}>
          <colgroup>
            {columns.map((c) => (
              <col key={c} style={{ width: `${width(c)}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => {
                const def = COLUMNS[c]!
                const sorted = p.sort.column === c
                return (
                  <th
                    key={c}
                    class={cx(def.sortable && 'sortable', sorted && 'is-sorted', def.align === 'end' && 'align-end')}
                    aria-sort={sorted ? (p.sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    onClick={() => sortBy(c)}
                  >
                    <span class="th-label">{def.label}</span>
                    {sorted ? <Icon name={p.sort.direction === 'asc' ? 'up' : 'down'} size={12} /> : null}
                    <span
                      class={cx('resizer', drag?.column === c && 'is-dragging')}
                      title={`Drag to size ${def.label}; double-click for the default`}
                      onPointerDown={(e) => startResize(e as unknown as PointerEvent, c)}
                      onClick={(e) => e.stopPropagation()}
                      onDblClick={(e) => {
                        e.stopPropagation()
                        app.setWidth(p.table, c, def.width)
                      }}
                    />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {p.list.rows.map((row) => (
              <tr
                key={row.key}
                tabIndex={0}
                class="issue-row"
                onClick={() => app.openFromList(row.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') app.openFromList(row.key)
                  if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) openMenu(e as unknown as MouseEvent, issueMenu(app, row.key, row.summary, row))
                }}
                onContextMenu={(e) => openMenu(e as unknown as MouseEvent, issueMenu(app, row.key, row.summary, row))}
              >
                {columns.map((c) => (
                  <td key={c} class={cx(`col-${c}`, COLUMNS[c]!.align === 'end' && 'align-end')} title={c === 'summary' ? row.summary : undefined}>
                    <Cell column={c} row={row} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!p.list.rows.length && !p.list.loading && !p.list.error ? <Empty icon="list">No issues to display.</Empty> : null}
      </div>
      {p.list.loading ? <Spinner label="Loading issues" /> : null}
      {!p.list.loading && p.list.rows.length < p.list.total ? (
        <Button variant="ghost" class="load-more" onClick={p.onLoadMore}>
          {`Load more (${p.list.total - p.list.rows.length} left)`}
        </Button>
      ) : null}
    </div>
  )
}
