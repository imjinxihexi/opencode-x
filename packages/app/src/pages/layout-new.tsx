import { createEffect, createMemo, createResource, createSignal, onCleanup, untrack, Show, Suspense, type ParentProps } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useLocation, useNavigate } from "@solidjs/router"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DebugBar } from "@/components/debug-bar"
import { TabsInfoPopup } from "@/components/help-button"
import { DialogAddRepo } from "@/components/shell/dialog-add-repo"
import { DialogConfirm } from "@/components/shell/dialog-confirm"
import { DialogWorkspaceDetail } from "@/components/shell/dialog-workspace-detail"
import { DialogCreateWorkspace } from "@/components/shell/dialog-create-workspace"
import { DiffPanel, type DiffTarget } from "@/components/shell/diff-panel"
import { CommitDetailPanel, type CommitTarget } from "@/components/shell/commit-detail-panel"
import { FileContentPanel } from "@/components/shell/file-content-panel"
import { GitPanel } from "@/components/shell/git-panel"
import { gitActions } from "@/components/shell/git-actions"
import { ProjectsPanel } from "@/components/shell/projects-panel"
import { findRepos, type Repo } from "@/components/shell/repos"
import { createWorkspaceStore, type Workspace } from "@/components/shell/workspaces"
import { WorkspacesGrid } from "@/components/shell/workspaces-grid"
import { DialogGitResult } from "@/components/shell/dialog-git-result"
import { DialogGitRun } from "@/components/shell/dialog-git-run"
import { useLanguage } from "@/context/language"
import { useGlobal } from "@/context/global"
import { Titlebar, type TitlebarUpdate } from "@/components/titlebar"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import type { PromptSession } from "@/context/prompt"
import { useServer, type ServerConnection } from "@/context/server"
import { WorkspaceLockProvider } from "@/context/workspace-lock"
import { useServerSDK } from "@/context/server-sdk"
import { useTabs, tabKey, type Tab } from "@/context/tabs"
import { Persist, persisted } from "@/utils/persist"
import { setV2Toast, showToast, ToastRegion } from "@/utils/toast"
import { errorMessage } from "@/pages/layout/helpers"
import { archiveHomeSession } from "@/pages/home-session-archive"
import { sessionTitle } from "@/utils/session-title"
import { Binary } from "@opencode-ai/core/util/binary"

const LEFT_MIN = 180
const LEFT_MAX = 380
const RIGHT_MIN = 240
const RIGHT_MAX = 460

export default function NewLayout(props: ParentProps) {
  const platform = usePlatform()
  const layout = useLayout()
  const navigate = useNavigate()
  const location = useLocation()
  const sdk = useServerSDK()
  const dialog = useDialog()
  const language = useLanguage()
  const workspaces = createWorkspaceStore()
  // A window opened at /?workspace=<id> is dedicated to that workspace: the
  // sidebar lists only it and the workspace grid stays out of reach.
  const focusedWorkspaceId = (() => {
    const value = location.query.workspace
    return typeof value === "string" && value ? value : undefined
  })()
  const [state, setState] = createStore<{
    debugTools: boolean
    selected?: string
    workspace?: string
    repo?: string
    picked?: string
    locked?: string
  }>({
    debugTools: true,
    workspace: focusedWorkspaceId,
    locked: focusedWorkspaceId,
  })
  const [panels, setPanels] = persisted(
    Persist.global("shell-panels"),
    createStore({ left: 236, right: 300, diff: 420, commit: 420 }),
  )
  // Collapsing the git panel shrinks the whole column to a slim header strip.
  const [gitCollapsed, setGitCollapsed] = persisted(
    Persist.global("git-panel-collapsed"),
    createStore({ value: false }),
  )
  // Per-workspace tab memory, shared by every window: locked windows persist
  // their session tabs here and restore them on re-entry.
  const [savedTabs, setSavedTabs] = persisted(
    Persist.global("workspace-tabs"),
    createStore<Record<string, { tabs: { server: ServerConnection.Key; sessionId: string }[]; active?: string }>>({}),
  )
  const [diffTarget, setDiffTarget] = createSignal<DiffTarget>()
  const [contentTarget, setContentTarget] = createSignal<{ directory: string; file: string }>()
  const [commitTarget, setCommitTarget] = createSignal<CommitTarget>()
  const [gitRefresh, setGitRefresh] = createSignal(0)
  const server = useServer()
  const global = useGlobal()
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

  // The home page renders its own content, and a new-session draft outside a
  // workspace window has its own project pickers; the workspace/project and
  // git panels only make sense next to workspace and session views.
  const panelsHidden = createMemo(() => {
    const type = layout.route().type
    if (type === "home") return true
    return type === "draft" && !state.locked
  })

  createEffect(() => setV2Toast(true))

  const projects = createMemo(() => layout.projects.list())

  createEffect(() => {
    if (state.selected || state.workspace) return
    const first = projects()[0]?.worktree
    if (first) setState("selected", first)
  })

  const [refresh, setRefresh] = createSignal(0)

  const activeWorkspace = createMemo(() => (state.workspace ? workspaces.get(state.workspace) : undefined))

  const sidebarWorkspaces = createMemo(() => {
    const id = state.locked
    if (!id) return workspaces.list()
    const focused = workspaces.get(id)
    return focused ? [focused] : []
  })

  let enteredFocusedWorkspace = false
  createEffect(() => {
    const id = state.locked
    if (!id || enteredFocusedWorkspace || !workspaces.ready()) return
    const workspace = workspaces.get(id)
    if (!workspace) {
      setState("locked", undefined)
      return
    }
    enteredFocusedWorkspace = true
    // Restore the tabs this workspace had open last time; sessions from other
    // servers are dropped. Without any, start fresh in the first repo.
    const saved = untrack(() => savedTabs[id]?.tabs ?? []).filter((item) => item.server === server.key)
    if (saved.length > 0) {
      for (const item of saved) tabs.addSessionTab(item)
      const activeId = untrack(() => savedTabs[id]?.active)
      const target = saved.find((item) => item.sessionId === activeId) ?? saved[saved.length - 1]
      tabs.select({ type: "session", ...target })
      return
    }
    openWorkspace(workspace)
  })

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

  // Tabs are scoped to the selected context. A workspace only owns tabs whose
  // directory is known and belongs to one of its repos; an explicitly picked
  // project only owns tabs opened in that project directory.
  const tabVisible = (tab: Tab) => {
    const workspace = activeWorkspace()
    const directory = tabDirectory(tab)
    // A tab with no recorded directory can't be attributed yet. Keep it visible
    // only while it is the active tab, so the strip can resolve its session and
    // record the directory; scoping then applies normally.
    if (!directory) {
      const current = currentTab()
      return !!current && tabKey(current) === tabKey(tab)
    }
    if (workspace) return workspace.repos.some((repo) => repo.directory === directory)
    if (!state.picked) return true
    return directory === state.picked
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

  // Git state (branch switches, commits) can change outside this window —
  // from a terminal or an AI session — so refresh on entry, on window focus,
  // and poll instead of snapshotting once.
  const [branchTick, setBranchTick] = createSignal(0)
  const bumpGit = () => {
    setRefresh((value) => value + 1)
    setGitRefresh((value) => value + 1)
    setBranchTick((value) => value + 1)
  }
  createEffect(() => {
    if (!activeWorkspace()) return
    bumpGit()
  })
  createEffect(() => {
    window.addEventListener("focus", bumpGit)
    onCleanup(() => window.removeEventListener("focus", bumpGit))
  })
  createEffect(() => {
    const timer = setInterval(() => setBranchTick((value) => value + 1), 15000)
    onCleanup(() => clearInterval(timer))
  })

  const [workspaceBranches] = createResource(
    () => [state.workspace, refresh(), branchTick()] as const,
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
    () => [state.repo, gitRefresh(), branchTick()] as const,
    async ([directory]) => (directory ? gitActions.conflicts(directory).catch(() => [] as string[]) : []),
    { initialValue: [] as string[] },
  )

  // File watcher events make the git panel react to out-of-band git activity:
  // resolving a conflicted file or touching .git (add/commit/merge from the
  // terminal, an editor, or a session) refreshes immediately. The 15s poll is
  // only a fallback for missed events.
  createEffect(() => {
    if (!state.repo) return
    const stop = sdk().event.listen((event) => {
      const details = (event as { details?: { type?: string; properties?: unknown } }).details
      if (details?.type !== "file.watcher.updated") return
      const props = (details.properties ?? {}) as { file?: string; event?: string }
      const file = props.file
      if (!file) return
      const list = untrack(() => conflicts() ?? [])
      if (list.length === 0) return
      if (file.startsWith(".git/") || list.includes(file)) bumpGit()
    })
    onCleanup(stop)
  })

  const reposLoading = () => (activeWorkspace() ? false : scanned.loading)

  createEffect(() => {
    const target = diffTarget()
    if (!target) return
    if (!repos().some((repo) => repo.directory === target.directory)) setDiffTarget(undefined)
  })

  createEffect(() => {
    const target = contentTarget()
    if (!target) return
    if (!repos().some((repo) => repo.directory === target.directory)) setContentTarget(undefined)
  })

  createEffect(() => {
    const target = commitTarget()
    if (!target) return
    if (!repos().some((repo) => repo.directory === target.directory)) setCommitTarget(undefined)
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

  // Fetch and pull every repo in the workspace, one progress step per repo.
  const pullWorkspace = (workspace: Workspace) => {
    dialog.show(() => (
      <DialogGitRun
        title={language.t("shell.workspace.pull.title")}
        runningLabel={language.t("shell.workspace.pull.running")}
        successLabel={language.t("shell.workspace.pull.success")}
        onSettled={() => refreshAll()}
        steps={workspace.repos.map((repo) => ({
          label: repo.name,
          run: async () => {
            const fetchOutput = await gitActions.fetch(repo.directory).catch(() => "")
            const pull = await gitActions.pull(repo.directory)
            if (pull.conflicted) throw new Error(language.t("shell.git.pullConflict"))
            return [fetchOutput, pull.output].filter((value) => value.trim()).join("\n")
          },
        }))}
      />
    ))
  }

  const openWorkspace = (workspace: Workspace) => {
    setDiffTarget(undefined)
    setContentTarget(undefined)
    setCommitTarget(undefined)
    setState("workspace", workspace.id)
    setState("picked", undefined)
    setState("selected", undefined)
    const first = workspace.repos[0]?.directory
    setState("repo", first)
    setShowWorkspaces(false)
    if (!first) return
    tabs.newDraft({ server: server.key, directory: first }, undefined, activeModel())
  }

  const enterWorkspace = (workspace: Workspace) => {
    if (platform.openWindow) {
      return platform.openWindow(`/?workspace=${encodeURIComponent(workspace.id)}`)
    }
    openWorkspace(workspace)
  }

  const removeProject = (directory: string) => {
    if (state.selected === directory) setState("selected", undefined)
    if (state.picked === directory) setState("picked", undefined)
    if (state.repo === directory) setState("repo", undefined)
    layout.projects.close(directory)
  }

  createEffect(() => {
    const workspace = activeWorkspace()
    if (!workspace && !state.picked) return
    const tab = currentTab()
    if (!tab || tabVisible(tab)) return
    const visible = tabs.store.find((item) => tabVisible(item))
    if (visible) {
      tabs.select(visible)
      return
    }
    const first = workspace?.repos[0]?.directory ?? state.picked
    if (first) tabs.newDraft({ server: server.key, directory: first }, undefined, activeModel())
    else navigate("/")
  })

  createEffect(() => {
    const id = state.locked
    if (!id || !tabs.ready()) return
    const saved = tabs.store.flatMap((item) =>
      item.type === "session" ? [{ server: item.server, sessionId: item.sessionId }] : [],
    )
    const current = currentTab()
    const active = current?.type === "session" ? current.sessionId : untrack(() => savedTabs[id]?.active)
    const prev = untrack(() => savedTabs[id])
    const prevTabs = prev?.tabs ?? []
    if (
      prev &&
      prev.active === active &&
      prevTabs.length === saved.length &&
      saved.every(
        (item, index) => item.sessionId === prevTabs[index]?.sessionId && item.server === prevTabs[index]?.server,
      )
    )
      return
    setSavedTabs(id, { tabs: saved, active })
  })

  const openWorkspaceSession = (session: Session) => {
    setDiffTarget(undefined)
    setContentTarget(undefined)
    setCommitTarget(undefined)
    layout.projects.open(session.directory)
    if (state.locked) setState("repo", session.directory)
    const tab = tabs.addSessionTab({ server: server.key, sessionId: session.id })
    tabs.select(tab)
  }

  const archiveSession = async (session: Session) => {
    const conn = server.current
    if (!conn) return
    const ctx = global.ensureServerCtx(conn)
    if ((await ctx.sdk.protocol) !== "v1") return
    const [, setStore] = ctx.sync.child(session.directory)
    await archiveHomeSession({
      server: server.key,
      session,
      archive: (sessionID) =>
        ctx.sdk.client.session.update({
          sessionID,
          directory: session.directory,
          time: { archived: Date.now() },
        }),
      remove: () => {
        setStore(
          produce((draft) => {
            const match = Binary.search(draft.session, session.id, (item) => item.id)
            if (match.found) draft.session.splice(match.index, 1)
          }),
        )
      },
      onError: (cause) =>
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(cause, language.t("common.requestFailed")),
        }),
    })
  }

  const deleteSession = (session: Session) => {
    dialog.show(() => (
      <DialogConfirm
        title={language.t("session.delete.title")}
        description={language.t("session.delete.confirm", { name: sessionTitle(session.title) ?? "" })}
        confirmLabel={language.t("session.delete.button")}
        onConfirm={() => archiveSession(session)}
      />
    ))
  }

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
    <WorkspaceLockProvider value={() => !!state.locked}>
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
        newTabDirectory={() => (state.locked ? activeWorkspace()?.repos[0]?.directory : undefined)}
        debugTools={
          import.meta.env.DEV
            ? { visible: state.debugTools, toggle: () => setState("debugTools", (value) => !value) }
            : undefined
        }
      />
      <div class="flex-1 min-h-0 min-w-0 flex">
        <Show when={!panelsHidden()}>
          <ProjectsPanel
            selected={state.selected}
            repos={repos()}
            scannedRepos={scanned.loading ? [] : (scanned() ?? [])}
            selectedRepo={state.repo}
            width={panels.left}
            minWidth={LEFT_MIN}
            maxWidth={LEFT_MAX}
            loading={reposLoading()}
            workspaces={sidebarWorkspaces()}
            locked={!!state.locked}
            selectedWorkspace={state.workspace}
          activeSessionId={activeSessionId()}
          onOpenSession={openWorkspaceSession}
          onDeleteSession={deleteSession}
            onResize={(width) => setPanels("left", width)}
            onRefresh={refreshAll}
            onSelectProject={(directory) => {
              setDiffTarget(undefined)
              setContentTarget(undefined)
              setState("workspace", undefined)
              setState("repo", undefined)
              setState("selected", directory)
              setState("picked", directory)
            }}
            onSelectRepo={(directory) => {
              setDiffTarget(undefined)
              setContentTarget(undefined)
              setState("repo", directory)
            }}
            onOpen={openProject}
            onRemoveProject={removeProject}
            onSelectWorkspace={(id) => {
              setDiffTarget(undefined)
              setContentTarget(undefined)
              setState("selected", undefined)
              setState("repo", undefined)
              setState("picked", undefined)
              setState("workspace", id)
            }}
            onCreateWorkspace={createWorkspace}
            onAddRepo={addRepo}
            onPullWorkspace={pullWorkspace}
          />
        </Show>
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
        <Show when={!showWorkspaces() && !panelsHidden()}>
          <GitPanel
            repos={repos()}
            selectedRepo={state.repo}
            width={gitCollapsed.value ? 40 : panels.right}
            minWidth={RIGHT_MIN}
            maxWidth={RIGHT_MAX}
            collapsed={gitCollapsed.value}
            onCollapsedChange={(value) => setGitCollapsed("value", value)}
            loading={reposLoading()}
            refresh={gitRefresh()}
            onResize={(width) => setPanels("right", width)}
            onRefresh={() => setGitRefresh((value) => value + 1)}
            onSelectRepo={(directory) => setState("repo", directory)}
            activeFile={diffTarget()?.file}
            onOpenDiff={(target) => setDiffTarget(target)}
            onOpenFile={(target) => setContentTarget(target)}
            onOpenCommit={(target) => setCommitTarget(target)}
            activeCommit={commitTarget()}
            contentTarget={contentTarget()}
            hideResize={
              Boolean(diffTarget()) || Boolean(contentTarget()) || Boolean(commitTarget()) || gitCollapsed.value
            }
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
          <Show when={contentTarget()}>
            {(target) => (
              <FileContentPanel
                target={target()}
                width={panels.diff ?? 420}
                minWidth={320}
                maxWidth={720}
                refresh={gitRefresh()}
                onResize={(width) => setPanels("diff", width)}
                onClose={() => setContentTarget(undefined)}
              />
            )}
          </Show>
          <Show when={commitTarget()}>
            {(target) => (
              <CommitDetailPanel
                target={target()}
                width={panels.commit ?? 420}
                minWidth={320}
                maxWidth={720}
                onResize={(width) => setPanels("commit", width)}
                onClose={() => setCommitTarget(undefined)}
              />
            )}
          </Show>
        </Show>
      </div>
      {import.meta.env.DEV && state.debugTools && <DebugBar inline />}
      <TabsInfoPopup />
      <ToastRegion v2 />
      </div>
    </WorkspaceLockProvider>
  )
}
