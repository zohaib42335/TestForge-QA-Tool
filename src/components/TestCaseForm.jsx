/**
 * TestCaseForm — Form component for creating a new test case.
 * @param {Object} props
 * @param {Function} props.onSubmit - Called with valid form data on submission
 * @param {boolean} props.isSubmitting - Disables form while submitting
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

/**
 * @returns {Record<string, string>}
 */
function getInitialFormData() {
  return {
    ...DEFAULT_FORM_VALUES,
    createdDate: new Date().toISOString().split('T')[0],
  }
}

/**
 * Fields stored when saving a reusable template (assignee / creator / status left to the author).
 * @param {Record<string, string>} formData
 * @returns {Record<string, string>}
 */
function extractTemplateSlice(formData) {
  return {
    module: formData.module ?? '',
    title: formData.title ?? '',
    description: formData.description ?? '',
    preconditions: formData.preconditions ?? '',
    testSteps: formData.testSteps ?? '',
    expectedResult: formData.expectedResult ?? '',
    priority: formData.priority ?? '',
    severity: formData.severity ?? '',
    testType: formData.testType ?? '',
    environment: formData.environment ?? '',
  }
}

const inputClass =
  'bg-white border-[0.5px] border-[#B0C0E0] text-[#1A3263] rounded-lg px-3 py-2 w-full focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)] outline-none transition placeholder:text-[#8A9BBF] hover:border-[#8A9BBF]'
const inputErrorClass = ' border-red-400 bg-red-50'
const labelClass = 'block text-sm text-[#5A6E9A] mb-1'
const sectionHeaderClass =
  'text-xs uppercase tracking-widest text-[#1A3263] font-mono px-4 py-3 bg-white border-b border-[#D6E0F5]'
const sectionCardClass =
  'bg-white rounded-xl mb-4 border border-[#B0C0E0] shadow-sm overflow-hidden'

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
 * @param {Object} props
 * @param {Function} props.onSubmit
 * @param {boolean} [props.isSubmitting]
 * @param {number} [props.templateApplyVersion] - Increment to apply `templateDefaults` to the form
 * @param {Record<string, string>} [props.templateDefaults] - Partial field preset from a template
 * @param {Function} [props.onSaveAsTemplate] - (payload: { name: string, description: string, defaults: Record<string, string> }) => void
 */
export default function TestCaseForm({
  onSubmit,
  isSubmitting = false,
  templateApplyVersion = 0,
  templateDefaults = {},
  onSaveAsTemplate,
}) {
  const { hasPermission } = useRole()
  const canAssign = hasPermission('testcase_assign')
  const [formData, setFormData] = useState(getInitialFormData)
  /** @type {[Record<string, string>, import('react').Dispatch<import('react').SetStateAction<Record<string, string>>>]} */
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')

  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateModalName, setTemplateModalName] = useState('')
  const [templateModalDescription, setTemplateModalDescription] = useState('')
  const [templateModalError, setTemplateModalError] = useState('')

  useEffect(() => {
    if (!templateApplyVersion) return
    const d = templateDefaults && typeof templateDefaults === 'object' ? templateDefaults : {}
    setFormData({
      ...getInitialFormData(),
      ...d,
      assignedTo: '',
      createdBy: '',
      status: 'Not Executed',
      testCaseId: '',
      createdDate: new Date().toISOString().split('T')[0],
      actualResult: '',
      executionDate: '',
      bugId: '',
      comments: '',
      automationStatus: 'Manual',
    })
    setErrors({})
    setSubmitError('')
  }, [templateApplyVersion, templateDefaults])

  useEffect(() => {
    if (!templateModalOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setTemplateModalOpen(false)
        setTemplateModalError('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [templateModalOpen])

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

  const resetForm = useCallback(() => {
    setFormData(getInitialFormData())
    setErrors({})
    setSubmitError('')
  }, [])

  /**
   * @param {import('react').FormEvent<HTMLFormElement>} e
   */
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
    setSubmitError('')

    const { isValid, errors: nextErrors } = validateTestCase(formData)
    if (!isValid) {
      setErrors(nextErrors)
      return
    }

    const raw = onSubmit(formData)
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

    resetForm()
  }

  const openSaveTemplateModal = useCallback(
    (e) => {
      e?.preventDefault()
      e?.stopPropagation()
      if (typeof onSaveAsTemplate !== 'function') return
      setTemplateModalName('')
      setTemplateModalDescription('')
      setTemplateModalError('')
      setTemplateModalOpen(true)
    },
    [onSaveAsTemplate],
  )

  const closeSaveTemplateModal = useCallback(() => {
    setTemplateModalOpen(false)
    setTemplateModalError('')
  }, [])

  const confirmSaveTemplate = useCallback(() => {
    if (typeof onSaveAsTemplate !== 'function') return
    const trimmed = templateModalName.trim()
    if (!trimmed) {
      setTemplateModalError('Please enter a template name.')
      return
    }
    onSaveAsTemplate({
      name: trimmed,
      description: templateModalDescription.trim(),
      defaults: extractTemplateSlice(formData),
    })
    closeSaveTemplateModal()
  }, [
    onSaveAsTemplate,
    templateModalName,
    templateModalDescription,
    formData,
    closeSaveTemplateModal,
  ])

  const disabled = isSubmitting

  return (
    <>
    <form onSubmit={handleSubmit} className="text-[#1A3263]" noValidate data-tour="testcase-form">
      {submitError ? (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm border-l-4 bg-red-50 border-red-500 text-red-800 border border-red-200"
          role="alert"
        >
          {submitError}
        </div>
      ) : null}
      {/* Section 1: Identification */}
      <div className={sectionCardClass}>
        <h3 className={sectionHeaderClass}>Identification</h3>
        <div className="grid grid-cols-2 gap-4 p-4">
          <div>
            <label className={labelClass} htmlFor="testCaseId">
              Test Case ID
            </label>
            <input
              id="testCaseId"
              name="testCaseId"
              type="text"
              readOnly
              value=""
              placeholder="Auto-generated"
              className={`${inputClass} opacity-50 cursor-not-allowed`}
              aria-readonly="true"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="module">
              Module / Test Suite
            </label>
            <input
              id="module"
              name="module"
              type="text"
              value={formData.module}
              onChange={handleChange}
              disabled={disabled}
              className={`${inputClass}${fieldError('module', errors) ? inputErrorClass : ''}`}
              autoComplete="off"
            />
            <FieldHint error={fieldError('module', errors)} />
          </div>
          <div className="col-span-2">
            <label className={labelClass} htmlFor="title">
              Test Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              value={formData.title}
              onChange={handleChange}
              disabled={disabled}
              className={`${inputClass}${fieldError('title', errors) ? inputErrorClass : ''}`}
              autoComplete="off"
            />
            <FieldHint error={fieldError('title', errors)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="testType">
              Test Type
            </label>
            <select
              id="testType"
              name="testType"
              value={formData.testType}
              onChange={handleChange}
              disabled={disabled}
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
            <label className={labelClass} htmlFor="priority">
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              value={formData.priority}
              onChange={handleChange}
              disabled={disabled}
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
          <div>
            <label className={labelClass} htmlFor="severity">
              Severity
            </label>
            <select
              id="severity"
              name="severity"
              value={formData.severity}
              onChange={handleChange}
              disabled={disabled}
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

      {/* Section 2: Description */}
      <div className={sectionCardClass}>
        <h3 className={sectionHeaderClass}>Description</h3>
        <div className="grid grid-cols-2 gap-4 p-4">
          <div className="col-span-2">
            <label className={labelClass} htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              value={formData.description}
              onChange={handleChange}
              disabled={disabled}
              className={inputClass}
            />
          </div>
          <div className="col-span-2">
            <label className={labelClass} htmlFor="preconditions">
              Pre-conditions
            </label>
            <textarea
              id="preconditions"
              name="preconditions"
              rows={3}
              value={formData.preconditions}
              onChange={handleChange}
              disabled={disabled}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Section 3: Test Execution */}
      <div className={sectionCardClass}>
        <h3 className={sectionHeaderClass}>Test Execution</h3>
        <div className="grid grid-cols-2 gap-4 p-4">
          <div className="col-span-2">
            <label className={labelClass} htmlFor="testSteps">
              Test Steps
            </label>
            <p className="text-xs text-[#5A6E9A] mb-1">
              Number each step: 1. Open... 2. Click...
            </p>
            <textarea
              id="testSteps"
              name="testSteps"
              rows={5}
              value={formData.testSteps}
              onChange={handleChange}
              disabled={disabled}
              className={`${inputClass}${fieldError('testSteps', errors) ? inputErrorClass : ''}`}
            />
            <FieldHint error={fieldError('testSteps', errors)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="expectedResult">
              Expected Result
            </label>
            <textarea
              id="expectedResult"
              name="expectedResult"
              rows={3}
              value={formData.expectedResult}
              onChange={handleChange}
              disabled={disabled}
              className={`${inputClass}${fieldError('expectedResult', errors) ? inputErrorClass : ''}`}
            />
            <FieldHint error={fieldError('expectedResult', errors)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="actualResult">
              Actual Result
            </label>
            <textarea
              id="actualResult"
              name="actualResult"
              rows={3}
              value={formData.actualResult}
              onChange={handleChange}
              disabled={disabled}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="status">
              Status
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              disabled={disabled}
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
            <label className={labelClass} htmlFor="environment">
              Environment
            </label>
            <select
              id="environment"
              name="environment"
              value={formData.environment}
              onChange={handleChange}
              disabled={disabled}
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

      {/* Section 4: Tracking */}
      <div className={sectionCardClass}>
        <h3 className={sectionHeaderClass}>Tracking</h3>
        <div className="grid grid-cols-2 gap-4 p-4">
          {canAssign ? (
            <div>
              <label className={labelClass} htmlFor="assignedTo">
                Assigned To
              </label>
              <input
                id="assignedTo"
                name="assignedTo"
                type="text"
                value={formData.assignedTo}
                onChange={handleChange}
                disabled={disabled}
                className={inputClass}
                autoComplete="off"
              />
            </div>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="createdBy">
              Created By
            </label>
            <input
              id="createdBy"
              name="createdBy"
              type="text"
              value={formData.createdBy}
              onChange={handleChange}
              disabled={disabled}
              className={`${inputClass}${fieldError('createdBy', errors) ? inputErrorClass : ''}`}
              autoComplete="off"
            />
            <FieldHint error={fieldError('createdBy', errors)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="createdDate">
              Created Date
            </label>
            <input
              id="createdDate"
              name="createdDate"
              type="date"
              value={formData.createdDate}
              onChange={handleChange}
              disabled={disabled}
              className={`${inputClass}${fieldError('createdDate', errors) ? inputErrorClass : ''}`}
            />
            <FieldHint error={fieldError('createdDate', errors)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="executionDate">
              Execution Date <span className="text-[#5A6E9A] font-normal">(optional)</span>
            </label>
            <input
              id="executionDate"
              name="executionDate"
              type="date"
              value={formData.executionDate}
              onChange={handleChange}
              disabled={disabled}
              className={`${inputClass}${fieldError('executionDate', errors) ? inputErrorClass : ''}`}
            />
            <FieldHint error={fieldError('executionDate', errors)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="bugId">
              Bug ID
            </label>
            <input
              id="bugId"
              name="bugId"
              type="text"
              value={formData.bugId}
              onChange={handleChange}
              disabled={disabled}
              placeholder="e.g. BUG-123"
              className={inputClass}
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="automationStatus">
              Automation Status
            </label>
            <select
              id="automationStatus"
              name="automationStatus"
              value={formData.automationStatus}
              onChange={handleChange}
              disabled={disabled}
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
            <label className={labelClass} htmlFor="comments">
              Comments
            </label>
            <textarea
              id="comments"
              name="comments"
              rows={2}
              value={formData.comments}
              onChange={handleChange}
              disabled={disabled}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {typeof onSaveAsTemplate === 'function' && (
        <button
          type="button"
          onClick={openSaveTemplateModal}
          disabled={disabled}
          className="w-full mt-4 py-3 rounded-lg text-sm font-semibold bg-white border-[0.5px] border-[#B0C0E0] text-[#1A3263] hover:bg-[#EEF2FB] hover:border-[#4169C4] transition disabled:bg-[#B0C0E0] disabled:text-[#8A9BBF] disabled:cursor-not-allowed"
        >
          Save as Template
        </button>
      )}

      <button
        type="submit"
        disabled={disabled}
        className="w-full bg-[#1A3263] hover:bg-[#122247] active:bg-[#0E1A35] text-white font-semibold py-3 rounded-lg transition mt-4 disabled:bg-[#B0C0E0] disabled:text-[#8A9BBF] disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Saving…' : 'Create test case'}
      </button>
    </form>

    {typeof onSaveAsTemplate === 'function' && templateModalOpen && (
      <div
        className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-[rgba(26,50,99,0.25)] px-4 py-16 sm:py-24"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-template-heading"
      >
        <button
          type="button"
          className="fixed inset-0 cursor-default"
          aria-label="Close dialog"
          onClick={closeSaveTemplateModal}
        />
        <div className="relative z-[81] w-full max-w-md rounded-2xl border border-[#B0C0E0] bg-white p-6 shadow-xl">
          <h2
            id="save-template-heading"
            className="text-lg font-semibold text-[#1A3263]"
          >
            Save as template
          </h2>
          <p className="mt-1 text-sm text-[#5A6E9A]">
            Saves current field values (except assignee, status, and IDs) to your Template Library.
          </p>
          {templateModalError ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {templateModalError}
            </p>
          ) : null}
          <div className="mt-4 space-y-3">
            <div>
              <label className={labelClass} htmlFor="template-save-name">
                Template name
              </label>
              <input
                id="template-save-name"
                type="text"
                value={templateModalName}
                onChange={(e) => {
                  setTemplateModalName(e.target.value)
                  if (templateModalError) setTemplateModalError('')
                }}
                className={inputClass}
                autoComplete="off"
                autoFocus
                placeholder="e.g. API smoke checklist"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="template-save-desc">
                Description <span className="font-normal text-[#8A9BBF]">(optional)</span>
              </label>
              <textarea
                id="template-save-desc"
                rows={2}
                value={templateModalDescription}
                onChange={(e) => setTemplateModalDescription(e.target.value)}
                className={inputClass}
                placeholder="Short note for your team"
              />
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeSaveTemplateModal}
              className="w-full rounded-lg border-[0.5px] border-[#B0C0E0] bg-white py-2.5 text-sm font-semibold text-[#5A6E9A] transition hover:bg-[#EEF2FB] sm:w-auto sm:px-4"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSaveTemplate}
              className="w-full rounded-lg bg-[#1A3263] py-2.5 text-sm font-semibold text-white transition hover:bg-[#122247] sm:w-auto sm:px-4"
            >
              Save template
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
