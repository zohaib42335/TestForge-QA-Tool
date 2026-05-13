/**
 * App — router, auth, project context, and global providers.
 */

import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { ProjectProvider } from './contexts/ProjectContext'
import { ToastProvider } from './components/Toast.jsx'
import { UserSetupRunner } from './routes/UserSetupRunner.jsx'
import { AppRoutes } from './routes/AppRoutes.jsx'

/** @param {{ children: import('react').ReactNode }} props */
export function AppProviders({ children }) {
  return (
    <AuthProvider>
      <ProjectProvider>
        <UserSetupRunner />
        <ToastProvider>{children}</ToastProvider>
      </ProjectProvider>
    </AuthProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  )
}
