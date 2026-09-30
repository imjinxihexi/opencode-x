import { For, Show, createEffect, createMemo, createResource, createSignal, on, onCleanup, onMount } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { getFilename } from "@opencode-ai/core/util/path"
import { DialogConfirm } from "@/components/shell/dialog-confirm"
import { DialogGitResult } from "@/components/shell/dialog-git-result"
import { DialogGitRun } from "@/components/shell/dialog-git-run"
import { DialogMerge } from "@/components/shell/dialog-merge"
import { GitButton } from "@/components/shell/git-button"
import { toneOf, toneTextColor, type GitTone } from "@/components/shell/staging-changes"
import { gitActions, type GitCommit, type GitFileStatus } from "@/components/shell/git-actions"
import { aiGenerateText, resolveCurrentModel } from "@/components/shell/ai-generate"
import type { Repo } from "@/components/shell/repos"
import { Spinner } from "@/components/shell/spinner"
import { StagingChanges } from "@/components/shell/staging-changes"
import { useLanguage } from "@/context/language"
import { useModels } from "@/context/models"
import { useServerSDK } from "@/context/server-sdk"

type GitTab = "files" | "commit"
type Entry = { name: string; path: string; absolute: string; type: "file" | "directory"; ignored: boolean }

export function GitPanel(props: {
  repos: Repo[]
  selectedRepo?: string
  width: number
  minWidth: number
  maxWidth: number
  loading?: boolean
  refresh?: number
  onResize: (width: number) => void
  onRefresh: () => void
  onSelectRepo: (directory: string) => void
  activeFile?: string
  onOpenDiff?: (target: { directory: string; file: string; staged: boolean }) => void
  onOpenFile?: (target: { directory: string; file: string }) => void
  onOpenCommit?: (target: { directory: string; hash: string }) => void
  activeCommit?: { directory: string; hash: string }
  contentTarget?: { directory: string; file: string }
  hideResize?: boolean
  conflicts: string[]
  activeModel?: { providerID: string; modelID: string }
  activeSessionId?: string
  sessions?: { sessionID: string; directory?: string }[]
}) {
  const language = useLanguage()
  const sdk = useServerSDK()

  const [tab, setTab] = createSignal<GitTab>("commit")
  const [message, setMessage] = createSignal("")
  const [revision, setRevision] = createSignal(0)

  createEffect(
    on(
      () => props.selectedRepo,
      () => setMessage(""),
      { defer: true },
    ),
  )

  onMount(() => {
    const bump = () => {
      if (typeof document !== "undefined" && document.hidden) return
      setRevision((value) => value + 1)
    }
    const timer = setInterval(bump, 5000)
    const onFocus = () => setRevision((value) => value + 1)
    const onVisible = () => {
      if (!document.hidden) setRevision((value) => value + 1)
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)
    onCleanup(() => {
      clearInterval(timer)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
    })
  })

  // Expanded directories, tracked by path outside the row components: the
  // auto-refresh rebuilds the rows, but expanded state must survive.
  const [openDirs, setOpenDirs] = createStore<Record<string, boolean>>({})
  // Rows render from a reconciled list so the periodic refresh only touches
  // rows whose entries actually changed.
  const [entryStore, setEntryStore] = createStore<Entry[]>([])

  const [entries] = createResource(
    () =>
      tab() === "files" && props.selectedRepo
        ? ([props.selectedRepo, props.refresh, revision()] as const)
        : undefined,
    async ([directory]) => {
      const next = await listEntries(directory, ".")
      if (tab() === "files" && props.selectedRepo) {
        setEntryStore(reconcile(next, { key: "path" }))
      }
      return next
    },
  )

  // Git status per file, so tree icons can carry the change tone.
  const [gitStatus] = createResource(
    () =>
      tab() === "files" && props.selectedRepo
        ? ([props.selectedRepo, props.refresh, revision()] as const)
        : undefined,
    async ([directory]) => {
      if (!directory) return {} as Record<string, GitTone>
      const list = await gitActions.status(directory).catch(() => [] as GitFileStatus[])
      const map: Record<string, GitTone> = {}
      for (const entry of list) {
        const code = entry.untracked ? "?" : entry.worktree !== " " ? entry.worktree : entry.index
        map[entry.file] = toneOf(code)
      }
      return map
    },
    { initialValue: {} },
  )
  const fileTone = (filePath: string) => gitStatus()[filePath]
  const sortedEntries = (list: Entry[]) =>
    list.toSorted((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  const listEntries = async (directory: string | undefined, path: string) => {
    if (!directory) return []
    const result = await sdk().client.file.list({ directory, path }).catch(() => undefined)
    return sortedEntries((result?.data ?? []) as Entry[])
  }

  const joinPath = (parent: string, name: string) => (parent === "." ? name : `${parent}/${name}`)

  // Lazy tree node: a directory expands in place and loads its children on
  // demand; the global refresh (revision) refetches every open level.
  const EntryNode = (node: { entry: Entry; parent: string; depth: number }) => {
    const path = () => joinPath(node.parent, node.entry.name)
    const open = () => Boolean(openDirs[path()])
    const isSelected = () =>
      node.entry.type === "file" &&
      props.contentTarget?.file === path() &&
      props.contentTarget?.directory === props.selectedRepo
    const toggle = () => {
      if (node.entry.type !== "directory") return
      setOpenDirs(path(), (value) => !value)
    }
    const [childStore, setChildStore] = createStore<Entry[]>([])
    const [children] = createResource(
      () =>
        node.entry.type === "directory" && open() && props.selectedRepo
          ? ([props.selectedRepo, path(), revision()] as const)
          : undefined,
      async ([directory, dirPath]) => {
        const next = await listEntries(directory, dirPath)
        if (props.selectedRepo && open()) {
          setChildStore(reconcile(next, { key: "path" }))
        }
        return next
      },
    )
    return (
      <>
        {/* Metrics match the session file tree: ~44px rows, tighter icon gap, 30px indent. */}
        <div
          class="group flex min-w-0 cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-1 text-[13px] leading-5 text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
          classList={{
            "bg-v2-overlay-simple-overlay-pressed": isSelected(),
          }}
          style={{ "padding-inline-start": `${node.depth * 22 + 6}px` }}
          title={path()}
          onClick={() =>
            node.entry.type === "directory"
              ? toggle()
              : props.selectedRepo && props.onOpenFile?.({ directory: props.selectedRepo, file: path() })
          }
        >
          {/* Folder rows show only the chevron + name; file rows show the type badge
              icon in mono gray, in full color when the file is open in the viewer. */}
          <Show
            when={node.entry.type === "directory"}
            fallback={
              <FileIcon
                node={{ path: path(), type: "file" }}
                mono={!isSelected()}
                class="size-4 shrink-0"
                classList={{
                  [toneTextColor(fileTone(path()))]: !!fileTone(path()),
                  "text-v2-icon-icon-muted": !fileTone(path()),
                }}
              />
            }
          >
            <Icon
              name="outline-chevron-down"
              size="normal"
              class={`shrink-0 text-v2-icon-icon-muted transition-transform ${open() ? "" : "-rotate-90"}`}
            />
          </Show>
          <span
            class="min-w-0 flex-1 truncate leading-5"
            classList={{ [toneTextColor(fileTone(path()))]: node.entry.type === "file" && !!fileTone(path()) }}
          >
            {node.entry.name}
          </span>
        </div>
        <Show when={node.entry.type === "directory" && open()}>
          <Show
            when={children.state !== "pending"}
            fallback={
              <div
                class="flex items-center justify-center gap-3 py-3 text-[12px] text-v2-text-text-muted"
                style={{ "padding-inline-start": `${node.depth * 22 + 6}px` }}
              >
                <Spinner />
                {language.t("common.loading")}
              </div>
            }
          >
            <For each={childStore}>
              {(entry) => <EntryNode entry={entry} parent={path()} depth={node.depth + 1} />}
            </For>
          </Show>
        </Show>
      </>
    )
  }

  return (
    <aside
      class="relative h-full shrink-0 flex flex-col border-l-[0.5px] border-v2-border-border-base bg-v2-background-bg-deep"
      style={{ width: `${props.width}px` }}
    >
      <div class="flex h-10 shrink-0 items-center gap-1 px-2">
        <button
          type="button"
          class="flex h-7 items-center gap-1.5 rounded-sm px-2 text-[13px] font-[440] leading-5 tracking-[-0.04px] transition-colors focus-visible:outline-none"
          classList={{
            "text-v2-text-text-base bg-v2-overlay-simple-overlay-pressed": tab() === "files",
            "text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover": tab() !== "files",
          }}
          onClick={() => setTab("files")}
        >
          <Icon name="filetree" size="small" />
          {language.t("shell.git.tab.files")}
        </button>
        <button
          type="button"
          class="flex h-7 items-center gap-1.5 rounded-sm px-2 text-[13px] font-[440] leading-5 tracking-[-0.04px] transition-colors focus-visible:outline-none"
          classList={{
            "text-v2-text-text-base bg-v2-overlay-simple-overlay-pressed": tab() === "commit",
            "text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover": tab() !== "commit",
          }}
          onClick={() => setTab("commit")}
        >
          <Icon name="outline-share" size="small" />
          {language.t("shell.git.tab.commit")}
        </button>
        <button
          type="button"
          class="ml-auto flex size-7 items-center justify-center rounded-sm text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
          onClick={() => setRevision((value) => value + 1)}
          title={language.t("shell.git.refresh")}
        >
          <Icon name="outline-refresh" size="small" />
        </button>
      </div>

      <ScrollView class="flex-1 min-h-0">
        <div class="flex flex-col gap-3 px-3 pb-4">
          <section class="flex flex-col gap-1">
            <div class="px-1 pt-1 text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
              {language.t("shell.git.workspace")}
            </div>
            <For each={props.repos}>
              {(repo) => (
                <button
                  type="button"
                  class="flex w-full min-w-0 flex-col items-stretch gap-1.5 rounded-md px-3 py-2 text-left transition-colors focus-visible:outline-none"
                  classList={{
                    "border-[1.5px] border-v2-border-border-focus bg-v2-background-bg-base":
                      props.selectedRepo === repo.directory,
                    "border-[0.5px] border-v2-border-border-muted hover:bg-v2-overlay-simple-overlay-hover":
                      props.selectedRepo !== repo.directory,
                  }}
                  onClick={() => props.onSelectRepo(repo.directory)}
                  title={repo.directory}
                >
                  <span class="min-w-0 truncate text-[13px] font-[530] leading-5 text-v2-text-text-base">
                    {getFilename(repo.directory)}
                  </span>
                  <div class="flex min-w-0 items-center gap-1 text-[12px] leading-4 text-v2-text-text-faint">
                    <Icon name="branch" size="small" class="shrink-0" />
                    <span class="min-w-0 truncate">{repo.branch ?? "—"}</span>
                  </div>
                </button>
              )}
            </For>
            <Show when={props.repos.length === 0}>
              <Show
                when={props.loading}
                fallback={<EmptyState text={language.t("shell.git.selectRepo")} />}
              >
                <div class="flex items-center gap-2 px-1 py-3 text-[12px] leading-5 text-v2-text-text-muted">
                  <Spinner />
                  {language.t("common.loading")}
                </div>
              </Show>
            </Show>
          </section>

          <Show when={props.selectedRepo}>
            <Show
              when={tab() === "files"}
              fallback={
                <CommitSection
                  directory={props.selectedRepo}
                  refresh={props.refresh}
                  revision={revision()}
                  message={message()}
                  setMessage={setMessage}
                  conflicts={props.conflicts}
                  onRefresh={props.onRefresh}
                  activeFile={props.activeFile}
                  onOpenDiff={props.onOpenDiff}
                  onOpenCommit={props.onOpenCommit}
                  activeCommit={props.activeCommit}
                  activeModel={props.activeModel}
                  activeSessionId={props.activeSessionId}
                  sessions={props.sessions}
                />
              }
            >
              <section class="flex flex-col">
                <div class="px-1 text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
                  {language.t("shell.git.files")}
                </div>
                <Show
                  when={entries.state !== "pending"}
                  fallback={
                    <div class="flex items-center justify-center gap-2 py-8 text-[12px] text-v2-text-text-muted">
                      <Spinner />
                      {language.t("common.loading")}
                    </div>
                  }
                >
                  <For each={entryStore}>
                    {(entry) => <EntryNode entry={entry} parent="." depth={0} />}
                  </For>
                </Show>
              </section>
            </Show>
          </Show>
        </div>
      </ScrollView>
      <Show when={!props.hideResize}>
        <ResizeHandle
          direction="horizontal"
          edge="start"
          size={props.width}
          min={props.minWidth}
          max={props.maxWidth}
          onResize={props.onResize}
        />
      </Show>
    </aside>
  )
}

function CommitSection(props: {
  directory?: string
  refresh?: number
  revision: number
  message: string
  setMessage: (value: string) => void
  conflicts: string[]
  onRefresh: () => void
  activeFile?: string
  onOpenDiff?: (target: { directory: string; file: string; staged: boolean }) => void
  onOpenCommit?: (target: { directory: string; hash: string }) => void
  activeCommit?: { directory: string; hash: string }
  activeModel?: { providerID: string; modelID: string }
  activeSessionId?: string
  sessions?: { sessionID: string; directory?: string }[]
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const sdk = useServerSDK()
  const models = useModels()
  const [busy, setBusy] = createSignal(false)
  const [stagedCount, setStagedCount] = createSignal(0)
  const [totalCount, setTotalCount] = createSignal(0)
  const [pending, setPending] = createSignal<string>()
  const [commits, setCommits] = createSignal<GitCommit[]>([])
  const [unpushedCount, setUnpushedCount] = createSignal(0)
  const [generating, setGenerating] = createSignal(false)
  const [changesOpen, setChangesOpen] = createSignal(true)
  const [historyOpen, setHistoryOpen] = createSignal(true)
  const [loadingMore, setLoadingMore] = createSignal(false)
  const [hasMore, setHasMore] = createSignal(true)
  const HISTORY_PAGE = 10

  const collectDiff = async (directory: string) => {
    const status = await gitActions.status(directory).catch(() => [] as GitFileStatus[])
    const stagedFiles = status.filter((item) => item.index !== " " && item.index !== "?")
    const useStaged = stagedFiles.length > 0
    const files = useStaged ? stagedFiles : status
    const chunks: string[] = []
    for (const item of files.slice(0, 30)) {
      const patch = useStaged
        ? await gitActions.stagedFileDiff(directory, item.file)
        : await gitActions.fileDiff(directory, item.file)
      if (patch.trim()) chunks.push(`### ${item.file}\n${patch}`)
    }
    return chunks.join("\n\n")
  }

  const generateMessage = async () => {
    const directory = props.directory
    if (!directory || generating()) return
    setGenerating(true)
    try {
      const client = sdk().client
      if (!client.session?.promptAsync || !client.session?.create || !client.session?.messages) {
        throw new Error(language.t("shell.git.generate.unsupported"))
      }
      const resolved =
        (await resolveCurrentModel({
          client,
          candidates: [props.activeModel, models.recent.list()[0]],
          sessions: props.sessions,
        })) ??
        (() => {
          const fallback = models.list().find((item) => models.visible({ providerID: item.provider.id, modelID: item.id }))
          return fallback ? { model: { providerID: fallback.provider.id, modelID: fallback.id } } : undefined
        })()
      if (!resolved) throw new Error(language.t("shell.git.generate.noModel"))
      const diff = await collectDiff(directory)
      if (!diff.trim()) throw new Error(language.t("shell.git.generate.noChanges"))

      const zh = language.locale().startsWith("zh")
      const system = zh
        ? "你是 Git 提交信息生成助手。根据提供的代码改动生成一条简洁、准确的提交信息。只输出提交信息本身，不要引号、代码块或任何解释。格式为 Conventional Commits：类型前缀（feat、fix、refactor、chore、docs、style、test 等）保留英文，冒号后的描述必须使用简体中文，用祈使语气，首行为简明摘要。例如：\"fix: 修复登录超时问题\"。"
        : "You are a git commit message generator. Given the provided code changes, write one concise, accurate commit message. Output only the commit message itself, with no quotes, code fences, or explanation. Use Conventional Commits style (feat:, fix:, refactor:, ...), imperative mood, with a short summary line."
      const text = `${zh ? "根据以下改动生成提交信息：" : "Generate a commit message for the following changes:"}\n\n${diff.slice(0, 12000)}`
      const message = await aiGenerateText({
        client,
        directory,
        model: { providerID: resolved.model.providerID, modelID: resolved.model.modelID },
        system,
        text,
      })
      props.setMessage(message)
    } catch (error) {
      dialog.show(() => (
        <DialogGitResult
          title={language.t("shell.ai.generateFailed")}
          status="error"
          message={error instanceof Error ? error.message : String(error)}
        />
      ))
    } finally {
      setGenerating(false)
    }
  }

  const loadCommits = async () => {
    const directory = props.directory
    if (!directory) {
      setCommits([])
      setHasMore(false)
      setUnpushedCount(0)
      return
    }
    try {
      const result = await gitActions.log(directory, HISTORY_PAGE, 0)
      setCommits(result)
      setHasMore(result.length >= HISTORY_PAGE)
    } catch {
      setCommits([])
      setHasMore(false)
    }
    setUnpushedCount(await gitActions.unpushed(directory).catch(() => 0))
  }

  const loadMoreCommits = async () => {
    const directory = props.directory
    if (!directory || loadingMore() || !hasMore()) return
    setLoadingMore(true)
    try {
      const result = await gitActions.log(directory, HISTORY_PAGE, commits().length)
      setCommits((list) => [...list, ...result])
      setHasMore(result.length >= HISTORY_PAGE)
    } catch {
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }

  const onHistoryScroll = (event: Event) => {
    const element = event.currentTarget as HTMLElement
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 24) void loadMoreCommits()
  }

  onMount(loadCommits)
  createEffect(
    on(
      () => props.directory,
      () => {
        setCommits([])
        setHasMore(true)
      },
      { defer: true },
    ),
  )
  createEffect(() => {
    props.directory
    props.refresh
    loadCommits()
  })

  const runAction = (key: string, title: string, successLabel: string, action: () => Promise<unknown>) => {
    setPending(key)
    Promise.resolve()
      .then(action)
      .then(() => {
        props.onRefresh()
        dialog.show(() => <DialogGitResult title={title} status="done" successLabel={successLabel} />)
      })
      .catch((error) => {
        dialog.show(() => (
          <DialogGitResult
            title={title}
            status="error"
            message={error instanceof Error ? error.message : String(error)}
          />
        ))
      })
      .finally(() => setPending(undefined))
  }

  const pushWithRecovery = () => {
    const directory = props.directory
    if (!directory) return
    setPending("push")
    dialog.show(() => (
      <DialogGitRun
        title={language.t("shell.git.push")}
        runningLabel={language.t("shell.git.pushing")}
        successLabel={language.t("shell.git.pushSuccess")}
        onSettled={() => setPending(undefined)}
        steps={[{ label: language.t("shell.git.push"), run: () => runPush(directory) }]}
        run={async () => {
          props.onRefresh()
        }}
      />
    ))
  }

  // Push and recover from a rejected (non-fast-forward) push by layering a
  // force-push confirmation on top of the progress dialog.
  const runPush = (directory: string) =>
    gitActions.push(directory).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error)
      if (!/rejected|non-fast-forward|fetch first|failed to push/i.test(message)) throw error
      return new Promise<string>((resolve, reject) => {
        dialog.push(
          () => (
            <DialogConfirm
              title={language.t("shell.git.pushRejected.title")}
              description={language.t("shell.git.pushRejected.description")}
              confirmLabel={language.t("shell.git.pushRejected.confirm")}
              onConfirm={() => gitActions.pushForce(directory).then(resolve, reject)}
            />
          ),
          () => reject(new Error(message)),
        )
      })
    })

  const requestUndoCommit = async () => {
    const directory = props.directory
    if (!directory) return
    const info = await gitActions.undoCommitInfo(directory).catch(() => ({ root: false, pushed: false }))
    if (info.root) {
      dialog.show(() => (
        <DialogGitResult
          title={language.t("shell.git.undoCommit")}
          status="error"
          message={language.t("shell.git.undoRoot.description")}
        />
      ))
      return
    }
    dialog.show(() => (
      <DialogConfirm
        title={language.t("shell.git.undoCommitConfirm.title")}
        description={
          info.pushed
            ? language.t("shell.git.undoCommitConfirm.pushed")
            : language.t("shell.git.undoCommitConfirm.description")
        }
        confirmLabel={language.t("shell.git.undoCommit")}
        onConfirm={() =>
          runAction(
            "undoCommit",
            language.t("shell.git.undoCommit"),
            language.t("shell.git.undoCommitSuccess"),
            () => gitActions.undoCommit(directory),
          )
        }
      />
    ))
  }

  const commitAndPush = () => {
    const directory = props.directory
    const message = props.message.trim()
    if (!directory || !message) return
    setPending("commit")
    dialog.show(() => (
      <DialogGitRun
        title={language.t("shell.git.commitAndPush")}
        successLabel={language.t("shell.git.commitSuccess")}
        onSettled={() => setPending(undefined)}
        steps={[
          {
            label: language.t("shell.git.stageAll"),
            run: () => (stagedCount() === 0 ? gitActions.stageAll(directory, []) : Promise.resolve("")),
          },
          { label: language.t("shell.git.commit"), run: () => gitActions.commit(directory, message) },
          { label: language.t("shell.git.push"), run: () => gitActions.push(directory) },
        ]}
        run={async () => {
          props.setMessage("")
          props.onRefresh()
        }}
      />
    ))
  }

  const hasContent = () => Boolean(props.directory && props.message.trim() && totalCount() > 0)
  const canCommit = () => hasContent() && !busy()

  const abortMerge = () => {
    const directory = props.directory
    if (!directory) return
    setPending("abort")
    dialog.show(() => (
      <DialogGitRun
        title={language.t("shell.git.conflict.abort")}
        runningLabel={language.t("shell.git.merge.aborting")}
        successLabel={language.t("shell.git.merge.abortSuccess")}
        onSettled={() => setPending(undefined)}
        run={async () => {
          await gitActions.mergeAbort(directory)
          props.onRefresh()
        }}
      />
    ))
  }

  return (
    <section class="flex flex-col gap-3">
      <Show when={props.conflicts.length > 0 && props.directory}>
        <div class="flex items-center gap-2 rounded-md border-[0.5px] border-[#f85149] bg-[#f851491a] px-2 py-1.5">
          <Icon name="warning" size="small" class="shrink-0 text-[#f85149]" />
          <span class="min-w-0 flex-1 truncate text-[12px] font-[530] text-[#f85149]">
            {language.t("shell.git.conflict.title")} · {props.conflicts.length}
          </span>
          <button
            type="button"
            class="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none disabled:opacity-40"
            disabled={busy() || pending() === "abort"}
            onClick={() => abortMerge()}
          >
            {language.t("shell.git.conflict.abort")}
          </button>
        </div>
      </Show>

      <button
        type="button"
        class="flex items-center gap-1 px-1 text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted hover:text-v2-text-text-base focus-visible:outline-none"
        onClick={() => setChangesOpen((value) => !value)}
      >
        <Icon
          name="outline-chevron-down"
          size="small"
          class={`shrink-0 transition-transform ${changesOpen() ? "" : "-rotate-90"}`}
        />
        {language.t("shell.git.changes")}
      </button>
      <div classList={{ hidden: !changesOpen() }}>
        <StagingChanges
          directory={props.directory}
          refresh={props.refresh}
          revision={props.revision}
          onCount={setStagedCount}
          onTotal={setTotalCount}
          conflicts={props.conflicts}
          activeFile={props.activeFile}
          onOpenDiff={props.onOpenDiff}
        />
      </div>

      <div class="flex items-center justify-between px-1">
        <span class="text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
          {language.t("shell.git.commit")}
        </span>
        <button
          type="button"
          class="flex size-6 items-center justify-center rounded-sm text-v2-icon-icon-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          title={language.t("shell.git.generate.tooltip")}
          disabled={generating() || busy() || !props.directory}
          onClick={() => void generateMessage()}
        >
          <Show when={generating()} fallback={<Icon name="robot" size="small" />}>
            <Spinner />
          </Show>
        </button>
      </div>
      <textarea
        class="h-24 w-full resize-none rounded-md border-[0.5px] border-v2-border-border-base bg-v2-background-bg-base px-2 py-1.5 text-[13px] leading-5 text-v2-text-text-base placeholder:text-v2-text-text-faint focus-visible:border-v2-border-border-focus focus-visible:outline-none disabled:opacity-60"
        placeholder={language.t("shell.git.messagePlaceholder")}
        value={props.message}
        disabled={busy()}
        onInput={(event) => props.setMessage(event.currentTarget.value)}
      />
      <Show
        when={hasContent()}
        fallback={
          <button
            type="button"
            class="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border-[0.5px] border-v2-border-border-base bg-v2-background-bg-layer-02 text-[13px] font-[440] text-v2-text-text-faint"
            disabled
          >
            <Icon name="outline-share" size="small" />
            {language.t("shell.git.commitAndPush")}
          </button>
        }
      >
        <button
          type="button"
          class="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[#6366F1] text-[13px] font-[440] text-[#ffffff] transition-opacity hover:opacity-90 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy() || pending() === "commit"}
          onClick={commitAndPush}
        >
          <Show when={busy() || pending() === "commit"} fallback={<Icon name="outline-share" size="small" />}>
            <Spinner class="!text-[#ffffff]" />
          </Show>
          {language.t("shell.git.commitAndPush")}
        </button>
      </Show>
      <div class="flex flex-wrap gap-1 [&>button]:grow [&>button]:basis-[90px]">
        <GitButton
          icon="outline-share"
          label={language.t("shell.git.push")}
          loading={pending() === "push"}
          disabled={busy() || !props.directory}
          badge={unpushedCount()}
          onClick={() => void pushWithRecovery()}
        />
        <GitButton
          icon="branch"
          label={language.t("shell.git.merge")}
          disabled={busy() || !props.directory}
          onClick={() =>
            dialog.show(() => <DialogMerge directory={props.directory!} onMerged={props.onRefresh} />)
          }
        />
        <Show
          when={props.conflicts.length > 0}
          fallback={
            <GitButton
              icon="reset"
              label={language.t("shell.git.discard")}
              loading={pending() === "discard"}
              disabled={busy() || !props.directory}
              onClick={() =>
                dialog.show(() => (
                  <DialogConfirm
                    title={language.t("shell.git.discardConfirm.title")}
                    description={language.t("shell.git.discardConfirm.description")}
                    confirmLabel={language.t("shell.git.discard")}
                    onConfirm={() =>
                      runAction("discard", language.t("shell.git.discard"), language.t("shell.git.discardSuccess"), () =>
                        gitActions.discard(props.directory!),
                      )
                    }
                  />
                ))
              }
            />
          }
        >
          <GitButton
            icon="outline-xmark"
            label={language.t("shell.git.conflict.abort")}
            loading={pending() === "abort"}
            disabled={busy() || !props.directory}
            onClick={() => abortMerge()}
          />
        </Show>
        <GitButton
          icon="outline-reset"
          label={language.t("shell.git.undoCommit")}
          loading={pending() === "undoCommit"}
          disabled={busy() || !props.directory}
          onClick={() => void requestUndoCommit()}
        />
      </div>
      <button
        type="button"
        class="mt-1 flex items-center gap-1 px-1 text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted hover:text-v2-text-text-base focus-visible:outline-none"
        onClick={() => setHistoryOpen((value) => !value)}
      >
        <Icon
          name="outline-chevron-down"
          size="small"
          class={`shrink-0 transition-transform ${historyOpen() ? "" : "-rotate-90"}`}
        />
        <Icon name="archive" size="small" class="shrink-0" />
        {language.t("shell.git.history")}
      </button>
      <Show when={historyOpen()}>
        <div
          class="flex max-h-[260px] flex-col overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-v2-border-border-muted [&::-webkit-scrollbar-track]:bg-transparent"
          onScroll={onHistoryScroll}
        >
          <Show when={commits().length > 0} fallback={<EmptyState text={language.t("shell.git.noHistory")} />}>
            <For each={commits()}>
              {(commit) => (
                <div
                  class="flex min-w-0 shrink-0 cursor-pointer items-center gap-2 rounded-sm px-1.5 py-[3px] text-[12px] leading-5 hover:bg-v2-overlay-simple-overlay-hover"
                  classList={{
                    "bg-v2-overlay-simple-overlay-pressed":
                      props.directory === props.activeCommit?.directory && commit.hash === props.activeCommit?.hash,
                  }}
                  title={`${commit.hash} ${commit.subject}`}
                  onClick={() => props.directory && props.onOpenCommit?.({ directory: props.directory, hash: commit.hash })}
                >
                  <span class="shrink-0 font-mono text-[11px] text-v2-text-text-muted">{commit.hash}</span>
                  <span class="min-w-0 flex-1 truncate text-v2-text-text-base">{commit.subject}</span>
                  <span class="min-w-0 truncate text-[11px] text-v2-text-text-muted">
                    {commit.author} · {commit.when}
                  </span>
                </div>
              )}
            </For>
            <Show when={loadingMore()}>
              <div class="flex items-center justify-center gap-2 py-2 text-[12px] text-v2-text-text-muted">
                <Spinner />
                {language.t("common.loading")}
              </div>
            </Show>
            <Show when={!loadingMore() && !hasMore() && commits().length > 0}>
              <div class="py-2 text-center text-[11px] text-v2-text-text-faint">
                {language.t("shell.git.history.noMore")}
              </div>
            </Show>
          </Show>
        </div>
      </Show>
    </section>
  )
}

function ActionButton(props: { icon: string; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class="flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-sm border-[0.5px] border-v2-border-border-muted px-2 text-[12px] font-[440] text-v2-text-text-base transition-opacity hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none disabled:opacity-40"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon name={props.icon} size="small" class="shrink-0" />
      <span class="truncate">{props.label}</span>
    </button>
  )
}

function EmptyState(props: { text: string }) {
  return <div class="px-1 py-6 text-center text-[12px] leading-5 text-v2-text-text-muted">{props.text}</div>
}
