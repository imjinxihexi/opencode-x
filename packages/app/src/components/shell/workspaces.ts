import { createStore } from "solid-js/store"
import { Persist, persisted } from "@/utils/persist"

export type WorkspaceRepo = { directory: string; name: string; remote?: string; branch?: string }
export type Workspace = {
  id: string
  name: string
  prompt?: string
  root?: string
  folder?: string
  repos: WorkspaceRepo[]
  createdAt: number
}

export function safeFolderName(value: string) {
  let out = value.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-")
  out = out.replace(/-{2,}/g, "-").replace(/^[.\-]+/, "").replace(/[.\- ]+$/, "")
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(out)) out = `ws-${out}`
  if (out.length > 64) out = out.slice(0, 64).replace(/[.\- ]+$/, "")
  return out || "workspace"
}

export function createWorkspaceStore() {
  const [store, setStore] = persisted(
    Persist.global("git-workspaces"),
    createStore<{ list: Workspace[] }>({ list: [] }),
  )

  return {
    list: () => store.list,
    get: (id: string) => store.list.find((workspace) => workspace.id === id),
    create(name: string, prompt?: string, root?: string, folder?: string) {
      const workspace: Workspace = {
        id: crypto.randomUUID(),
        name,
        prompt,
        root: root?.trim() || undefined,
        folder: folder?.trim() || undefined,
        repos: [],
        createdAt: Date.now(),
      }
      setStore("list", (list) => [...list, workspace])
      return workspace
    },
    remove(id: string) {
      setStore("list", (list) => list.filter((workspace) => workspace.id !== id))
    },
    rename(id: string, name: string) {
      setStore("list", (workspace) => workspace.id === id, "name", name)
    },
    setPrompt(id: string, prompt: string | undefined) {
      setStore("list", (workspace) => workspace.id === id, "prompt", prompt || undefined)
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
