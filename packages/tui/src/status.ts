export interface VendorTuiTask {
  readonly action: "add" | "update"
  readonly existingName: string | null
  readonly packageNames: ReadonlyArray<string>
  readonly primaryPackageName: string
  readonly repositoryUrl: string
  readonly suggestedName?: string
}

export interface VendorTuiCandidate {
  readonly packageName: string
  readonly repositoryUrl?: string
  readonly status: string
}

export interface VendorTuiSnapshot {
  readonly candidates: ReadonlyArray<VendorTuiCandidate>
  readonly tasks: ReadonlyArray<VendorTuiTask>
}

export const summarizeSnapshot = (snapshot: VendorTuiSnapshot): ReadonlyArray<string> => {
  const matched = snapshot.candidates.filter(
    (candidate) => candidate.status === "matched"
  ).length
  const adds = snapshot.tasks.filter((task) => task.action === "add").length
  const updates = snapshot.tasks.filter((task) => task.action === "update").length
  return [
    `${snapshot.candidates.length} dependencies scanned`,
    `${matched} matched to source repositories`,
    `${adds} repos ready to add`,
    `${updates} vendored repos ready to update`
  ]
}

export const taskRows = (
  snapshot: VendorTuiSnapshot
): ReadonlyArray<string> =>
  snapshot.tasks.map((task) => {
    const packages = task.packageNames.join(", ")
    const target =
      task.action === "update" && task.existingName
        ? task.existingName
        : (task.suggestedName ?? task.repositoryUrl)
    return `${task.action.toUpperCase()} ${packages} -> ${target}`
  })
