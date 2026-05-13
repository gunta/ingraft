import { Effect, Option } from "effect"

import { type SettingsMergeResult } from "../config/jsonc-settings.ts"

export const mergeZedSettingsText = (_text = "{}\n"): SettingsMergeResult => ({
  _tag: "Unchanged"
})

export class ZedSettings extends Effect.Service<ZedSettings>()("ingraft/ZedSettings", {
  accessors: true,
  sync: () => ({
    refresh: (_cwd: string) => Effect.succeed(Option.none<string>())
  })
}) {}
