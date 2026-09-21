import { For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/v2/icon"
import { Spinner } from "@/components/shell/spinner"
import { gitActions, type GitFileStatus } from "@/components/shell/git-actions"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"

type Tone = "add" | "del" | "mod"
type StageItem = { file: string; letter: string; tone: Tone }
type Selection = { file: string; staged: boolean }
type TreeDir = { name: string; path: string; dirs: Map<string, TreeDir>; files: StageItem[] }

function toneOf(code: string): Tone {
  if (code === "?" || code === "A") return "add"
  if (code === "D") return "del"
  return "mod"
}

function toItems(list: GitFileStatus[], side: "index" | "worktree"): StageItem[] {
  return list
    .filter((entry) => (side === "index" ? entry.index !== " " && entry.index !== "?" : entry.worktree !== " " || entry.untracked))
    .map((entry) => {
      const code = side === "index" ? entry.index : entry.untracked ? "?" : entry.worktree
      return { file: entry.file, letter: entry.untracked ? "A" : code, tone: toneOf(code) }
    })
    .toSorted((a, b) => a.file.localeCompare(b.file))
}

function buildTree(items: StageItem[]): TreeDir {
  const root: TreeDir = { name: "", path: "", dirs: new Map(), files: [] }
  for (const item of items) {
    const parts = item.file.split("/")
    let node = root
    for (let index = 0; index < parts.length - 1; index++) {
      const name = parts[index]!
      let next = node.dirs.get(name)
      if (!next) {
        next = { name, path: node.path ? `${node.path}/${name}` : name, dirs: new Map(), files: [] }
        node.dirs.set(name, next)
      }
      node = next
    }
    node.files.push(item)
  }
  return root
}

function toneColor(tone: Tone) {
  return tone === "add" ? "bg-[#3fb950]" : tone === "del" ? "bg-[#f85149]" : "bg-[#d29922]"
}

export function splitHunks(patch: string) {
  const lines = patch.split("\n")
  const header: string[] = []
  const hunks: string[][] = []
  let current: string[] | null = null
  for (const line of lines) {
    if (line.startsWith("@@")) {
      if (current) hunks.push(current)
      current = [line]
    } else if (current) {
      current.push(line)
    } else {
      header.push(line)
    }
  }
  if (current) hunks.push(current)
  return { header, hunks }
}

export type UnifiedRow = { left?: number; right?: number; text: string; kind: "ctx" | "add" | "del" }
export type SplitRow = { left?: UnifiedRow; right?: UnifiedRow }

export function parseHunkHeader(line: string) {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line ?? "")
  return { left: match ? Number(match[1]) : 1, right: match ? Number(match[2]) : 1 }
}

export function toUnified(hunk: string[]): UnifiedRow[] {
  const { left, right } = parseHunkHeader(hunk[0] ?? "")
  let l = left
  let r = right
  const rows: UnifiedRow[] = []
  for (const text of hunk.slice(1)) {
    if (text.startsWith("+")) rows.push({ right: r++, text, kind: "add" })
    else if (text.startsWith("-")) rows.push({ left: l++, text, kind: "del" })
    else rows.push({ left: l++, right: r++, text, kind: "ctx" })
  }
  return rows
}

export function toSplit(hunk: string[]): SplitRow[] {
  const { left, right } = parseHunkHeader(hunk[0] ?? "")
  let l = left
  let r = right
  const rows: SplitRow[] = []
  let dels: UnifiedRow[] = []
  let adds: UnifiedRow[] = []
  const flush = () => {
    const count = Math.max(dels.length, adds.length)
    for (let index = 0; index < count; index++) rows.push({ left: dels[index], right: adds[index] })
    dels = []
    adds = []
  }
  for (const text of hunk.slice(1)) {
    if (text.startsWith("+")) {
      adds.push({ right: r++, text: text.slice(1), kind: "add" })
      continue
    }
    if (text.startsWith("-")) {
      dels.push({ left: l++, text: text.slice(1), kind: "del" })
      continue
    }
    flush()
    rows.push({
      left: { left: l++, text: text.slice(1), kind: "ctx" },
      right: { right: r++, text: text.slice(1), kind: "ctx" },
    })
  }
  flush()
  return rows
}

export function rowClass(kind: UnifiedRow["kind"]) {
  if (kind === "add") return "text-[#3fb950] bg-[#3fb9501a]"
  if (kind === "del") return "text-[#f85149] bg-[#f851491a]"
  return "text-v2-text-text-base"
}

export function StagingChanges(props: {
  directory?: string
  refresh?: number
  revision: number
  onCount?: (count: number) => void
  onTotal?: (count: number) => void
  conflicts: string[]
  activeFile?: string
  onOpenDiff?: (target: { directory: string; file: string; staged: boolean }) => void
}) {
  const language = useLanguage()
  const [busy, setBusy] = createSignal(false)
  const [pending, setPending] = createSignal<string>()
  const [rev, setRev] = createSignal(0)
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({})

  const isCollapsed = (path: string) => Boolean(collapsed()[path])
  const toggleDir = (path: string) => setCollapsed((prev) => ({ ...prev, [path]: !prev[path] }))

  const [status] = createResource(
    () => [props.directory, props.refresh, props.revision, rev()] as const,
    async ([directory]) => (directory ? gitActions.status(directory).catch(() => [] as GitFileStatus[]) : []),
  )

  const staged = createMemo(() => toItems(status() ?? [], "index"))
  const unstaged = createMemo(() => toItems(status() ?? [], "worktree"))

  createEffect(() => props.onCount?.(staged().length))
  createEffect(() => props.onTotal?.(staged().length + unstaged().length))

  const act = async (key: string, run: () => Promise<unknown>) => {
    setPending(key)
    setBusy(true)
    try {
      await run()
      setRev((value) => value + 1)
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("shell.git.actionFailed"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
      setPending(undefined)
    }
  }

  const toggleFile = (item: StageItem, isStaged: boolean) => {
    const directory = props.directory
    if (!directory) return
    void act("file", () =>
      isStaged ? gitActions.unstageFile(directory, item.file) : gitActions.stageFile(directory, item.file),
    )
  }

  const openDiff = (item: StageItem, isStaged: boolean) => {
    const directory = props.directory
    if (!directory) return
    props.onOpenDiff?.({ directory, file: item.file, staged: isStaged })
  }

  return (
    <div class="flex max-h-[40vh] flex-col gap-2 overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-v2-border-border-muted [&::-webkit-scrollbar-track]:bg-transparent">
      <Show when={staged().length > 0}>
        <div class="flex flex-col">
          <div class="flex items-center gap-1 px-1">
            <span class="flex-1 text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
              {language.t("shell.git.staged")} · {staged().length}
            </span>
            <button
              type="button"
              class="flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none disabled:opacity-40"
              disabled={busy() || !props.directory}
              onClick={() =>
                void act("unstageAll", () =>
                  gitActions.unstageAll(props.directory!, staged().map((item) => item.file)),
                )
              }
            >
              <Show when={pending() === "unstageAll"}>
                <Spinner />
              </Show>
              {language.t("shell.git.unstageAll")}
            </button>
          </div>
          <FileTree
            items={staged()}
            actionLabel={language.t("shell.git.unstage")}
            busy={busy()}
            selected={props.activeFile ? { file: props.activeFile, staged: true } : undefined}
            staged={true}
            onSelect={(item) => openDiff(item, true)}
            onAction={(item) => toggleFile(item, true)}
            isCollapsed={isCollapsed}
            toggleDir={toggleDir}
            conflicts={props.conflicts}
          />
        </div>
      </Show>

      <Show when={unstaged().length > 0}>
        <div class="flex flex-col">
          <div class="flex items-center gap-1 px-1">
            <span class="flex-1 text-[11px] font-[530] uppercase leading-4 tracking-[0.05px] text-v2-text-text-muted">
              {language.t("shell.git.unstaged")} · {unstaged().length}
            </span>
            <button
              type="button"
              class="flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none disabled:opacity-40"
              disabled={busy() || !props.directory}
              onClick={() =>
                void act("stageAll", () => gitActions.stageAll(props.directory!, unstaged().map((item) => item.file)))
              }
            >
              <Show when={pending() === "stageAll"}>
                <Spinner />
              </Show>
              {language.t("shell.git.stageAll")}
            </button>
          </div>
          <FileTree
            items={unstaged()}
            actionLabel={language.t("shell.git.stage")}
            busy={busy()}
            selected={props.activeFile ? { file: props.activeFile, staged: false } : undefined}
            staged={false}
            onSelect={(item) => openDiff(item, false)}
            onAction={(item) => toggleFile(item, false)}
            isCollapsed={isCollapsed}
            toggleDir={toggleDir}
            conflicts={props.conflicts}
          />
        </div>
      </Show>

      <Show when={unstaged().length === 0 && staged().length === 0}>
        <div class="px-1 py-6 text-center text-[12px] leading-5 text-v2-text-text-muted">
          {language.t("shell.git.noChanges")}
        </div>
      </Show>
    </div>
  )
}

function FileTree(props: {
  items: StageItem[]
  actionLabel: string
  busy: boolean
  selected?: Selection
  staged: boolean
  onSelect: (item: StageItem) => void
  onAction: (item: StageItem) => void
  isCollapsed: (path: string) => boolean
  toggleDir: (path: string) => void
  conflicts: string[]
}) {
  const tree = createMemo(() => buildTree(props.items))
  return <FileDir {...props} node={tree()} depth={0} />
}

function FileDir(props: {
  node: TreeDir
  depth: number
  items: StageItem[]
  actionLabel: string
  busy: boolean
  selected?: Selection
  staged: boolean
  onSelect: (item: StageItem) => void
  onAction: (item: StageItem) => void
  isCollapsed: (path: string) => boolean
  toggleDir: (path: string) => void
  conflicts: string[]
}) {
  const dirs = createMemo(() => [...props.node.dirs.values()].toSorted((a, b) => a.name.localeCompare(b.name)))
  const active = (file: string) => props.selected?.file === file && props.selected?.staged === props.staged
  return (
    <>
      <For each={dirs()}>
        {(dir) => (
          <DirNode
            dir={dir}
            depth={props.depth}
            actionLabel={props.actionLabel}
            busy={props.busy}
            selected={props.selected}
            staged={props.staged}
            onSelect={props.onSelect}
            onAction={props.onAction}
            isCollapsed={props.isCollapsed}
            toggleDir={props.toggleDir}
            conflicts={props.conflicts}
          />
        )}
      </For>
      <For each={props.node.files}>
        {(item) => (
          <div
            class="group flex min-w-0 cursor-pointer items-center gap-2 rounded-sm py-[3px] pe-1.5 hover:bg-v2-overlay-simple-overlay-hover"
            classList={{ "bg-v2-overlay-simple-overlay-pressed": active(item.file) }}
            style={{ "padding-inline-start": `${props.depth * 12 + 6}px` }}
            title={item.file}
            onClick={() => props.onSelect(item)}
          >
            <Show
              when={props.conflicts.includes(item.file)}
              fallback={<span class={`size-1.5 shrink-0 rounded-full ${toneColor(item.tone)}`} />}
            >
              <Icon name="warning" size="small" class="shrink-0 text-[#d29922]" />
            </Show>
            <span class="min-w-0 flex-1 truncate text-[12px] leading-5 text-v2-text-text-base">
              {item.file.split("/").pop()}
            </span>
            <span class="shrink-0 font-mono text-[11px] text-v2-text-text-muted">{item.letter}</span>
            <button
              type="button"
              class="shrink-0 rounded-sm px-1 py-0.5 text-[11px] text-v2-text-text-muted opacity-0 transition-opacity hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:opacity-100 group-hover:opacity-100"
              disabled={props.busy}
              onClick={(event) => {
                event.stopPropagation()
                props.onAction(item)
              }}
            >
              {props.actionLabel}
            </button>
          </div>
        )}
      </For>
    </>
  )
}

function DirNode(props: {
  dir: TreeDir
  depth: number
  actionLabel: string
  busy: boolean
  selected?: Selection
  staged: boolean
  onSelect: (item: StageItem) => void
  onAction: (item: StageItem) => void
  isCollapsed: (path: string) => boolean
  toggleDir: (path: string) => void
  conflicts: string[]
}) {
  const open = () => !props.isCollapsed(props.dir.path)
  return (
    <>
      <div
        class="flex min-w-0 cursor-pointer items-center gap-1 rounded-sm py-[3px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover"
        style={{ "padding-inline-start": `${props.depth * 12 + 6}px` }}
        onClick={() => props.toggleDir(props.dir.path)}
      >
        <Icon
          name="outline-chevron-down"
          size="small"
          class={`shrink-0 transition-transform ${open() ? "" : "-rotate-90"}`}
        />
        <Icon name="folder" size="small" class="shrink-0" />
        <span class="min-w-0 truncate text-[12px] leading-5">{props.dir.name}</span>
      </div>
      <Show when={open()}>
        <FileDir
          node={props.dir}
          depth={props.depth + 1}
          items={[]}
          actionLabel={props.actionLabel}
          busy={props.busy}
          selected={props.selected}
          staged={props.staged}
          onSelect={props.onSelect}
          onAction={props.onAction}
          isCollapsed={props.isCollapsed}
          toggleDir={props.toggleDir}
          conflicts={props.conflicts}
        />
      </Show>
    </>
  )
}
