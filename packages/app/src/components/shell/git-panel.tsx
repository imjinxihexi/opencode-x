import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js"
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
import { gitActions, type GitCommit } from "@/components/shell/git-actions"
import type { Repo } from "@/components/shell/repos"
import { Spinner } from "@/components/shell/spinner"
import { StagingChanges } from "@/components/shell/staging-changes"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"

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
  hideResize?: boolean
  conflicts: string[]
}) {
  const language = useLanguage()
  const sdk = useServerSDK()

  const [tab, setTab] = createSignal<GitTab>("commit")
  const [message, setMessage] = createSignal("")
  const [revision, setRevision] = createSignal(0)

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

  const [entries] = createResource(
    () =>
      tab() === "files" && props.selectedRepo
        ? ([props.selectedRepo, props.refresh, revision()] as const)
        : undefined,
    async ([directory]) => {
      if (!directory) return []
      const result = await sdk().client.file.list({ directory, path: "." }).catch(() => undefined)
      const all = (result?.data ?? []) as Entry[]
      return all.toSorted((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    },
  )
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
          <Icon name="reset" size="small" />
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
                />
              }
            >
              <section class="flex flex-col gap-0.5">
                <div class="px-1 text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
                  {language.t("shell.git.files")}
                </div>
                <Show
                  when={!entries.loading}
                  fallback={<div class="px-1 py-4 text-[12px] text-v2-text-text-muted">{language.t("common.loading")}</div>}
                >
                  <For each={entries()}>
                    {(entry) => (
                      <div
                        class="flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
                        title={entry.path}
                      >
                        <Icon
                          name={entry.type === "directory" ? "folder" : "filetree"}
                          size="small"
                          class="shrink-0 text-v2-icon-icon-muted"
                        />
                        <span class="min-w-0 flex-1 truncate text-[12px] leading-5">{entry.name}</span>
                      </div>
                    )}
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
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const [busy, setBusy] = createSignal(false)
  const [stagedCount, setStagedCount] = createSignal(0)
  const [totalCount, setTotalCount] = createSignal(0)
  const [pending, setPending] = createSignal<string>()
  const [commits, setCommits] = createSignal<GitCommit[]>([])

  const loadCommits = () => {
    const directory = props.directory
    if (!directory) {
      setCommits([])
      return
    }
    gitActions
      .log(directory, 20)
      .then((result) => setCommits(result))
      .catch(() => setCommits([]))
  }

  onMount(loadCommits)
  createEffect(() => {
    props.directory
    props.refresh
    loadCommits()
  })

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await action()
      props.onRefresh()
      loadCommits()
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("shell.git.actionFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

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
        run={async () => {
          if (stagedCount() === 0) await gitActions.stageAll(directory, [])
          await gitActions.commit(directory, message)
          await gitActions.push(directory)
          props.setMessage("")
          props.onRefresh()
        }}
      />
    ))
  }

  const hasContent = () => Boolean(props.directory && props.message.trim() && totalCount() > 0)
  const canCommit = () => hasContent() && !busy()

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
            class="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
            disabled={busy()}
            onClick={() => void run(() => gitActions.mergeAbort(props.directory!))}
          >
            {language.t("shell.git.conflict.abort")}
          </button>
        </div>
      </Show>

      <div class="px-1 text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
        {language.t("shell.git.changes")}
      </div>
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

      <div class="px-1 text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
        {language.t("shell.git.commit")}
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
      <div class="grid grid-cols-2 gap-1">
        <GitButton
          icon="outline-share"
          label={language.t("shell.git.push")}
          loading={pending() === "push"}
          disabled={busy() || !props.directory}
          onClick={() =>
            props.directory &&
            runAction("push", language.t("shell.git.push"), language.t("shell.git.pushSuccess"), () =>
              gitActions.push(props.directory!),
            )
          }
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
            onClick={() =>
              props.directory &&
              runAction(
                "abort",
                language.t("shell.git.conflict.abort"),
                language.t("shell.git.merge.abortSuccess"),
                () => gitActions.mergeAbort(props.directory!),
              )
            }
          />
        </Show>
        <GitButton
          icon="outline-reset"
          label={language.t("shell.git.undoCommit")}
          loading={pending() === "undoCommit"}
          disabled={busy() || !props.directory}
          onClick={() =>
            dialog.show(() => (
              <DialogConfirm
                title={language.t("shell.git.undoCommitConfirm.title")}
                description={language.t("shell.git.undoCommitConfirm.description")}
                confirmLabel={language.t("shell.git.undoCommit")}
                onConfirm={() =>
                  runAction(
                    "undoCommit",
                    language.t("shell.git.undoCommit"),
                    language.t("shell.git.undoCommitSuccess"),
                    () => gitActions.undoCommit(props.directory!),
                  )
                }
              />
            ))
          }
        />
      </div>
      <div class="mt-1 flex items-center gap-1.5 px-1 text-[11px] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
        <Icon name="archive" size="small" />
        {language.t("shell.git.history")}
      </div>
      <div class="flex flex-col">
        <Show when={commits().length > 0} fallback={<EmptyState text={language.t("shell.git.noHistory")} />}>
          <For each={commits()}>
            {(commit) => (
              <div
                class="flex min-w-0 items-center gap-2 rounded-sm px-1.5 py-[3px] text-[12px] leading-5 hover:bg-v2-overlay-simple-overlay-hover"
                title={`${commit.hash} ${commit.subject}`}
              >
                <span class="shrink-0 font-mono text-[11px] text-v2-text-text-muted">{commit.hash}</span>
                <span class="min-w-0 flex-1 truncate text-v2-text-text-base">{commit.subject}</span>
                <span class="shrink-0 text-[11px] text-v2-text-text-muted">
                  {commit.author} · {commit.when}
                </span>
              </div>
            )}
          </For>
        </Show>
      </div>
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
