import type { ServerSDK } from "@/context/server-sdk"
import { gitActions } from "@/components/shell/git-actions"

export type Repo = { directory: string; branch?: string }

const MAX_SCAN = 40

export async function getRepo(directory: string): Promise<Repo | undefined> {
  const branch = await gitActions.currentBranch(directory).catch(() => "")
  if (!branch) return undefined
  return { directory, branch }
}

export async function findRepos(sdk: ServerSDK, project: { worktree: string }): Promise<Repo[]> {
  const self = await getRepo(project.worktree)
  if (self) return [self]

  const listed = await sdk.client.file.list({ directory: project.worktree, path: "." }).catch(() => undefined)
  const dirs = (listed?.data ?? [])
    .filter((node) => node.type === "directory" && !node.ignored)
    .slice(0, MAX_SCAN)
  const found = await Promise.all(dirs.map((node) => getRepo(node.absolute)))
  return found.filter((repo): repo is Repo => Boolean(repo))
}
