import { stripAnsi, style, type StyleOptions } from "./styles.ts"

export type NoticeKind = "info" | "ok" | "warn" | "error"

export interface KeyValueRow {
  readonly label: string
  readonly value: string
}

export interface TableColumn<Row> {
  readonly header: string
  readonly minWidth?: number
  readonly value: (row: Row, index: number) => string
}

export interface RenderTableParams<Row> {
  readonly columns: ReadonlyArray<TableColumn<Row>>
  readonly empty: string
  readonly options?: StyleOptions
  readonly rows: ReadonlyArray<Row>
}

export interface RenderSectionParams {
  readonly content: string
  readonly options?: StyleOptions
  readonly title: string
}

export interface RenderNoticeParams {
  readonly kind: NoticeKind
  readonly message?: string
  readonly options?: StyleOptions
  readonly title: string
}

const gap = "  "

const visibleLength = (value: string): number => stripAnsi(value).length

const padRight = (value: string, width: number): string =>
  `${value}${" ".repeat(Math.max(0, width - visibleLength(value)))}`

const maxLength = (values: ReadonlyArray<string>): number =>
  values.reduce((width, value) => Math.max(width, visibleLength(value)), 0)

const titleStyle = (value: string, options: StyleOptions = {}): string =>
  style.bold(style.cyan(value, options), options)

const statusColor = (kind: NoticeKind): ((value: string, options?: StyleOptions) => string) => {
  switch (kind) {
    case "info":
      return style.cyan
    case "ok":
      return style.green
    case "warn":
      return style.yellow
    case "error":
      return style.red
  }
}

export const renderHeading = (title: string, options: StyleOptions = {}): string =>
  [titleStyle(title, options), style.dim("-".repeat(visibleLength(title)), options)].join("\n")

export const renderStatusBadge = (kind: NoticeKind, options: StyleOptions = {}): string => {
  const badge = `[${kind}]`
  return style.bold(statusColor(kind)(badge, options), options)
}

export const renderNotice = ({ kind, message, options = {}, title }: RenderNoticeParams): string =>
  message === undefined || message.length === 0
    ? `${renderStatusBadge(kind, options)} ${style.bold(title, options)}`
    : [`${renderStatusBadge(kind, options)} ${style.bold(title, options)}`, message].join("\n")

export const renderKeyValues = (
  rows: ReadonlyArray<KeyValueRow>,
  options: StyleOptions = {}
): string => {
  if (rows.length === 0) return ""
  const labelWidth = maxLength(rows.map((row) => row.label))
  return rows
    .map((row) => `${style.dim(padRight(row.label, labelWidth), options)}${gap}${row.value}`)
    .join("\n")
}

export const renderTable = <Row>({
  columns,
  empty,
  options = {},
  rows
}: RenderTableParams<Row>): string => {
  if (rows.length === 0) return empty
  const columnWidths = columns.map((column) =>
    Math.max(
      column.minWidth ?? 0,
      visibleLength(column.header),
      ...rows.map((row, index) => visibleLength(column.value(row, index)))
    )
  )
  const renderCells = (cells: ReadonlyArray<string>) =>
    cells.map((cell, index) => padRight(cell, columnWidths[index] ?? visibleLength(cell))).join(gap)

  const header = renderCells(columns.map((column) => style.bold(column.header, options)))
  const rule = style.dim(columnWidths.map((width) => "-".repeat(width)).join(gap), options)
  const body = rows.map((row, index) =>
    renderCells(columns.map((column) => column.value(row, index)))
  )

  return [header, rule, ...body].join("\n")
}

export const renderSection = ({ content, options = {}, title }: RenderSectionParams): string =>
  [renderHeading(title, options), content].filter((line) => line.length > 0).join("\n")
