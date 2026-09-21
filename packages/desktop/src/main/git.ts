import { execFile, spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
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

export async function checkout(cwd: string, branch: string) {
  await run(cwd, ["checkout", branch])
}

export async function createBranch(cwd: string, name: string, startPoint?: string) {
  await run(cwd, startPoint ? ["checkout", "-b", name, startPoint] : ["checkout", "-b", name])
}

export async function fetchRemote(cwd: string) {
  return run(cwd, ["fetch", "--prune"])
}

export async function pull(cwd: string) {
  return run(cwd, ["pull"])
}

export async function stash(cwd: string) {
  await run(cwd, ["stash", "push", "-u"])
}

export async function deleteBranch(cwd: string, name: string) {
  await run(cwd, ["branch", "-D", name])
}

export async function commit(cwd: string, message: string) {
  return run(cwd, ["commit", "-m", message])
}

export async function undoCommit(cwd: string) {
  await run(cwd, ["reset", "--soft", "HEAD~1"])
}

export async function push(cwd: string) {
  try {
    return await run(cwd, ["push"])
  } catch {
    const branch = await run(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
    const remote = await primaryRemote(cwd)
    if (!branch || !remote) throw new Error("No upstream branch and no remote to push to")
    return run(cwd, ["push", "-u", remote, branch])
  }
}

export async function discard(cwd: string) {
  await run(cwd, ["checkout", "--", "."])
  await run(cwd, ["clean", "-fd"])
}

export async function merge(cwd: string, branch: string) {
  return run(cwd, ["merge", branch])
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

export async function log(cwd: string, limit = 20): Promise<GitCommit[]> {
  const output = await run(cwd, ["log", `-n${limit}`, "--pretty=format:%h%x1f%an%x1f%ar%x1f%s"])
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
  const output = await runRaw(cwd, ["status", "--porcelain=v1", "--untracked-files=all", "-z", "--", "."])
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

export async function clone(url: string, workspace: string, name: string, branch?: string) {
  const dest = workspaceRoot(workspace, name)
  await mkdir(join(homedir(), "opencode-workspaces", workspace.replace(/[^a-zA-Z0-9._-]/g, "-")), {
    recursive: true,
  })
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
