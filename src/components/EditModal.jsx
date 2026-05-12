/**
 * EditModal — Modal dialog for editing an existing test case.
 * @param {Object} props
 * @param {Object|null} props.testCase - Test case being edited, null = closed
 * @param {Function} props.onSave - Called with updated test case data
 * @param {boolean} [props.isSubmitting] - True while saving to Firestore
 * @param {string|null} [props.savingDocId] - Firestore doc id currently saving (for future use)
 * @param {Function} props.onClose - Called to close modal
 */

import { useCallback, useEffect, useState } from 'react'
import { useRole } from '../hooks/useRole'
import {
  DEFAULT_FORM_VALUES,
  ENVIRONMENT_OPTIONS,
  PRIORITY_OPTIONS,
  SEVERITY_OPTIONS,
  STATUS_OPTIONS,
  TEST_TYPE_OPTIONS,
} from '../constants/testCaseFields.js'
import { validateTestCase } from '../utils/validation.js'

/** @type {readonly string[]} */
const AUTOMATION_OPTIONS = ['Manual', 'Automated', 'To Be Automated']

const inputClass =
  'bg-white border-[0.5px] border-[#B0C0E0] text-[#1A3263] rounded-lg px-3 py-2 w-full focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)] outline-none transition placeholder:text-[#8A9BBF] hover:border-[#8A9BBF]'
const inputErrorClass = ' border-red-400 bg-red-50'
const labelClass = 'block text-sm text-[#5A6E9A] mb-1'
const sectionHeaderClass =
  'text-xs uppercase tracking-widest text-[#1A3263] font-mono px-4 py-3 bg-white border-b border-[#D6E0F5]'
const sectionCardClass =
  'bg-white rounded-xl mb-3 border border-[#B0C0E0] shadow-sm overflow-hidden'

/**
 * @param {string} name
 * @param {Record<string, string>} errors
 * @returns {string}
 */
function fieldError(name, errors) {
  return errors[name] || ''
}

/**
 * @param {{ error?: string }} props
 */
function FieldHint({ error }) {
  if (!error) return null
  return <p className="text-red-600 text-xs mt-1">{error}</p>
}

/**
 * @param {object|null} tc
 * @returns {Record<string, string>}
 */
function testCaseToFormData(tc) {
  if (!tc || typeof tc !== 'object') {
    return { ...DEFAULT_FORM_VALUES }
  }
  return {
    ...DEFAULT_FORM_VALUES,
    ...tc,
  }
}

/**
 * @param {Object} props
 * @param {Object|null} props.testCase
 * @param {Function} props.onSave
 * @param {boolean} [props.isSubmitting]
 * @param {string|null} [props.savingDocId]
 * @param {Function} props.onClose
 */
export default function EditModal({
  testCase,
  onSave,
  isSubmitting = false,
  savingDocId = null,
  onClose,
}) {
  const { hasPermission } = useRole()
  const canAssign = hasPermission('testcase_assign')
  const [formData, setFormData] = useState(() => testCaseToFormData(testCase))
  /** @type {[Record<string, string>, import('react').Dispatch<import('react').SetStateAction<Record<string, string>>>]} */
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!testCase) return
    setFormData(testCaseToFormData(testCase))
    setErrors({})
    setSubmitError('')
  }, [testCase])

  const clearFieldError = useCallback((fieldName) => {
    setErrors((prev) => {
      if (!prev[fieldName]) return prev
      const next = { ...prev }
      delete next[fieldName]
      return next
    })
  }, [])

  /**
   * @param {string} field
   * @param {string} value
   */
  const updateField = useCallback(
    (field, value) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      clearFieldError(field)
      if (submitError) setSubmitError('')
    },
    [clearFieldError, submitError],
  )

  /**
   * @param {import('react').ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>} e
   */
  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target
      updateField(name, value)
    },
    [updateField],
  )

  /**
   * @param {import('react').FormEvent<HTMLFormElement>} e
   */
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!testCase) return
    if (isSubmitting) return
    setSubmitError('')

    const { isValid, errors: nextErrors } = validateTestCase(formData)
    if (!isValid) {
      setErrors(nextErrors)
      return
    }

    const payload = { ...formData, testCaseId: testCase.testCaseId }
    const raw = onSave(payload)
    const resolved = await Promise.resolve(raw)

    if (
      resolved &&
      typeof resolved === 'object' &&
      'success' in resolved &&
      resolved.success === false
    ) {
      if (resolved.error && typeof resolved.error === 'string') {
        setSubmitError(resolved.error)
      }
      if (resolved.errors && typeof resolved.errors === 'object') {
        setErrors(resolved.errors)
      }
      return
    }

    onClose()
  }

  if (!testCase) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 w-full h-full cursor-default"
        aria-label="Close modal overlay"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl border border-[#B0C0E0] w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between gap-4 px-6 py-4 bg-[#1A3263] text-white shrink-0">
          <h2
            id="edit-modal-title"
            className="text-xl font-semibold tracking-tight"
          >
            Edit Test Case
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-10 h-10 rounded-lg text-white hover:text-white/80 transition text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="text-[#1A3263] overflow-y-auto p-6 flex-1 min-h-0" noValidate>
          {submitError ? (
            <div
              className="mb-4 rounded-lg px-4 py-3 text-sm border-l-4 bg-red-50 border-red-500 text-red-800 border border-red-200"
              role="alert"
            >
              {submitError}
            </div>
          ) : null}
          <div className="mb-4">
            <label className={labelClass} htmlFor="edit-testCaseId">
              Test Case ID
            </label>
            <input
              id="edit-testCaseId"
              name="testCaseId"
              type="text"
              readOnly
              value={formData.testCaseId ?? ''}
              className={`${inputClass} opacity-50 cursor-not-allowed`}
              aria-readonly="true"
            />
          </div>

          <div className={sectionCardClass}>
            <h3 className={sectionHeaderClass}>Identification</h3>
            <div className="grid grid-cols-2 gap-4 p-4">
              <div className="col-span-2">
                <label className={labelClass} htmlFor="edit-module">
                  Module / Test Suite
                </label>
                <input
                  id="edit-module"
                  name="module"
                  type="text"
                  value={formData.module}
                  onChange={handleChange}
                  className={`${inputClass}${fieldError('module', errors) ? inputErrorClass : ''}`}
                  autoComplete="off"
                />
                <FieldHint error={fieldError('module', errors)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass} htmlFor="edit-title">
                  Test Title
                </label>
                <input
                  id="edit-title"
                  name="title"
                  type="text"
                  value={formData.title}
                  onChange={handleChange}
                  className={`${inputClass}${fieldError('title', errors) ? inputErrorClass : ''}`}
                  autoComplete="off"
                />
                <FieldHint error={fieldError('title', errors)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-testType">
                  Test Type
                </label>
                <select
                  id="edit-testType"
                  name="testType"
                  value={formData.testType}
                  onChange={handleChange}
                  className={`${inputClass}${fieldError('testType', errors) ? inputErrorClass : ''}`}
                >
                  {TEST_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <FieldHint error={fieldError('testType', errors)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-priority">
                  Priority
                </label>
                <select
                  id="edit-priority"
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  className={`${inputClass}${fieldError('priority', errors) ? inputErrorClass : ''}`}
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <FieldHint error={fieldError('priority', errors)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass} htmlFor="edit-severity">
                  Severity
                </label>
                <select
                  id="edit-severity"
                  name="severity"
                  value={formData.severity}
                  onChange={handleChange}
                  className={`${inputClass}${fieldError('severity', errors) ? inputErrorClass : ''}`}
                >
                  {SEVERITY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <FieldHint error={fieldError('severity', errors)} />
              </div>
            </div>
          </div>

          <div className={sectionCardClass}>
            <h3 className={sectionHeaderClass}>Description</h3>
            <div className="grid grid-cols-2 gap-4 p-4">
              <div className="col-span-2">
                <label className={labelClass} htmlFor="edit-description">
                  Description
                </label>
                <textarea
                  id="edit-description"
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <label className={labelClass} htmlFor="edit-preconditions">
                  Pre-conditions
                </label>
                <textarea
                  id="edit-preconditions"
                  name="preconditions"
                  rows={3}
                  value={formData.preconditions}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className={sectionCardClass}>
            <h3 className={sectionHeaderClass}>Test Execution</h3>
            <div className="grid grid-cols-2 gap-4 p-4">
              <div className="col-span-2">
                <label className={labelClass} htmlFor="edit-testSteps">
                  Test Steps
                </label>
                <p className="text-xs text-[#5A6E9A] mb-1">
                  Number each step: 1. Open... 2. Click...
                </p>
                <textarea
                  id="edit-testSteps"
                  name="testSteps"
                  rows={5}
                  value={formData.testSteps}
                  onChange={handleChange}
                  className={`${inputClass}${fieldError('testSteps', errors) ? inputErrorClass : ''}`}
                />
                <FieldHint error={fieldError('testSteps', errors)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-expectedResult">
                  Expected Result
                </label>
                <textarea
                  id="edit-expectedResult"
                  name="expectedResult"
                  rows={3}
                  value={formData.expectedResult}
                  onChange={handleChange}
                  className={`${inputClass}${fieldError('expectedResult', errors) ? inputErrorClass : ''}`}
                />
                <FieldHint error={fieldError('expectedResult', errors)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-actualResult">
                  Actual Result
                </label>
                <textarea
                  id="edit-actualResult"
                  name="actualResult"
                  rows={3}
                  value={formData.actualResult}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-status">
                  Status
                </label>
                <select
                  id="edit-status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className={`${inputClass}${fieldError('status', errors) ? inputErrorClass : ''}`}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <FieldHint error={fieldError('status', errors)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-environment">
                  Environment
                </label>
                <select
                  id="edit-environment"
                  name="environment"
                  value={formData.environment}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {ENVIRONMENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className={sectionCardClass}>
            <h3 className={sectionHeaderClass}>Tracking</h3>
            <div className="grid grid-cols-2 gap-4 p-4">
              {canAssign ? (
                <div>
                  <label className={labelClass} htmlFor="edit-assignedTo">
                    Assigned To
                  </label>
                  <input
                    id="edit-assignedTo"
                    name="assignedTo"
                    type="text"
                    value={formData.assignedTo}
                    onChange={handleChange}
                    className={inputClass}
                    autoComplete="off"
                  />
                </div>
              ) : null}
              <div>
                <label className={labelClass} htmlFor="edit-createdBy">
                  Created By
                </label>
                <input
                  id="edit-createdBy"
                  name="createdBy"
                  type="text"
                  value={formData.createdBy}
                  onChange={handleChange}
                  className={`${inputClass}${fieldError('createdBy', errors) ? inputErrorClass : ''}`}
                  autoComplete="off"
                />
                <FieldHint error={fieldError('createdBy', errors)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-createdDate">
                  Created Date
                </label>
                <input
                  id="edit-createdDate"
                  name="createdDate"
                  type="date"
                  value={formData.createdDate}
                  onChange={handleChange}
                  className={`${inputClass}${fieldError('createdDate', errors) ? inputErrorClass : ''}`}
                />
                <FieldHint error={fieldError('createdDate', errors)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-executionDate">
                  Execution Date{' '}
                  <span className="text-[#5A6E9A] font-normal">(optional)</span>
                </label>
                <input
                  id="edit-executionDate"
                  name="executionDate"
                  type="date"
                  value={formData.executionDate}
                  onChange={handleChange}
                  className={`${inputClass}${fieldError('executionDate', errors) ? inputErrorClass : ''}`}
                />
                <FieldHint error={fieldError('executionDate', errors)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-bugId">
                  Bug ID
                </label>
                <input
                  id="edit-bugId"
                  name="bugId"
                  type="text"
                  value={formData.bugId}
                  onChange={handleChange}
                  placeholder="e.g. BUG-123"
                  className={inputClass}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-automationStatus">
                  Automation Status
                </label>
                <select
                  id="edit-automationStatus"
                  name="automationStatus"
                  value={formData.automationStatus}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {AUTOMATION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelClass} htmlFor="edit-comments">
                  Comments
                </label>
                <textarea
                  id="edit-comments"
                  name="comments"
                  rows={2}
                  value={formData.comments}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-lg bg-white border-[0.5px] border-[#B0C0E0] text-[#1A3263] font-semibold hover:bg-[#EEF2FB] hover:border-[#4169C4] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-lg bg-[#1A3263] hover:bg-[#122247] text-white font-semibold transition disabled:bg-[#B0C0E0] disabled:text-[#8A9BBF] disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
