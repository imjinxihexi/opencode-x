import { For, Show, createResource, createSignal, onCleanup, type JSX } from "solid-js"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { gitActions, type GitCommitDetail, type GitCommitFile } from "@/components/shell/git-actions"
import { toneOf, toneTextColor } from "@/components/shell/staging-changes"
import { Spinner } from "@/components/shell/spinner"
import { useLanguage } from "@/context/language"

export type CommitTarget = { directory: string; hash: string }

export function CommitDetailPanel(props: {
  target: CommitTarget
  width: number
  minWidth: number
  maxWidth: number
  onResize: (width: number) => void
  onClose: () => void
}) {
  const language = useLanguage()

  const [detail] = createResource(
    () => `${props.target.directory}\u0000${props.target.hash}`,
    () => gitActions.showCommit(props.target.directory, props.target.hash),
  )

  return (
    <aside
      class="relative h-full shrink-0 flex flex-col border-l-[0.5px] border-v2-border-border-base bg-v2-background-bg-base"
      style={{ width: `${props.width}px` }}
    >
      <div class="flex h-10 shrink-0 items-center gap-2 border-b-[0.5px] border-v2-border-border-muted px-3">
        <span class="min-w-0 flex-1 truncate text-[13px] font-[530] text-v2-text-text-base">
          {language.t("shell.git.commitDetail.title")}
        </span>
        <button
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
          title={language.t("common.close")}
          onClick={props.onClose}
        >
          <Icon name="close" size="small" />
        </button>
      </div>

      <ScrollView class="flex-1 min-h-0">
        <Show
          when={!detail.loading}
          fallback={
            <div class="flex items-center justify-center gap-2 py-8 text-[12px] text-v2-text-text-muted">
              <Spinner />
              {language.t("common.loading")}
            </div>
          }
        >
          <Show when={detail()} fallback={<EmptyState text={language.t("shell.git.commitDetail.failed")} />}>
            {(commit) => <CommitDetail commit={commit()} />}
          </Show>
        </Show>
      </ScrollView>

      <ResizeHandle
        direction="horizontal"
        edge="start"
        size={props.width}
        min={props.minWidth}
        max={props.maxWidth}
        onResize={props.onResize}
      />
    </aside>
  )
}

function CommitDetail(props: { commit: GitCommitDetail }) {
  const language = useLanguage()
  // Render the message like a commit: first line as title, the rest as body.
  const [subject, ...body] = props.commit.message.split("\n")
  const bodyText = () => body.join("\n").trim()
  return (
    <div class="flex flex-col px-3 py-3">
      <div class="break-words text-[14px] font-[590] leading-6 text-v2-text-text-base">{subject}</div>
      <Show when={bodyText()}>
        <div class="mt-2 whitespace-pre-wrap break-words border-s-2 border-v2-border-border-muted ps-2.5 text-[12px] leading-5 text-v2-text-text-muted">
          {bodyText()}
        </div>
      </Show>

      <div class="mt-3 flex flex-col gap-1.5 rounded-md bg-v2-background-bg-layer-02 px-2.5 py-2">
        <MetaRow label={language.t("shell.git.commitDetail.hash")}>
          <CopyHash hash={props.commit.hash} label={language.t("shell.git.commitDetail.copyHash")} />
        </MetaRow>
        <Show when={props.commit.parents.length > 0}>
          <MetaRow label={language.t("shell.git.commitDetail.parent")}>
            {props.commit.parents.map((parent) => (
              <span
                class="rounded-sm bg-v2-background-bg-base px-1 font-mono text-[11px] leading-4 text-v2-text-text-muted"
                title={parent}
              >
                {parent.slice(0, 7)}
              </span>
            ))}
          </MetaRow>
        </Show>
        <MetaRow label={language.t("shell.git.commitDetail.author")}>
          <span class="break-words text-[12px] leading-5 text-v2-text-text-base">{props.commit.author}</span>
        </MetaRow>
        <MetaRow label={language.t("shell.git.commitDetail.date")}>
          <span class="text-[12px] leading-5 text-v2-text-text-base">{formatDate(props.commit.date)}</span>
        </MetaRow>
        <Show when={props.commit.committer !== props.commit.author}>
          <MetaRow label={language.t("shell.git.commitDetail.committer")}>
            <span class="break-words text-[12px] leading-5 text-v2-text-text-base">{props.commit.committer}</span>
          </MetaRow>
        </Show>
      </div>

      <div class="mt-3 flex items-center gap-1.5 px-1">
        <span class="text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
          {language.t("shell.git.files")}
        </span>
        <span class="rounded-full bg-v2-background-bg-layer-02 px-1.5 text-[10px] font-[530] leading-4 text-v2-text-text-muted">
          {props.commit.filesTotal}
        </span>
      </div>
      <div class="mt-1 flex flex-col gap-0.5">
        <For each={props.commit.files}>
          {(file) => <CommitFileRow file={file} />}
        </For>
        <Show when={props.commit.filesTotal > props.commit.files.length}>
          <div class="px-1.5 py-1 text-[11px] text-v2-text-text-faint">
            {language.t("shell.git.commitDetail.moreFiles", {
              count: props.commit.filesTotal - props.commit.files.length,
            })}
          </div>
        </Show>
        <Show when={props.commit.files.length === 0}>
          <EmptyState text={language.t("shell.git.noChanges")} />
        </Show>
      </div>
    </div>
  )
}

function MetaRow(props: { label: string; children: JSX.Element }) {
  return (
    <div class="flex items-start gap-2 text-[12px] leading-5">
      <span class="w-12 shrink-0 pt-0.5 text-[11px] text-v2-text-text-muted">{props.label}</span>
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
        {props.children}
      </div>
    </div>
  )
}

function CopyHash(props: { hash: string; label: string }) {
  const [copied, setCopied] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
  const short = props.hash.slice(0, 7)
  const copy = () => {
    void navigator.clipboard.writeText(short).then(() => {
      setCopied(true)
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <button
      type="button"
      class="group flex min-w-0 items-center gap-1.5 rounded-sm focus-visible:outline-none"
      title={props.label}
      onClick={copy}
    >
      <span class="shrink-0 font-mono text-[12px] leading-5 text-v2-text-text-base">{short}</span>
      <span class="min-w-0 truncate font-mono text-[11px] leading-5 text-v2-text-text-faint">{props.hash}</span>
      <Icon
        name={copied() ? "check" : "outline-copy"}
        size="small"
        class={copied() ? "shrink-0 text-[#3fb950]" : "shrink-0 text-v2-icon-icon-muted opacity-0 transition-opacity group-hover:opacity-100"}
      />
    </button>
  )
}

function CommitFileRow(props: { file: GitCommitFile }) {
  const tone = () => toneOf(props.file.status)
  // Emphasize the file name and mute the directory part.
  const split = (() => {
    const index = props.file.file.lastIndexOf("/")
    if (index === -1) return { dir: "", name: props.file.file }
    return { dir: props.file.file.slice(0, index + 1), name: props.file.file.slice(index + 1) }
  })()
  return (
    <div
      class="flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-[13px] leading-5 hover:bg-v2-overlay-simple-overlay-hover"
      title={props.file.file}
    >
      <FileIcon node={{ path: props.file.file, type: "file" }} mono class="size-4 shrink-0 text-v2-icon-icon-muted" />
      <span class="min-w-0 flex-1 truncate">
        <span class="text-v2-text-text-faint">{split.dir}</span>
        <span class="text-v2-text-text-base">{split.name}</span>
      </span>
      <span
        class={`shrink-0 rounded-sm border-[0.5px] border-current px-1 font-mono text-[10px] font-[590] leading-4 ${toneTextColor(tone())}`}
      >
        {props.file.status}
      </span>
    </div>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })
}

function EmptyState(props: { text: string }) {
  return <div class="px-1 py-6 text-center text-[12px] leading-5 text-v2-text-text-muted">{props.text}</div>
}
