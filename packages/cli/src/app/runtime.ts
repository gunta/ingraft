import { Effect } from "effect"

export type RuntimeExit = (code: number) => Effect.Effect<never>

export interface RuntimeConfigShape {
  readonly argv: ReadonlyArray<string>
  readonly cwd: string
  readonly exit: RuntimeExit
}

const liveRuntimeConfig = (): RuntimeConfigShape => ({
  argv: [...process.argv],
  cwd: process.cwd(),
  exit: (code) => Effect.sync((): never => process.exit(code))
})

export class RuntimeConfig extends Effect.Service<RuntimeConfig>()("ingraft/RuntimeConfig", {
  accessors: true,
  sync: liveRuntimeConfig
}) {}
