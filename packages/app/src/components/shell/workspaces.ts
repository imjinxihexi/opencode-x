import { createStore } from "solid-js/store"
import { Persist, persisted } from "@/utils/persist"

export type WorkspaceRepo = { directory: string; name: string; remote?: string; branch?: string }
export type Workspace = { id: string; name: string; prompt?: string; repos: WorkspaceRepo[]; createdAt: number }

export function createWorkspaceStore() {
  const [store, setStore] = persisted(
    Persist.global("git-workspaces"),
    createStore<{ list: Workspace[] }>({ list: [] }),
  )

  return {
    list: () => store.list,
    get: (id: string) => store.list.find((workspace) => workspace.id === id),
    create(name: string, prompt?: string) {
      const workspace: Workspace = {
        id: crypto.randomUUID(),
        name,
        prompt,
        repos: [],
        createdAt: Date.now(),
      }
      setStore("list", (list) => [...list, workspace])
      return workspace
    },
    remove(id: string) {
      setStore("list", (list) => list.filter((workspace) => workspace.id !== id))
    },
    addRepo(id: string, repo: WorkspaceRepo) {
      setStore("list", (workspace) => workspace.id === id, "repos", (repos) => [...repos, repo])
    },
    removeRepo(id: string, directory: string) {
      setStore("list", (workspace) => workspace.id === id, "repos", (repos) =>
        repos.filter((repo) => repo.directory !== directory),
      )
    },
  }
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>
