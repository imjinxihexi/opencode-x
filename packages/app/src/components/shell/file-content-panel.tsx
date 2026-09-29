import { Show, createResource, createSignal } from "solid-js"
import { Dynamic } from "solid-js/web"
import { getFilename } from "@opencode-ai/core/util/path"
import { useFileComponent } from "@opencode-ai/ui/context/file"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Spinner } from "@/components/shell/spinner"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"

export type FileContentTarget = { directory: string; file: string }

// Right-hand column showing a repository file with syntax highlighting,
// opened from the git panel's file tree (same slot as the diff panel).
export function FileContentPanel(props: {
  target: FileContentTarget
  width: number
  minWidth: number
  maxWidth: number
  refresh?: number
  onResize: (width: number) => void
  onClose: () => void
}) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const fileComponent = useFileComponent()
  const [content] = createResource(
    () => [props.target.directory, props.target.file, props.refresh] as const,
    async ([directory, file]) => {
      const result = await sdk()
        .client.file.read({ path: file, directory })
        .catch(() => undefined)
      const data = result?.data
      if (!data || data.type === "binary") return ""
      return data.content
    },
  )

  const [copied, setCopied] = createSignal<"content" | "path">()
  const copy = async (kind: "content" | "path", value: string) => {
    await navigator.clipboard?.writeText(value)
    setCopied(kind)
    setTimeout(() => setCopied((current) => (current === kind ? undefined : current)), 1500)
  }

  return (
    <aside
      class="relative h-full shrink-0 flex flex-col border-l-[0.5px] border-v2-border-border-base bg-v2-background-bg-base"
      style={{ width: `${props.width}px` }}
    >
      <div class="flex h-10 shrink-0 items-center gap-2 border-b-[0.5px] border-v2-border-border-muted px-3">
        <Icon name="outline-file" size="small" class="shrink-0 text-v2-icon-icon-muted" />
        <span
          class="min-w-0 flex-1 truncate font-mono text-[12px] text-v2-text-text-base"
          title={props.target.file}
        >
          {getFilename(props.target.file)}
        </span>
        <button
          type="button"
          class="flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-[11px] focus-visible:outline-none"
          classList={{
            "text-[#3fb950]": copied() === "content",
            "text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base":
              copied() !== "content",
          }}
          title={language.t("shell.file.copyContent")}
          onClick={() => void copy("content", content() ?? "")}
        >
          <Icon name={copied() === "content" ? "check" : "outline-copy"} size="small" />
          {language.t("shell.file.copyContent")}
        </button>
        <button
          type="button"
          class="flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-[11px] focus-visible:outline-none"
          classList={{
            "text-[#3fb950]": copied() === "path",
            "text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base":
              copied() !== "path",
          }}
          title={language.t("shell.file.copyPath")}
          onClick={() => void copy("path", `${props.target.directory}/${props.target.file}`)}
        >
          <Icon name={copied() === "path" ? "check" : "outline-copy"} size="small" />
          {language.t("shell.file.copyPath")}
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
      <div class="min-h-0 flex-1 overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-v2-border-border-muted [&::-webkit-scrollbar-track]:bg-transparent">
        <Show when={!content.loading} fallback={<div class="flex justify-center py-8"><Spinner /></div>}>
          <Show
            when={content()}
            fallback={
              <div class="py-8 text-center text-[12px] text-v2-text-text-muted">{language.t("common.empty")}</div>
            }
          >
            <Dynamic
              component={fileComponent}
              mode="text"
              file={{
                name: props.target.file,
                contents: content(),
                cacheKey: `${props.target.file}:${props.refresh ?? 0}`,
              }}
            />
          </Show>
        </Show>
      </div>
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
