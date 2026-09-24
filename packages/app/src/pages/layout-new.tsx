import { createEffect, createMemo, createResource, createSignal, Show, Suspense, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate } from "@solidjs/router"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DebugBar } from "@/components/debug-bar"
import { TabsInfoPopup } from "@/components/help-button"
import { DialogAddRepo } from "@/components/shell/dialog-add-repo"
import { DialogWorkspaceDetail } from "@/components/shell/dialog-workspace-detail"
import { DialogCreateWorkspace } from "@/components/shell/dialog-create-workspace"
import { DiffPanel, type DiffTarget } from "@/components/shell/diff-panel"
import { GitPanel } from "@/components/shell/git-panel"
import { gitActions } from "@/components/shell/git-actions"
import { ProjectsPanel } from "@/components/shell/projects-panel"
import { findRepos, type Repo } from "@/components/shell/repos"
import { createWorkspaceStore, type Workspace } from "@/components/shell/workspaces"
import { WorkspacesGrid } from "@/components/shell/workspaces-grid"
import { DialogGitResult } from "@/components/shell/dialog-git-result"
import { useLanguage } from "@/context/language"
import { Titlebar, type TitlebarUpdate } from "@/components/titlebar"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import type { PromptSession } from "@/context/prompt"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useTabs, tabKey, type Tab } from "@/context/tabs"
import { Persist, persisted } from "@/utils/persist"
import { setV2Toast, ToastRegion } from "@/utils/toast"

const LEFT_MIN = 180
const LEFT_MAX = 380
const RIGHT_MIN = 240
const RIGHT_MAX = 460

export default function NewLayout(props: ParentProps) {
  const platform = usePlatform()
  const layout = useLayout()
  const navigate = useNavigate()
  const sdk = useServerSDK()
  const dialog = useDialog()
  const language = useLanguage()
  const workspaces = createWorkspaceStore()
  const [state, setState] = createStore<{ debugTools: boolean; selected?: string; workspace?: string; repo?: string }>({
    debugTools: true,
  })
  const [panels, setPanels] = persisted(Persist.global("shell-panels"), createStore({ left: 236, right: 300, diff: 420 }))
  const [diffTarget, setDiffTarget] = createSignal<DiffTarget>()
  const [gitRefresh, setGitRefresh] = createSignal(0)
  const server = useServer()
  const tabs = useTabs()

  const activeModel = createMemo(() => {
    const route = layout.route()
    const tab =
      route.type === "session"
        ? ({ type: "session", server: route.server ?? server.key, sessionId: route.sessionId } as const)
        : route.type === "draft"
          ? tabs.store.find((item) => item.type === "draft" && item.draftID === route.draftID)
          : undefined
    const directory = () => (tab ? (tab.type === "draft" ? tab.directory : tabs.info[tabKey(tab)]?.directory) : undefined)
    const fromTab = tab ? tabs.stateValue<PromptSession>(tab, "prompt")?.model.current() : undefined
    if (fromTab) return { providerID: fromTab.providerID, modelID: fromTab.modelID, directory: directory() }
    for (const item of [...tabs.store].reverse()) {
      const model = tabs.stateValue<PromptSession>(item, "prompt")?.model.current()
      if (model) {
        return {
          providerID: model.providerID,
          modelID: model.modelID,
          directory: item.type === "draft" ? item.directory : tabs.info[tabKey(item)]?.directory,
        }
      }
    }
    return undefined
  })

  const activeSessionId = createMemo(() => {
    const route = layout.route()
    return route.type === "session" ? route.sessionId : undefined
  })

  const [showWorkspaces, setShowWorkspaces] = createSignal(false)

  createEffect(() => setV2Toast(true))

  const projects = createMemo(() => layout.projects.list())

  createEffect(() => {
    if (state.selected || state.workspace) return
    const first = projects()[0]?.worktree
    if (first) setState("selected", first)
  })

  const [refresh, setRefresh] = createSignal(0)

  const activeWorkspace = createMemo(() => (state.workspace ? workspaces.get(state.workspace) : undefined))

  const currentTab = createMemo<Tab | undefined>(() => {
    const route = layout.route()
    if (route.type === "session") {
      return { type: "session", server: route.server ?? server.key, sessionId: route.sessionId }
    }
    if (route.type === "draft") {
      return tabs.store.find((item) => item.type === "draft" && item.draftID === route.draftID)
    }
    return undefined
  })

  const tabDirectory = (tab: Tab | undefined) => {
    if (!tab) return undefined
    if (tab.type === "draft") return tab.directory
    return tabs.info[tabKey(tab)]?.directory
  }

  const tabVisible = (tab: Tab) => {
    const workspace = activeWorkspace()
    if (!workspace) return true
    const directory = tabDirectory(tab)
    if (!directory) return true
    return workspace.repos.some((repo) => repo.directory === directory)
  }

  const [scanned] = createResource(
    () => [state.selected, refresh()] as const,
    async ([directory]) => {
      const project = projects().find((item) => item.worktree === directory)
      if (!project) return [] as Repo[]
      return findRepos(sdk(), project)
    },
    { initialValue: [] as Repo[] },
  )

  const [workspaceBranches] = createResource(
    () => [state.workspace, refresh()] as const,
    async ([id]) => {
      const workspace = id ? workspaces.get(id) : undefined
      if (!workspace) return {} as Record<string, string>
      const entries = await Promise.all(
        workspace.repos.map(async (repo) => [repo.directory, await gitActions.currentBranch(repo.directory)] as const),
      )
      return Object.fromEntries(entries)
    },
  )

  const repos = createMemo<Repo[]>(() => {
    const workspace = activeWorkspace()
    if (workspace) {
      const branches = workspaceBranches() ?? {}
      return workspace.repos.map((repo) => ({
        directory: repo.directory,
        branch: branches[repo.directory] || repo.branch,
      }))
    }
    if (scanned.loading) return []
    return scanned() ?? []
  })

  const [conflicts] = createResource(
    () => [state.repo, gitRefresh()] as const,
    async ([directory]) => (directory ? gitActions.conflicts(directory).catch(() => [] as string[]) : []),
    { initialValue: [] as string[] },
  )

  const reposLoading = () => (activeWorkspace() ? false : scanned.loading)

  createEffect(() => {
    const target = diffTarget()
    if (!target) return
    if (!repos().some((repo) => repo.directory === target.directory)) setDiffTarget(undefined)
  })

  createEffect(() => {
    const list = repos()
    if (!list || list.length === 0) return
    if (state.repo && list.some((repo) => repo.directory === state.repo)) return
    setState("repo", list[0]?.directory)
  })

  const openProject = (directory: string) => {
    layout.projects.open(directory)
    navigate("/")
  }

  const refreshAll = () => {
    setRefresh((value) => value + 1)
    setGitRefresh((value) => value + 1)
  }

  const syncWorkspaceMeta = (workspace: Workspace | undefined) => {
    if (!workspace?.folder) return
    void gitActions
      .createWorkspaceDir(workspace.root, workspace.folder, {
        id: workspace.id,
        name: workspace.name,
        prompt: workspace.prompt,
        folder: workspace.folder,
        createdAt: workspace.createdAt,
        repos: workspace.repos,
      })
      .catch(() => {})
  }

  const createWorkspace = () => {
    dialog.show(() => (
      <DialogCreateWorkspace
        onCreate={(name, prompt, root, folder) => {
          const workspace = workspaces.create(name, prompt, root, folder)
          setState("workspace", workspace.id)
          setState("selected", undefined)
          syncWorkspaceMeta(workspaces.get(workspace.id))
        }}
      />
    ))
  }

  const addRepo = (workspace: Workspace) => {
    dialog.show(() => (
      <DialogAddRepo
        workspaceName={workspace.name}
        root={workspace.root}
        folder={workspace.folder}
        onAdded={(repo) => {
          workspaces.addRepo(workspace.id, repo)
          syncWorkspaceMeta(workspaces.get(workspace.id))
          setState("workspace", workspace.id)
          setState("selected", undefined)
          setState("repo", repo.directory)
        }}
      />
    ))
  }

  const renameWorkspace = (id: string, name: string) => {
    workspaces.rename(id, name)
    syncWorkspaceMeta(workspaces.get(id))
  }

  const showWorkspaceDetail = (workspace: Workspace) => {
    dialog.show(() => (
      <DialogWorkspaceDetail
        workspace={workspace}
        onRename={renameWorkspace}
        onRemoveRepo={(id, directory) => {
          workspaces.removeRepo(id, directory)
          if (state.repo === directory) setState("repo", undefined)
          syncWorkspaceMeta(workspaces.get(id))
        }}
        onPromptChange={(id, prompt) => {
          workspaces.setPrompt(id, prompt)
          syncWorkspaceMeta(workspaces.get(id))
        }}
      />
    ))
  }

  const removeWorkspace = (id: string) => {
    if (state.workspace === id) {
      setState("workspace", undefined)
      setState("repo", undefined)
    }
    workspaces.remove(id)
  }

  const sessionRefs = createMemo(() =>
    tabs.store
      .filter((item) => item.type === "session")
      .map((item) => ({ sessionID: item.sessionId, directory: tabs.info[tabKey(item)]?.directory }))
      .reverse(),
  )

  const enterWorkspace = (workspace: Workspace) => {
    setDiffTarget(undefined)
    setState("workspace", workspace.id)
    setState("selected", undefined)
    const first = workspace.repos[0]?.directory
    setState("repo", first)
    setShowWorkspaces(false)
    if (!first) return
    tabs.newDraft({ server: server.key, directory: first }, undefined, activeModel())
  }

  const removeProject = (directory: string) => {
    if (state.selected === directory) setState("selected", undefined)
    if (state.repo === directory) setState("repo", undefined)
    layout.projects.close(directory)
  }

  createEffect(() => {
    const workspace = activeWorkspace()
    if (!workspace) return
    const tab = currentTab()
    if (!tab || tabVisible(tab)) return
    const visible = tabs.store.find((item) => tabVisible(item))
    if (visible) {
      tabs.select(visible)
      return
    }
    const first = workspace.repos[0]?.directory
    if (first) tabs.newDraft({ server: server.key, directory: first }, undefined, activeModel())
    else navigate("/")
  })

  const update: TitlebarUpdate = {
    version: () => {
      const state = platform.updater?.state()
      if (state?.status !== "ready") return
      return state.version
    },
    installing: () => platform.updater?.state().status === "installing",
    install: () => void platform.updater?.install(),
  }

  return (
    <div
      class="relative bg-v2-background-bg-deep flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-bottom": "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <Titlebar
        update={update}
        workspacesActive={showWorkspaces()}
        onToggleWorkspaces={() => setShowWorkspaces((value) => !value)}
        tabFilter={tabVisible}
        debugTools={
          import.meta.env.DEV
            ? { visible: state.debugTools, toggle: () => setState("debugTools", (value) => !value) }
            : undefined
        }
      />
      <div class="flex-1 min-h-0 min-w-0 flex">
        <ProjectsPanel
          selected={state.selected}
          repos={repos()}
          scannedRepos={scanned.loading ? [] : (scanned() ?? [])}
          selectedRepo={state.repo}
          width={panels.left}
          minWidth={LEFT_MIN}
          maxWidth={LEFT_MAX}
          loading={reposLoading()}
          workspaces={workspaces.list()}
          selectedWorkspace={state.workspace}
          onResize={(width) => setPanels("left", width)}
          onRefresh={refreshAll}
          onSelectProject={(directory) => {
            setDiffTarget(undefined)
            setState("workspace", undefined)
            setState("repo", undefined)
            setState("selected", directory)
          }}
          onSelectRepo={(directory) => {
            setDiffTarget(undefined)
            setState("repo", directory)
          }}
          onOpen={openProject}
          onRemoveProject={removeProject}
          onSelectWorkspace={(id) => {
            setDiffTarget(undefined)
            setState("selected", undefined)
            setState("repo", undefined)
            setState("workspace", id)
          }}
          onCreateWorkspace={createWorkspace}
          onAddRepo={addRepo}
        />
        <main class="flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col items-start contain-strict">
          <Show
            when={!showWorkspaces()}
            fallback={
              <WorkspacesGrid
                workspaces={workspaces.list()}
                activeId={state.workspace}
                onEnter={enterWorkspace}
                onNewProject={addRepo}
                onCreate={createWorkspace}
                onRename={renameWorkspace}
                onDelete={removeWorkspace}
                onShowDetail={showWorkspaceDetail}
              />
            }
          >
            <Suspense>{props.children}</Suspense>
          </Show>
        </main>
        <Show when={!showWorkspaces()}>
          <GitPanel
            repos={repos()}
            selectedRepo={state.repo}
            width={panels.right}
            minWidth={RIGHT_MIN}
            maxWidth={RIGHT_MAX}
            loading={reposLoading()}
            refresh={gitRefresh()}
            onResize={(width) => setPanels("right", width)}
            onRefresh={() => setGitRefresh((value) => value + 1)}
            onSelectRepo={(directory) => setState("repo", directory)}
            activeFile={diffTarget()?.file}
            onOpenDiff={(target) => setDiffTarget(target)}
            hideResize={Boolean(diffTarget())}
            conflicts={conflicts() ?? []}
            activeModel={activeModel()}
            activeSessionId={activeSessionId()}
            sessions={sessionRefs()}
          />
          <Show when={diffTarget()}>
            {(target) => (
              <DiffPanel
                target={target()}
                width={panels.diff ?? 420}
                minWidth={320}
                maxWidth={720}
                refresh={gitRefresh()}
                onResize={(width) => setPanels("diff", width)}
                onClose={() => setDiffTarget(undefined)}
                onChanged={() => setGitRefresh((value) => value + 1)}
                conflicts={conflicts() ?? []}
                onResolved={() => {
                  refreshAll()
                  setDiffTarget(undefined)
                }}
              />
            )}
          </Show>
        </Show>
      </div>
      {import.meta.env.DEV && state.debugTools && <DebugBar inline />}
      <TabsInfoPopup />
      <ToastRegion v2 />
    </div>
  )
}
