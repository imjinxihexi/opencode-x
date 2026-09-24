import { execFile, spawn } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, isAbsolute } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export type GitBranch = { name: string; current: boolean }
export type GitCommit = { hash: string; author: string; when: string; subject: string }
export type GitFileStatus = { file: string; index: string; worktree: string; untracked: boolean }

async function run(cwd: string, args: string[]) {
  const result = await execFileAsync("git", args, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 })
  return result.stdout.trim()
}

async function runStdin(cwd: string, args: string[], input: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("git", args, { cwd, windowsHide: true })
    let out = ""
    let err = ""
    child.stdout.on("data", (chunk) => (out += chunk))
    child.stderr.on("data", (chunk) => (err += chunk))
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(err.trim() || `git exited with code ${code}`))
    })
    child.stdin.write(input)
    child.stdin.end()
  })
}

async function patch(cwd: string, args: string[]) {
  return execFileAsync("git", args, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }).then(
    (result) => result.stdout,
    () => "",
  )
}

async function primaryRemote(cwd: string) {
  const remotes = (await run(cwd, ["remote"]))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  if (remotes.includes("origin")) return "origin"
  return remotes[0]
}

export async function branches(cwd: string): Promise<GitBranch[]> {
  const output = await run(cwd, ["branch", "--format=%(HEAD)%(refname:short)"])
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      current: line.startsWith("*"),
      name: line.replace(/^\*\s*/, "").trim(),
    }))
}

export async function remoteBranches(cwd: string): Promise<string[]> {
  const output = await run(cwd, ["branch", "-r", "--format=%(refname:short)"])
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((name) => !name.endsWith("/HEAD"))
}

export async function lsRemoteBranches(url: string): Promise<string[]> {
  const result = await execFileAsync("git", ["ls-remote", "--symref", "--heads", url], {
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 20000,
  })
  let defaultBranch: string | undefined
  const branches: string[] = []
  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const separator = trimmed.indexOf("\t")
    const ref = (separator === -1 ? trimmed : trimmed.slice(0, separator)).trim()
    const name = separator === -1 ? "" : trimmed.slice(separator + 1).trim()
    if (!name) continue
    if (ref.startsWith("ref: refs/heads/")) {
      defaultBranch = ref.slice("ref: refs/heads/".length)
      continue
    }
    if (name.startsWith("refs/heads/")) branches.push(name.slice("refs/heads/".length))
  }
  const sorted = defaultBranch
    ? [defaultBranch, ...branches.filter((branch) => branch !== defaultBranch)]
    : branches
  return [...new Set(sorted)]
}

export async function checkout(cwd: string, branch: string) {
  await run(cwd, ["checkout", branch])
}

export async function switchBranch(cwd: string, branch: string) {
  await run(cwd, ["checkout", branch])
  try {
    await run(cwd, ["pull", "--ff-only"])
  } catch {
    // no upstream, detached, or not fast-forwardable: keep local branch as-is
  }
}

export async function createBranch(cwd: string, name: string, startPoint?: string) {
  await run(cwd, startPoint ? ["checkout", "-b", name, startPoint] : ["checkout", "-b", name])
}

export async function fetchRemote(cwd: string) {
  return run(cwd, ["fetch", "--prune"])
}

export async function pull(cwd: string) {
  try {
    const output = await run(cwd, ["pull"])
    return { conflicted: false, output }
  } catch (error) {
    const conflictedFiles = await conflicts(cwd).catch(() => [] as string[])
    if (conflictedFiles.length > 0) return { conflicted: true, output: "" }
    throw error
  }
}

export async function stash(cwd: string) {
  await run(cwd, ["stash", "push", "-u"])
}

export async function stashList(cwd: string): Promise<{ ref: string; message: string }[]> {
  const output = await run(cwd, ["stash", "list", "--format=%gd%x1f%gs"]).catch(() => "")
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref, message] = line.split("\x1f")
      return { ref: ref ?? "", message: message ?? "" }
    })
}

export async function stashApply(cwd: string, ref: string) {
  await run(cwd, ["stash", "apply", ref])
}

export async function stashPop(cwd: string, ref: string) {
  await run(cwd, ["stash", "pop", ref])
}

export async function stashDrop(cwd: string, ref: string) {
  await run(cwd, ["stash", "drop", ref])
}

export async function deleteBranch(cwd: string, name: string, force?: boolean) {
  await run(cwd, ["branch", force ? "-D" : "-d", name])
}

export async function commit(cwd: string, message: string) {
  return run(cwd, ["commit", "-m", message])
}

export async function undoCommit(cwd: string) {
  await run(cwd, ["reset", "--soft", "HEAD~1"])
}

export async function undoCommitInfo(cwd: string) {
  const root = await run(cwd, ["rev-parse", "--verify", "--quiet", "HEAD~1"]).then(
    () => false,
    () => true,
  )
  const pushed = await run(cwd, ["branch", "-r", "--contains", "HEAD"]).then(
    (output) => output.trim().length > 0,
    () => false,
  )
  return { root, pushed }
}

export async function push(cwd: string) {
  const upstream = await run(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).catch(() => "")
  if (upstream) return run(cwd, ["push"])
  const branch = await run(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "")
  const remote = await primaryRemote(cwd).catch(() => undefined)
  if (!branch || branch === "HEAD" || !remote) throw new Error("No upstream branch and no remote to push to")
  return run(cwd, ["push", "-u", remote, branch])
}

export async function pushForce(cwd: string) {
  return run(cwd, ["push", "--force-with-lease"])
}

export async function discard(cwd: string) {
  await run(cwd, ["checkout", "--", "."])
  await run(cwd, ["clean", "-fd"])
}

export async function merge(cwd: string, branch: string) {
  return execFileAsync("git", ["merge", branch], { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }).then(
    () => ({ conflicted: false }),
    (error: { code?: number }) => {
      if (error?.code === 1) return { conflicted: true }
      throw error
    },
  )
}

export async function mergePreview(cwd: string, source: string, target: string) {
  const countOut = await run(cwd, ["rev-list", "--count", `${target}..${source}`]).catch(() => "0")
  const commits = Number.parseInt(countOut || "0", 10) || 0
  const conflicts = await execFileAsync("git", ["merge-tree", "--write-tree", target, source], {
    cwd,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  }).then(
    () => false,
    (error: { code?: number }) => error?.code === 1,
  )
  return { commits, conflicts }
}

export async function currentBranch(cwd: string) {
  return run(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "")
}

export async function hasTrackedChanges(cwd: string) {
  const output = await run(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]).catch(() => "")
  return output.trim().length > 0
}

export async function conflicts(cwd: string) {
  const output = await run(cwd, ["diff", "--name-only", "--diff-filter=U"])
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export async function resolveConflict(cwd: string, file: string, side: "ours" | "theirs") {
  await run(cwd, ["checkout", side === "ours" ? "--ours" : "--theirs", "--", file])
  await run(cwd, ["add", "--", file])
}

export async function conflictSides(cwd: string, file: string) {
  const stage = async (n: number) => run(cwd, ["show", `:${n}:${file}`]).catch(() => "")
  const [base, ours, theirs] = await Promise.all([stage(1), stage(2), stage(3)])
  return { base, ours, theirs }
}

export async function writeResolved(cwd: string, file: string, content: string) {
  await writeFile(join(cwd, file), content, "utf8")
  await run(cwd, ["add", "--", file])
}

export async function mergeAbort(cwd: string) {
  await run(cwd, ["merge", "--abort"])
}

export async function log(cwd: string, limit = 20, skip = 0): Promise<GitCommit[]> {
  const output = await run(cwd, ["log", `--skip=${skip}`, `-n${limit}`, "--pretty=format:%h%x1f%an%x1f%ar%x1f%s"])
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, author, when, subject] = line.split("\x1f")
      return { hash: hash ?? "", author: author ?? "", when: when ?? "", subject: subject ?? "" }
    })
}

export async function fileDiff(cwd: string, file: string) {
  const tracked = await execFileAsync(
    "git",
    ["diff", "--patch", "--no-ext-diff", "--no-renames", "--unified=3", "--", file],
    { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
  ).then(
    (result) => result.stdout,
    () => "",
  )
  if (tracked.trim()) return tracked

  return execFileAsync(
    "git",
    ["diff", "--no-index", "--patch", "--no-ext-diff", "--no-renames", "--unified=3", "--", "/dev/null", file],
    { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
  ).then(
    (result) => result.stdout,
    (error: { stdout?: string }) => error.stdout ?? "",
  )
}

async function runRaw(cwd: string, args: string[]) {
  return execFileAsync("git", args, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }).then(
    (result) => result.stdout,
    (error: { stdout?: string }) => error.stdout ?? "",
  )
}

export async function statusRaw(cwd: string): Promise<GitFileStatus[]> {
  const output = await runRaw(cwd, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--no-renames",
    "-z",
    "--",
    ".",
  ])
  return output
    .split("\0")
    .filter(Boolean)
    .map((item) => {
      const index = item[0] ?? " "
      const worktree = item[1] ?? " "
      return { file: item.slice(3), index, worktree, untracked: index === "?" }
    })
}

export async function stageFile(cwd: string, file: string) {
  await run(cwd, ["add", "--", file])
}

export async function stageAll(cwd: string) {
  await run(cwd, ["add", "-A"])
}

export async function unstageAll(cwd: string) {
  try {
    await run(cwd, ["reset", "--quiet"])
  } catch {
    await run(cwd, ["rm", "--cached", "-r", "--quiet", "."])
  }
}

export async function unstageFile(cwd: string, file: string) {
  await run(cwd, ["restore", "--staged", "--", file])
}

export function workspaceRoot(workspace: string, name: string) {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "") || "repo"
  return join(homedir(), "opencode-workspaces", safe(workspace), safe(name))
}

export function safeFolderName(value: string) {
  let out = value.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-")
  out = out.replace(/-{2,}/g, "-").replace(/^[.\-]+/, "").replace(/[.\- ]+$/, "")
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(out)) out = `ws-${out}`
  if (out.length > 64) out = out.slice(0, 64).replace(/[.\- ]+$/, "")
  return out || "workspace"
}

function workspaceBase(root?: string, folder?: string) {
  if (folder) {
    const safe = safeFolderName(folder)
    return root ? join(root, safe) : join(homedir(), "opencode-workspaces", safe)
  }
  if (root) return root
  return join(homedir(), "opencode-workspaces", workspace.replace(/[^a-zA-Z0-9._-]/g, "-") || "workspace")
}

export async function createWorkspaceDir(root: string | undefined, folder: string, meta?: unknown) {
  const target = workspaceBase(root, folder || undefined)
  if (root && !isAbsolute(root)) throw new Error(`Storage location must be an absolute path: ${root}`)
  await mkdir(target, { recursive: true })
  if (meta !== undefined) {
    await writeFile(join(target, "workspace.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8")
  }
  return target
}

export async function readWorkspaceMeta(path: string) {
  const raw = await readFile(join(path, "workspace.json"), "utf8").catch(() => undefined)
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return undefined
  }
}

export async function clone(url: string, workspace: string, name: string, branch?: string, root?: string, folder?: string) {
  const parent = workspaceBase(root, folder)
  await mkdir(parent, { recursive: true })
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "") || "repo"
  const dest = join(parent, safe(name))
  const args = ["clone"]
  if (branch) args.push("--branch", branch)
  args.push(url, dest)
  await execFileAsync("git", args, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 })
  return dest
}

export async function stagedFileDiff(cwd: string, file: string) {
  return patch(cwd, ["diff", "--cached", "--patch", "--no-ext-diff", "--no-renames", "--unified=3", "--", file])
}

export async function applyCached(cwd: string, text: string, reverse: boolean) {
  await runStdin(cwd, reverse ? ["apply", "--cached", "--reverse", "-"] : ["apply", "--cached", "-"], text)
}
