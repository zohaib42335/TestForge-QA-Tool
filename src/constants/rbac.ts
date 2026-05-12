export const ROLES = ['Owner', 'Admin', 'QA Lead', 'Member', 'Viewer'] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS = {
  // Project
  project_delete: ['Owner'],
  project_settings_edit: ['Owner', 'Admin'],
  team_manage: ['Owner', 'Admin'],
  integration_manage: ['Owner', 'Admin'],

  // Test Cases
  testcase_create: ['Owner', 'Admin', 'QA Lead', 'Member'],
  testcase_edit: ['Owner', 'Admin', 'QA Lead', 'Member'],
  testcase_delete: ['Owner', 'Admin', 'QA Lead'],
  testcase_view: ['Owner', 'Admin', 'QA Lead', 'Member', 'Viewer'],
  testcase_assign: ['Owner', 'Admin', 'QA Lead'],

  // Test Runs
  run_create: ['Owner', 'Admin', 'QA Lead'],
  run_execute: ['Owner', 'Admin', 'QA Lead', 'Member'],
  run_delete: ['Owner', 'Admin'],
  run_view: ['Owner', 'Admin', 'QA Lead', 'Member', 'Viewer'],
  run_approve: ['Owner', 'Admin', 'QA Lead'],

  // Bugs
  bug_create: ['Owner', 'Admin', 'QA Lead', 'Member'],
  bug_edit: ['Owner', 'Admin', 'QA Lead', 'Member'],
  bug_delete: ['Owner', 'Admin', 'QA Lead'],
  bug_view: ['Owner', 'Admin', 'QA Lead', 'Member', 'Viewer'],
  bug_status_change: ['Owner', 'Admin', 'QA Lead', 'Member'],

  // AI Generator
  ai_generate: ['Owner', 'Admin', 'QA Lead'],
  ai_save: ['Owner', 'Admin', 'QA Lead'],

  // Notifications
  notification_manage: ['Owner', 'Admin'],

  // Reports
  report_view: ['Owner', 'Admin', 'QA Lead', 'Member', 'Viewer'],
  report_share: ['Owner', 'Admin', 'QA Lead'],
} as const

export type Permission = keyof typeof PERMISSIONS

export function hasPermission(userRole: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(userRole)
}

