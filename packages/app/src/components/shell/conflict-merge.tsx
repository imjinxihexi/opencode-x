import { Show, createEffect, createResource, onCleanup, onMount } from "solid-js"
import { EditorState } from "@codemirror/state"
import { keymap } from "@codemirror/view"
import { EditorView } from "@codemirror/view"
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands"
import { MergeView } from "@codemirror/merge"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { gitActions } from "@/components/shell/git-actions"
import { Spinner } from "@/components/shell/spinner"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"

function baseTheme() {
  return [
    EditorView.lineWrapping,
    EditorView.theme({
      "&": { height: "100%", fontSize: "12px" },
      ".cm-scroller": { fontFamily: "var(--font-family-mono, monospace)", overflow: "auto" },
      ".cm-gutters": { backgroundColor: "transparent", border: "none" },
    }),
  ]
}

export function ConflictMerge(props: { directory: string; file: string; onResolved: () => void }) {
  const language = useLanguage()
  let host: HTMLDivElement | undefined
  let view: MergeView | undefined

  const [sides] = createResource(
    () => [props.directory, props.file] as const,
    async ([directory, file]) => gitActions.conflictSides(directory, file),
  )

  const current = () => view?.b.state.doc.toString() ?? ""

  const build = () => {
    if (!host || !sides()) return
    view?.destroy()
    view = new MergeView({
      a: {
        doc: sides()!.ours,
        extensions: [EditorState.readOnly.of(true), ...baseTheme()],
      },
      b: {
        doc: sides()!.theirs,
        extensions: [history(), keymap.of([...historyKeymap, ...defaultKeymap]), ...baseTheme()],
      },
      parent: host,
      orientation: "a-b",
      revertControls: "a-to-b",
    })
  }

  onMount(build)
  createEffect(() => {
    sides()
    build()
  })
  onCleanup(() => view?.destroy())

  const setSide = (side: "ours" | "theirs") => {
    if (!view || !sides()) return
    const text = side === "ours" ? sides()!.ours : sides()!.theirs
    const doc = view.b.state.doc
    view.b.dispatch({ changes: { from: 0, to: doc.length, insert: text } })
  }

  const save = async () => {
    try {
      await gitActions.writeResolved(props.directory, props.file, current())
      props.onResolved()
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("shell.git.actionFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex shrink-0 items-center gap-1 px-3 py-1.5">
        <span class="min-w-0 flex-1 truncate text-[11px] text-v2-text-text-muted">
          {language.t("shell.git.conflict.mergeHint")}
        </span>
        <button
          type="button"
          class="flex h-7 items-center gap-1.5 rounded-sm border-[0.5px] border-v2-border-border-muted px-2 text-[12px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
          onClick={() => setSide("ours")}
        >
          <Icon name="reset" size="small" />
          {language.t("shell.git.conflict.ours")}
        </button>
        <button
          type="button"
          class="flex h-7 items-center gap-1.5 rounded-sm border-[0.5px] border-v2-border-border-muted px-2 text-[12px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
          onClick={() => setSide("theirs")}
        >
          <Icon name="outline-share" size="small" />
          {language.t("shell.git.conflict.theirs")}
        </button>
        <button
          type="button"
          class="flex h-7 items-center gap-1.5 rounded-sm bg-[#6366F1] px-2 text-[12px] font-[440] text-[#ffffff] hover:opacity-90 focus-visible:outline-none"
          onClick={() => void save()}
        >
          {language.t("shell.git.conflict.save")}
        </button>
      </div>
      <Show
        when={sides()}
        fallback={
          <div class="flex flex-1 items-center justify-center gap-2 text-[12px] text-v2-text-text-muted">
            <Spinner />
            {language.t("common.loading")}
          </div>
        }
      >
        <div ref={(el) => (host = el)} class="min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-mergeView]:h-full" />
      </Show>
    </div>
  )
}
