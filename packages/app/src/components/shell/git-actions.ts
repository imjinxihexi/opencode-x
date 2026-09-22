export type GitBranch = { name: string; current: boolean }
export type GitCommit = { hash: string; author: string; when: string; subject: string }
export type GitFileStatus = { file: string; index: string; worktree: string; untracked: boolean }

type GitBridge = {
  gitBranches?: (cwd: string) => Promise<GitBranch[]>
  gitCheckout?: (cwd: string, branch: string) => Promise<void>
  gitSwitchBranch?: (cwd: string, branch: string) => Promise<void>
  gitCreateBranch?: (cwd: string, name: string, startPoint?: string) => Promise<void>
  gitFetch?: (cwd: string) => Promise<string>
  gitPull?: (cwd: string) => Promise<string>
  gitDeleteBranch?: (cwd: string, name: string) => Promise<void>
  gitCommit?: (cwd: string, message: string) => Promise<string>
  gitPush?: (cwd: string) => Promise<string>
  gitDiscard?: (cwd: string) => Promise<void>
  gitMerge?: (cwd: string, branch: string) => Promise<{ conflicted: boolean }>
  gitMergePreview?: (cwd: string, source: string, target: string) => Promise<{ commits: number; conflicts: boolean }>
  gitCurrentBranch?: (cwd: string) => Promise<string>
  gitHasChanges?: (cwd: string) => Promise<boolean>
  gitConflicts?: (cwd: string) => Promise<string[]>
  gitResolveConflict?: (cwd: string, file: string, side: "ours" | "theirs") => Promise<void>
  gitMergeAbort?: (cwd: string) => Promise<void>
  gitConflictSides?: (cwd: string, file: string) => Promise<{ base: string; ours: string; theirs: string }>
  gitWriteResolved?: (cwd: string, file: string, content: string) => Promise<void>
  gitLog?: (cwd: string, limit?: number) => Promise<GitCommit[]>
  gitFileDiff?: (cwd: string, file: string) => Promise<string>
  gitStatusRaw?: (cwd: string) => Promise<GitFileStatus[]>
  gitStageFile?: (cwd: string, file: string) => Promise<void>
  gitStageAll?: (cwd: string) => Promise<void>
  gitUnstageAll?: (cwd: string) => Promise<void>
  gitUnstageFile?: (cwd: string, file: string) => Promise<void>
  gitStagedFileDiff?: (cwd: string, file: string) => Promise<string>
  gitApplyCached?: (cwd: string, text: string, reverse: boolean) => Promise<void>
  gitUndoCommit?: (cwd: string) => Promise<void>
  gitStash?: (cwd: string) => Promise<void>
  gitClone?: (url: string, workspace: string, name: string, branch?: string) => Promise<string>
  gitRemoteBranches?: (cwd: string) => Promise<string[]>
}

function bridge(): GitBridge | undefined {
  if (typeof window === "undefined") return undefined
  return (window as { api?: GitBridge }).api
}

export const gitActions = {
  available: () => Boolean(bridge()?.gitBranches),
  branches: (cwd: string) => bridge()?.gitBranches?.(cwd) ?? Promise.resolve([] as GitBranch[]),
  checkout: (cwd: string, branch: string) => bridge()?.gitCheckout?.(cwd, branch) ?? Promise.resolve(),
  switchBranch: (cwd: string, branch: string) =>
    bridge()?.gitSwitchBranch?.(cwd, branch) ?? bridge()?.gitCheckout?.(cwd, branch) ?? Promise.resolve(),
  createBranch: (cwd: string, name: string, startPoint?: string) =>
    bridge()?.gitCreateBranch?.(cwd, name, startPoint) ?? Promise.resolve(),
  fetch: (cwd: string) => bridge()?.gitFetch?.(cwd) ?? Promise.resolve(""),
  pull: (cwd: string) => bridge()?.gitPull?.(cwd) ?? Promise.resolve(""),
  deleteBranch: (cwd: string, name: string) => bridge()?.gitDeleteBranch?.(cwd, name) ?? Promise.resolve(),
  commit: (cwd: string, message: string) => bridge()?.gitCommit?.(cwd, message) ?? Promise.resolve(""),
  push: (cwd: string) => bridge()?.gitPush?.(cwd) ?? Promise.resolve(""),
  discard: (cwd: string) => bridge()?.gitDiscard?.(cwd) ?? Promise.resolve(),
  merge: (cwd: string, branch: string) =>
    bridge()?.gitMerge?.(cwd, branch) ?? Promise.resolve({ conflicted: false }),
  mergePreview: (cwd: string, source: string, target: string) =>
    bridge()?.gitMergePreview?.(cwd, source, target) ?? Promise.resolve({ commits: 0, conflicts: false }),
  currentBranch: (cwd: string) => bridge()?.gitCurrentBranch?.(cwd) ?? Promise.resolve(""),
  hasChanges: (cwd: string) => bridge()?.gitHasChanges?.(cwd) ?? Promise.resolve(false),
  conflicts: (cwd: string) => bridge()?.gitConflicts?.(cwd) ?? Promise.resolve([] as string[]),
  resolveConflict: (cwd: string, file: string, side: "ours" | "theirs") =>
    bridge()?.gitResolveConflict?.(cwd, file, side) ?? Promise.resolve(),
  mergeAbort: (cwd: string) => bridge()?.gitMergeAbort?.(cwd) ?? Promise.resolve(),
  conflictSides: (cwd: string, file: string) =>
    bridge()?.gitConflictSides?.(cwd, file) ?? Promise.resolve({ base: "", ours: "", theirs: "" }),
  writeResolved: (cwd: string, file: string, content: string) =>
    bridge()?.gitWriteResolved?.(cwd, file, content) ?? Promise.resolve(),
  log: (cwd: string, limit?: number) => bridge()?.gitLog?.(cwd, limit) ?? Promise.resolve([] as GitCommit[]),
  fileDiff: (cwd: string, file: string) => bridge()?.gitFileDiff?.(cwd, file) ?? Promise.resolve(""),
  status: (cwd: string) => bridge()?.gitStatusRaw?.(cwd) ?? Promise.resolve([] as GitFileStatus[]),
  stageFile: (cwd: string, file: string) => bridge()?.gitStageFile?.(cwd, file) ?? Promise.resolve(),
  stageAll: async (cwd: string, files: string[] = []) => {
    const api = bridge()
    if (api?.gitStageAll) return api.gitStageAll(cwd)
    await Promise.all(files.map((file) => api?.gitStageFile?.(cwd, file)))
  },
  unstageAll: async (cwd: string, files: string[] = []) => {
    const api = bridge()
    if (api?.gitUnstageAll) return api.gitUnstageAll(cwd)
    await Promise.all(files.map((file) => api?.gitUnstageFile?.(cwd, file)))
  },
  unstageFile: (cwd: string, file: string) => bridge()?.gitUnstageFile?.(cwd, file) ?? Promise.resolve(),
  stagedFileDiff: (cwd: string, file: string) => bridge()?.gitStagedFileDiff?.(cwd, file) ?? Promise.resolve(""),
  applyCached: (cwd: string, text: string, reverse: boolean) =>
    bridge()?.gitApplyCached?.(cwd, text, reverse) ?? Promise.resolve(),
  undoCommit: (cwd: string) => bridge()?.gitUndoCommit?.(cwd) ?? Promise.resolve(),
  stash: (cwd: string) => bridge()?.gitStash?.(cwd) ?? Promise.resolve(),
  clone: (url: string, workspace: string, name: string, branch?: string) =>
    bridge()?.gitClone?.(url, workspace, name, branch) ?? Promise.resolve(""),
  remoteBranches: (cwd: string) => bridge()?.gitRemoteBranches?.(cwd) ?? Promise.resolve([] as string[]),
}
