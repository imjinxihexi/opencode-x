type ModelRef = { providerID: string; modelID: string }

type SessionClient = {
  session: {
    create: (parameters: {
      directory?: string
      model?: { id: string; providerID: string }
    }) => Promise<unknown>
    promptAsync: (parameters: {
      sessionID: string
      directory?: string
      model?: ModelRef
      system?: string
      tools?: Record<string, boolean>
      parts: Array<{ type: string; text: string }>
    }) => Promise<unknown>
    messages: (parameters: { sessionID: string; directory?: string }) => Promise<unknown>
    delete: (parameters: { sessionID: string; directory?: string }) => Promise<unknown>
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function errorDetail(error: unknown): string {
  const item = error as { body?: unknown; detail?: unknown; message?: string }
  const body = item?.body ?? item?.detail
  if (typeof body === "string" && body.trim()) return body
  if (body !== undefined && body !== null) {
    try {
      return JSON.stringify(body)
    } catch {
      /* ignore */
    }
  }
  return item?.message ?? "Request failed"
}

export type ResolvedModel = { model: ModelRef; directory?: string }

export async function resolveCurrentModel(input: {
  client: { session: { get: (parameters: { sessionID: string; directory?: string }) => Promise<unknown> } }
  candidates: Array<(ModelRef & { directory?: string }) | undefined>
  sessions?: Array<{ sessionID: string; directory?: string }>
}): Promise<ResolvedModel | undefined> {
  for (const candidate of input.candidates) {
    if (candidate?.providerID && candidate?.modelID) return { model: candidate, directory: candidate.directory }
  }
  for (const session of input.sessions ?? []) {
    const info = (
      await input.client.session
        .get({ sessionID: session.sessionID, directory: session.directory })
        .catch(() => undefined)
    ) as unknown as
      | { data?: { model?: { id?: string; providerID?: string } }; model?: { id?: string; providerID?: string } }
      | undefined
    const model = info?.data?.model ?? info?.model
    if (model?.id && model.providerID) {
      return { model: { providerID: model.providerID, modelID: model.id }, directory: session.directory }
    }
  }
  return undefined
}

type MessageEntry = {
  info?: { role?: string; error?: { name?: string; message?: string; data?: { message?: string } } }
  parts?: Array<{ type?: string; text?: string }>
}

function extractText(res: unknown): string {
  const list =
    Array.isArray(res) ? (res as MessageEntry[]) : ((res as { data?: MessageEntry[] })?.data ?? [])
  return list
    .filter((entry) => entry?.info?.role === "assistant")
    .flatMap((entry) => entry.parts ?? [])
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text!)
    .join("\n")
    .trim()
}

export async function aiGenerateText(input: {
  client: SessionClient
  createSession?: (directory?: string) => Promise<string | undefined>
  directory?: string
  model: ModelRef
  system: string
  text: string
  timeoutMs?: number
}): Promise<string> {
  let sessionID: string | undefined
  if (input.createSession) {
    sessionID = await input.createSession(input.directory)
  } else {
    const created = (await input.client.session
      .create({
        directory: input.directory,
        model: { id: input.model.modelID, providerID: input.model.providerID },
      })
      .catch((error: unknown) => {
        throw new Error(errorDetail(error))
      })) as unknown as { data?: { id?: string }; id?: string }
    sessionID = created?.data?.id ?? created?.id
  }
  if (!sessionID) throw new Error("Failed to create session")

  try {
    await input.client.session
      .promptAsync({
        sessionID,
        directory: input.directory,
        model: input.model,
        system: input.system,
        tools: {},
        parts: [{ type: "text", text: input.text }],
      })
      .catch((error: unknown) => {
        throw new Error(errorDetail(error))
      })

    const deadline = Date.now() + (input.timeoutMs ?? 120000)
    let message = ""
    let stable = 0
    while (Date.now() < deadline) {
      await sleep(600)
      const res = await input.client.session.messages({ sessionID, directory: input.directory })
      const list: MessageEntry[] = Array.isArray(res) ? res : ((res as { data?: MessageEntry[] })?.data ?? [])
      const failed = list.find((entry) => entry?.info?.role === "assistant" && entry.info.error)
      if (failed?.info?.error) {
        const error = failed.info.error
        throw new Error(error.data?.message ?? error.message ?? error.name ?? "Model request failed")
      }
      const content = extractText(list)
      if (content) {
        stable = content === message ? stable + 1 : 0
        message = content
        if (stable >= 2) break
      }
    }
    if (!message) throw new Error("The model returned no text")
    return message
  } finally {
    await input.client.session.delete({ sessionID, directory: input.directory }).catch(() => {})
  }
}
