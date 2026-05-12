/**
 * TemplateLibrary — Card grid of built-in and custom templates; applies presets to the form.
 * @param {Object} props
 * @param {Function} props.onUseTemplate - (defaults: Record<string, string>) => void
 */

import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { BUILT_IN_TEMPLATES } from '../constants/builtInTemplates.js'
import { useTemplates } from '../hooks/useTemplates.js'
import { buildActivityActor } from '../utils/memberDisplay.js'
import { logActivity } from '../firebase/firestore.js'

/**
 * @param {Object} props
 * @param {Function} props.onUseTemplate
 * @param {boolean} [props.canManageTemplates] - When false, hide save/delete affordances (view only for custom cards)
 */
export default function TemplateLibrary({ onUseTemplate, canManageTemplates = true }) {
  const { user, userProfile } = useAuth()
  const {
    templates: customTemplates,
    loading,
    error,
    deletingTemplateIds,
    deleteTemplate,
  } = useTemplates()

  const allTemplates = useMemo(() => {
    const built = BUILT_IN_TEMPLATES.map((t) => ({
      ...t,
      isCustom: false,
    }))
    const custom = customTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description || 'Saved from your form.',
      defaults: t.defaults || {},
      isCustom: true,
    }))
    return [...built, ...custom]
  }, [customTemplates])

  const customCount = Array.isArray(customTemplates) ? customTemplates.length : 0

  return (
    <section className="mb-4" aria-labelledby="template-library-heading" data-tour="template-library">
      <h2
        id="template-library-heading"
        className="text-sm uppercase tracking-widest text-[#1A3263] font-mono mb-4 border-b border-[#D6E0F5] pb-2"
      >
        Template library
      </h2>
      <p className="text-sm text-[#5A6E9A] mb-4">
        Start from a preset to pre-fill suite, title, steps, and risk fields. Assignee and
        creator stay empty until you enter them.
      </p>
      {loading && (
        <div className="mb-4 rounded-lg border border-[#B0C0E0] bg-white px-4 py-3 text-sm text-[#5A6E9A]">
          Loading templates...
        </div>
      )}
      {!loading && error && (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}
      {!loading && !error && customCount === 0 && (
        <div className="mb-4 rounded-lg border border-[#B0C0E0] bg-[#EEF2FB] px-4 py-3 text-sm text-[#5A6E9A]">
          {canManageTemplates
            ? 'No custom templates yet. Save one from the form to see it here.'
            : 'No custom templates in your library yet.'}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {allTemplates.map((t) => (
          <article
            key={t.id}
            className="bg-white border border-[#B0C0E0] rounded-xl p-5 flex flex-col gap-3 shadow-sm hover:border-[#4169C4] hover:shadow-md transition"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-[#1A3263] text-base leading-snug">{t.name}</h3>
              {t.isCustom && (
                <span className="shrink-0 text-[10px] uppercase tracking-wider font-mono text-[#1A3263] bg-[#EEF2FB] border border-[#B0C0E0] px-2 py-0.5 rounded-full">
                  Custom
                </span>
              )}
            </div>
            <p className="text-sm text-[#5A6E9A] flex-1">{t.description}</p>
            <div className="mt-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const actor = buildActivityActor(userProfile, user)
                  if (actor) {
                    void logActivity({
                      action: 'template.used',
                      entityType: 'template',
                      entityId: String(t.id),
                      entityRef: String(t.name),
                      actor,
                    })
                  }
                  onUseTemplate({ ...(t.defaults || {}) })
                }}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-[#1A3263] hover:bg-[#122247] text-white transition"
              >
                Use Template
              </button>
              {t.isCustom && canManageTemplates && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Delete this custom template?')) return
                    const templateName = String(t.name ?? '')
                    const result = await deleteTemplate(t.id)
                    if (result && typeof result === 'object' && result.success === false) {
                      window.alert(
                        result.error || 'Could not delete template from Firestore.',
                      )
                      return
                    }
                    const actor = buildActivityActor(userProfile, user)
                    if (actor) {
                      void logActivity({
                        action: 'template.deleted',
                        entityType: 'template',
                        entityId: String(t.id),
                        entityRef: templateName,
                        actor,
                      })
                    }
                  }}
                  disabled={deletingTemplateIds.has(t.id)}
                  className="px-3 py-2.5 rounded-lg text-sm font-semibold text-red-500 hover:text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 transition"
                  title="Delete custom template"
                >
                  {deletingTemplateIds.has(t.id) ? '...' : '🗑'}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
