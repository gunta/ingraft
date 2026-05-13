export interface StyleOptions {
  readonly colors?: boolean
}

const reset = "\x1b[0m"
const ansiPattern = new RegExp("\\u001B\\[[0-9;]*m", "g")

const enabled = (options: StyleOptions = {}) => options.colors ?? false

export const paint = (value: string, code: string, options: StyleOptions = {}): string =>
  enabled(options) ? `${code}${value}${reset}` : value

export const stripAnsi = (value: string): string => value.replace(ansiPattern, "")

export const style = {
  bold: (value: string, options?: StyleOptions) => paint(value, "\x1b[1m", options),
  dim: (value: string, options?: StyleOptions) => paint(value, "\x1b[2m", options),
  red: (value: string, options?: StyleOptions) => paint(value, "\x1b[31m", options),
  green: (value: string, options?: StyleOptions) => paint(value, "\x1b[32m", options),
  yellow: (value: string, options?: StyleOptions) => paint(value, "\x1b[33m", options),
  blue: (value: string, options?: StyleOptions) => paint(value, "\x1b[34m", options),
  magenta: (value: string, options?: StyleOptions) => paint(value, "\x1b[35m", options),
  cyan: (value: string, options?: StyleOptions) => paint(value, "\x1b[36m", options)
} as const
