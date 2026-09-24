import { For, Show, createMemo } from "solid-js"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { getFilename } from "@opencode-ai/core/util/path"
import type { Repo } from "@/components/shell/repos"
import { gitActions } from "@/components/shell/git-actions"
import { RepoMenu } from "@/components/shell/repo-menu"
import { Spinner } from "@/components/shell/spinner"
import type { Workspace } from "@/components/shell/workspaces"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useServerSync } from "@/context/server-sync"

export function ProjectsPanel(props: {
  selected?: string
  repos: Repo[]
  scannedRepos: Repo[]
  selectedRepo?: string
  width: number
  minWidth: number
  maxWidth: number
  loading?: boolean
  workspaces: Workspace[]
  selectedWorkspace?: string
  onResize: (width: number) => void
  onRefresh: () => void
  onSelectProject: (directory: string) => void
  onSelectRepo: (directory: string) => void
  onOpen: (directory: string) => void
  onSelectWorkspace: (id: string) => void
  onCreateWorkspace: () => void
  onAddRepo: (workspace: Workspace) => void
}) {
  const language = useLanguage()
  const layout = useLayout()
  const platform = usePlatform()
  const sync = useServerSync()

  const projects = createMemo(() => layout.projects.list())
  const branch = (worktree: string) => sync().child(worktree, { bootstrap: false })[0].vcs?.branch
  const label = (project: { name?: string; worktree: string }) => project.name || getFilename(project.worktree)
  const nested = (project: { worktree: string }) =>
    props.selected === project.worktree ? props.scannedRepos.filter((repo) => repo.directory !== project.worktree) : []

  const pickProject = async () => {
    if (platform.platform !== "desktop") return
    const result = await platform.openDirectoryPickerDialog({
      title: language.t("shell.projects.open"),
      multiple: true,
    })
    if (!result) return
    const paths = Array.isArray(result) ? result : [result]
    for (const path of paths) layout.projects.open(path)
  }

  return (
    <aside
      class="relative h-full shrink-0 flex flex-col border-r-[0.5px] border-v2-border-border-base bg-v2-background-bg-deep"
      style={{ width: `${props.width}px` }}
    >
      <ScrollView class="flex-1 min-h-0">
        <div class="flex flex-col gap-2 px-2 pt-3 pb-3">
          <div class="flex items-center gap-2 px-1 pt-1">
            <Icon name="workspace" class="shrink-0 text-v2-icon-icon-muted" />
            <span class="text-[12px] font-[530] leading-5 text-v2-text-text-muted">
              {language.t("shell.workspace.title")}
            </span>
            <span class="text-[12px] leading-5 text-v2-text-text-muted">{props.workspaces.length}</span>
            <button
              type="button"
              class="ml-auto flex size-6 items-center justify-center rounded-sm text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
              onClick={props.onCreateWorkspace}
              title={language.t("shell.workspace.create.submit")}
            >
              <Icon name="plus" />
            </button>
          </div>
          <For each={props.workspaces}>
            {(workspace) => (
              <div class="flex flex-col gap-1 rounded-lg border-[0.5px] border-v2-border-border-base bg-v2-background-bg-base p-2">
                <div class="flex min-w-0 items-center gap-2 px-1">
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
                    onClick={() => props.onSelectWorkspace(workspace.id)}
                    title={workspace.name}
                  >
                    <span class="min-w-0 flex-1 truncate text-[13px] font-[530] leading-5 text-v2-text-text-base">
                      {workspace.name}
                    </span>
                    <span class="shrink-0 text-[12px] leading-5 text-v2-text-text-muted">
                      （{workspace.repos.length}）
                    </span>
                  </button>
                  <button
                    type="button"
                    class="flex size-6 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                    title={language.t("shell.workspace.addRepo.title")}
                    onClick={() => props.onAddRepo(workspace)}
                  >
                    <Icon name="plus" size="small" />
                  </button>
                </div>
                <For each={workspace.repos}>
                  {(repo) => {
                    const live = () => props.repos.find((item) => item.directory === repo.directory)
                    return (
                      <div
                        class="group flex min-w-0 items-stretch gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-v2-background-bg-layer-02"
                        classList={{
                          "bg-v2-overlay-simple-overlay-pressed":
                            props.selectedWorkspace === workspace.id && props.selectedRepo === repo.directory,
                        }}
                        title={repo.directory}
                      >
                        <button
                          type="button"
                          class="flex min-w-0 flex-1 flex-col items-stretch gap-1 text-left focus-visible:outline-none"
                          onClick={() => {
                            props.onSelectWorkspace(workspace.id)
                            props.onSelectRepo(repo.directory)
                          }}
                        >
                          <div class="flex min-w-0 items-center gap-1.5">
                            <Icon name="folder" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                            <span class="min-w-0 flex-1 truncate text-[13px] leading-5 text-v2-text-text-base">
                              {repo.name}
                            </span>
                          </div>
                          <div class="flex min-w-0 items-center gap-1 ps-[22px] text-[11px] leading-4 text-v2-text-text-faint">
                            <Icon name="branch" size="small" class="shrink-0" />
                            <span class="min-w-0 truncate">{live()?.branch ?? repo.branch ?? "—"}</span>
                          </div>
                        </button>
                      </div>
                    )
                  }}
                </For>
              </div>
            )}
          </For>
          <Show when={props.workspaces.length === 0}>
            <div class="px-2 py-1 text-[12px] leading-4 text-v2-text-text-muted">
              {language.t("shell.workspace.empty")}
            </div>
          </Show>

          <div class="flex items-center gap-2 px-1 pt-2">
            <Icon name="folder" class="shrink-0 text-v2-icon-icon-muted" />
            <span class="text-[12px] font-[530] leading-5 text-v2-text-text-muted">
              {language.t("shell.projects.title")}
            </span>
            <span class="text-[12px] leading-5 text-v2-text-text-muted">{projects().length}</span>
            <button
              type="button"
              class="ml-auto flex size-6 items-center justify-center rounded-sm text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
              onClick={() => void pickProject()}
              title={language.t("shell.projects.open")}
            >
              <Icon name="plus" />
            </button>
          </div>
          <For each={projects()}>
            {(project) => (
              <div class="flex flex-col gap-1 rounded-lg border-[0.5px] border-v2-border-border-base bg-v2-background-bg-base p-2">
                <div class="flex min-w-0 items-center gap-2 px-1">
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
                    onClick={() => props.onSelectProject(project.worktree)}
                    onDblClick={() => props.onOpen(project.worktree)}
                    title={project.worktree}
                  >
                    <span class="min-w-0 flex-1 truncate text-[13px] font-[530] leading-5 text-v2-text-text-base">
                      {label(project)}
                    </span>
                  </button>
                  <Show when={nested(project).length > 0}>
                    <span class="shrink-0 text-[12px] leading-5 text-v2-text-text-muted">（{nested(project).length}）</span>
                  </Show>
                  <button
                    type="button"
                    class="flex size-5 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                    title={language.t("shell.git.menu.refresh")}
                    onClick={() => props.onRefresh()}
                  >
                    <Icon name="cloud" size="small" />
                  </button>
                </div>
                <Show when={props.loading && props.selected === project.worktree}>
                  <div class="flex min-w-0 items-center gap-1.5 px-2 py-1.5 text-v2-text-text-muted">
                    <Spinner />
                    <span class="text-[12px] leading-4">{language.t("common.loading")}</span>
                  </div>
                </Show>
                <For each={nested(project)}>
                  {(repo) => (
                    <div
                      class="group flex min-w-0 items-stretch gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-v2-background-bg-layer-02"
                      classList={{ "bg-v2-overlay-simple-overlay-pressed": props.selectedRepo === repo.directory }}
                      title={repo.directory}
                    >
                      <button
                        type="button"
                        class="flex min-w-0 flex-1 flex-col items-stretch gap-1 text-left focus-visible:outline-none"
                        onClick={() => props.onSelectRepo(repo.directory)}
                      >
                        <div class="flex min-w-0 items-center gap-1.5">
                          <Icon name="folder" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                          <span class="min-w-0 flex-1 truncate text-[13px] leading-5 text-v2-text-text-base">
                            {getFilename(repo.directory)}
                          </span>
                        </div>
                        <div class="flex min-w-0 items-center gap-1 ps-[22px] text-[11px] leading-4 text-v2-text-text-faint">
                          <Icon name="branch" size="small" class="shrink-0" />
                          <span class="min-w-0 truncate">{repo.branch ?? "—"}</span>
                        </div>
                      </button>
                      <Show when={gitActions.available()}>
                        <RepoMenu directory={repo.directory} onRefresh={props.onRefresh} />
                      </Show>
                    </div>
                  )}
                </For>
                <Show when={project.vcs === "git" && nested(project).length === 0}>
                  <div
                    class="group flex min-w-0 items-stretch gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-v2-background-bg-layer-02"
                    classList={{ "bg-v2-overlay-simple-overlay-pressed": props.selectedRepo === project.worktree }}
                    title={project.worktree}
                  >
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 flex-col items-stretch gap-1 text-left focus-visible:outline-none"
                      onClick={() => props.onSelectRepo(project.worktree)}
                    >
                      <div class="flex min-w-0 items-center gap-1.5">
                        <Icon name="folder" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                        <span class="min-w-0 flex-1 truncate text-[13px] leading-5 text-v2-text-text-base">
                          {label(project)}
                        </span>
                      </div>
                      <div class="flex min-w-0 items-center gap-1 ps-[22px] text-[11px] leading-4 text-v2-text-text-faint">
                        <Icon name="branch" size="small" class="shrink-0" />
                        <span class="min-w-0 truncate">{branch(project.worktree) ?? "—"}</span>
                      </div>
                    </button>
                    <Show when={gitActions.available()}>
                      <RepoMenu directory={project.worktree} onRefresh={props.onRefresh} />
                    </Show>
                  </div>
                </Show>
              </div>
            )}
          </For>
          <Show when={projects().length === 0}>
            <div class="px-2 py-8 text-center text-[12px] leading-5 text-v2-text-text-muted">
              {language.t("shell.projects.empty")}
            </div>
          </Show>
        </div>
      </ScrollView>
      <ResizeHandle
        direction="horizontal"
        size={props.width}
        min={props.minWidth}
        max={props.maxWidth}
        onResize={props.onResize}
      />
    </aside>
  )
}
