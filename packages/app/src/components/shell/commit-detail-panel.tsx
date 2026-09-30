import { For, Show, createResource } from "solid-js"
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
  return (
    <div class="flex flex-col gap-1.5 px-3 py-3">
      <MetaRow
        label={language.t("shell.git.commitDetail.hash")}
        value={`${props.commit.shortHash} ${props.commit.hash}`}
      />
      <Show when={props.commit.parents.length > 0}>
        <MetaRow
          label={language.t("shell.git.commitDetail.parent")}
          value={props.commit.parents.map((parent) => parent.slice(0, 7)).join(" ")}
        />
      </Show>
      <MetaRow label={language.t("shell.git.commitDetail.author")} value={props.commit.author} />
      <MetaRow label={language.t("shell.git.commitDetail.date")} value={formatDate(props.commit.date)} />
      <MetaRow label={language.t("shell.git.commitDetail.committer")} value={props.commit.committer} />

      <div class="whitespace-pre-wrap break-words rounded-md border-[0.5px] border-v2-border-border-muted bg-v2-background-bg-layer-02 px-2.5 py-2 text-[13px] leading-5 text-v2-text-text-base">
        {props.commit.message}
      </div>

      <div class="px-1 text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
        {language.t("shell.git.files")}
      </div>
      <div class="flex flex-col gap-0.5">
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

function MetaRow(props: { label: string; value: string }) {
  return (
    <div class="flex items-start gap-2 text-[12px] leading-5">
      <span class="w-14 shrink-0 text-v2-text-text-muted">{props.label}</span>
      <span class="min-w-0 flex-1 break-words text-v2-text-text-base" title={props.value}>
        {props.value}
      </span>
    </div>
  )
}

function CommitFileRow(props: { file: GitCommitFile }) {
  const tone = () => toneOf(props.file.status)
  return (
    <div class="flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-[13px] leading-5 hover:bg-v2-overlay-simple-overlay-hover">
      <FileIcon node={{ path: props.file.file, type: "file" }} mono class="size-4 shrink-0 text-v2-icon-icon-muted" />
      <span class="min-w-0 flex-1 truncate text-v2-text-text-base" title={props.file.file}>
        {props.file.file}
      </span>
      <span class={`shrink-0 font-mono text-[11px] ${toneTextColor(tone())}`}>{props.file.status}</span>
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
