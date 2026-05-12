/**
 * @fileoverview Global context for the AI Test Case Generator modal.
 * Provides isOpen, openModal(), closeModal(), and projectId to any descendant.
 * Renders <AIGeneratorModal> once at the provider root so it is available
 * regardless of which component triggers it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import AIGeneratorModal from '../components/modals/AIGeneratorModal.jsx'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} AIGeneratorContextValue
 * @property {boolean}  isOpen
 * @property {()=>void} openModal
 * @property {()=>void} closeModal
 * @property {string}   projectId
 */

/** @type {import('react').Context<AIGeneratorContextValue|null>} */
export const AIGeneratorContext = createContext(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * @param {{ children: import('react').ReactNode, projectId?: string }} props
 */
export function AIGeneratorProvider({ children, projectId = 'workspace-default' }) {
  const [isOpen, setIsOpen] = useState(false)

  const openModal  = useCallback(() => setIsOpen(true),  [])
  const closeModal = useCallback(() => setIsOpen(false), [])

  const value = useMemo(
    () => ({ isOpen, openModal, closeModal, projectId }),
    [isOpen, openModal, closeModal, projectId],
  )

  return (
    <AIGeneratorContext.Provider value={value}>
      {children}
      <AIGeneratorModal
        isOpen={isOpen}
        onClose={closeModal}
        projectId={projectId}
      />
    </AIGeneratorContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Returns the AI Generator context value.
 * Throws if used outside <AIGeneratorProvider>.
 * @returns {AIGeneratorContextValue}
 */
export function useAIGeneratorContext() {
  const ctx = useContext(AIGeneratorContext)
  if (!ctx) {
    throw new Error('useAIGeneratorContext must be used within AIGeneratorProvider')
  }
  return ctx
}
