/**
 * @fileoverview TestRuns — main controller component.
 * Switches between RunsList and ExecutionMode based on whether a run is being executed.
 */

import { useState } from 'react'
import ExecutionMode from './ExecutionMode.jsx'
import RunsList from './RunsList.jsx'

/**
 * @param {Object} props
 * @param {string|null|undefined} props.projectId
 * @param {Array<Record<string, unknown>>} props.testCases
 * @param {boolean} props.testCasesLoading
 * @param {(bugDocId: string) => void} [props.onOpenBug]
 */
export default function TestRuns({ projectId = null, testCases, testCasesLoading, onOpenBug }) {
  const [activeRunId, setActiveRunId] = useState(/** @type {string|null} */ (null))

  if (activeRunId) {
    return (
      <ExecutionMode
        projectId={projectId}
        runId={activeRunId}
        onExit={() => setActiveRunId(null)}
        onOpenBug={onOpenBug}
      />
    )
  }

  return (
    <RunsList
      projectId={projectId}
      testCases={testCases}
      testCasesLoading={testCasesLoading}
      onExecute={(runId) => setActiveRunId(runId)}
    />
  )
}
