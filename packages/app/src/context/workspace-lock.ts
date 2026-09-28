import { createContext, useContext, type Accessor } from "solid-js"

// True inside a window dedicated to a single workspace (entered from the
// workspace grid); such windows fix the session context, so project/worktree
// pickers are hidden.
const WorkspaceLockContext = createContext<Accessor<boolean>>(() => false)

export const WorkspaceLockProvider = WorkspaceLockContext.Provider

export const useWorkspaceLock = () => useContext(WorkspaceLockContext)
