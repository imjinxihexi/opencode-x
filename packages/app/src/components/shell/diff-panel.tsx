import { For, Show, createMemo, createResource, createSignal } from "solid-js"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { gitActions } from "@/components/shell/git-actions"
import { ConflictMerge } from "@/components/shell/conflict-merge"
import { rowClass, splitHunks, toSplit, toUnified, type UnifiedRow } from "@/components/shell/staging-changes"
import { Spinner } from "@/components/shell/spinner"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"

export type DiffTarget = { directory: string; file: string; staged: boolean }

export function DiffPanel(props: {
  target: DiffTarget
  width: number
  minWidth: number
  maxWidth: number
  refresh?: number
  onResize: (width: number) => void
  onClose: () => void
  onChanged: () => void
  conflicts: string[]
  onResolved: () => void
}) {
  const language = useLanguage()
  const [split, setSplit] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [rev, setRev] = createSignal(0)

  const [diff] = createResource(
    () => [props.target.directory, props.target.file, props.target.staged, props.refresh, rev()] as const,
    async ([directory, file, isStaged]) =>
      (isStaged ? gitActions.stagedFileDiff(directory, file) : gitActions.fileDiff(directory, file)).catch(() => ""),
  )

  const parsed = createMemo(() => splitHunks(diff() ?? ""))

  const applyHunk = async (hunk: string[]) => {
    const text = [...parsed().header, ...hunk].join("\n") + "\n"
    setBusy(true)
    try {
      await gitActions.applyCached(props.target.directory, text, props.target.staged)
      setRev((value) => value + 1)
      props.onChanged()
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

  return (
    <aside
      class="relative h-full shrink-0 flex flex-col border-l-[0.5px] border-v2-border-border-base bg-v2-background-bg-base"
      style={{ width: `${props.width}px` }}
    >
      <div class="flex h-10 shrink-0 items-center gap-2 border-b-[0.5px] border-v2-border-border-muted px-3">
        <span class="min-w-0 flex-1 truncate font-mono text-[12px] text-v2-text-text-base" title={props.target.file}>
          {props.target.file}
        </span>
        <span class="shrink-0 text-[10px] uppercase text-v2-text-text-muted">
          {props.target.staged ? language.t("shell.git.staged") : language.t("shell.git.unstaged")}
        </span>
        <button
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
          classList={{ "bg-v2-overlay-simple-overlay-pressed text-v2-text-text-base": !split() }}
          title={language.t("shell.git.diff.unified")}
          onClick={() => setSplit(false)}
        >
          <Icon name="unified" size="small" />
        </button>
        <button
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
          classList={{ "bg-v2-overlay-simple-overlay-pressed text-v2-text-text-base": split() }}
          title={language.t("shell.git.diff.split")}
          onClick={() => setSplit(true)}
        >
          <Icon name="split" size="small" />
        </button>
        <button
          type="button"
          class="flex size-6 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
          title={language.t("common.close")}
          onClick={props.onClose}
        >
          <Icon name="close" size="small" />
        </button>
      </div>

      <Show when={props.conflicts.includes(props.target.file)}>
        <ConflictMerge directory={props.target.directory} file={props.target.file} onResolved={props.onResolved} />
      </Show>

      <Show when={!props.conflicts.includes(props.target.file)}>
      <Show
        when={!diff.loading}
        fallback={
          <div class="flex flex-1 items-center justify-center gap-2 text-[12px] text-v2-text-text-muted">
            <Spinner />
            {language.t("common.loading")}
          </div>
        }
      >
        <Show
          when={diff()?.trim()}
          fallback={
            <div class="flex flex-1 items-center justify-center text-[12px] text-v2-text-text-muted">
              {language.t("shell.git.noDiff")}
            </div>
          }
        >
          <div class="min-h-0 flex-1 overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-v2-border-border-muted [&::-webkit-scrollbar-track]:bg-transparent">
            <div class="w-max min-w-full py-2">
              <For each={parsed().hunks}>
                {(hunk) => (
                  <div class="mb-2 border-b-[0.5px] border-v2-border-border-muted last:border-b-0">
                    <div class="flex items-center gap-1 bg-v2-background-bg-layer-01 px-3 py-0.5">
                      <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-v2-text-text-muted">{hunk[0]}</span>
                      <button
                        type="button"
                        class="flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none disabled:opacity-40"
                        disabled={busy()}
                        onClick={() => void applyHunk(hunk)}
                      >
                        <Show when={busy()}>
                          <Spinner />
                        </Show>
                        {props.target.staged ? language.t("shell.git.unstage") : language.t("shell.git.stage")}
                      </button>
                    </div>
                    <Show when={!split()} fallback={<DiffSplit hunk={hunk} />}>
                      <For each={toUnified(hunk)}>
                        {(row) => (
                          <div class={`flex whitespace-pre font-mono text-[11px] leading-4 ${rowClass(row.kind)}`}>
                            <span class="w-10 shrink-0 select-none px-1 text-end text-v2-text-text-muted opacity-60">
                              {row.right ?? row.left ?? ""}
                            </span>
                            <span class="min-w-0 flex-1 pe-3">{row.text}</span>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </Show>
      </Show>

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

function DiffSplit(props: { hunk: string[] }) {
  return (
    <For each={toSplit(props.hunk)}>
      {(row) => (
        <div class="flex">
          <div class="flex w-1/2 min-w-0 border-e-[0.5px] border-v2-border-border-muted">
            <span class="w-10 shrink-0 select-none px-1 text-end font-mono text-[11px] leading-4 text-v2-text-text-muted opacity-60">
              {row.left?.left ?? ""}
            </span>
            <span class={`min-w-0 flex-1 truncate pe-2 font-mono text-[11px] leading-4 ${rowClass(row.left?.kind ?? "ctx")}`}>
              {row.left?.text ?? ""}
            </span>
          </div>
          <div class="flex w-1/2 min-w-0">
            <span class="w-10 shrink-0 select-none px-1 text-end font-mono text-[11px] leading-4 text-v2-text-text-muted opacity-60">
              {row.right?.right ?? ""}
            </span>
            <span class={`min-w-0 flex-1 truncate pe-2 font-mono text-[11px] leading-4 ${rowClass(row.right?.kind ?? "ctx")}`}>
              {row.right?.text ?? ""}
            </span>
          </div>
        </div>
      )}
    </For>
  )
}
