import { createStore } from 'zustand'

// Mirror of AuthUser — only the fields the UI needs for role-checks.
// Full session validation always happens server-side; never trust this for auth.
interface ClientUser {
  id: string
  email: string
  name?: string
  role: 'admin' | 'member' | 'viewer'
}

interface UIState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  session: { user: ClientUser } | null
  setSession: (session: { user: ClientUser } | null) => void
}

export type UIStore = ReturnType<typeof createUIStore>

export const createUIStore = () =>
  createStore<UIState>()((set) => ({
    sidebarOpen: false,
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    session: null,
    setSession: (session) => set({ session }),
  }))
