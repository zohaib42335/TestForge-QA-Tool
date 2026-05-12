import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { ensureFirestoreOfflinePersistence } from './firebase/config.js'
import { capturePendingInviteFromUrl } from './utils/pendingInviteStorage.js'

capturePendingInviteFromUrl()

ensureFirestoreOfflinePersistence().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
