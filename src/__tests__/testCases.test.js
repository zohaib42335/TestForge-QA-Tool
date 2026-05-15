import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('../contexts/ProjectContext', () => ({
  ProjectProvider: ({ children }) => children,
  useProject: () => ({
    projectId: 'proj-test',
    project: { id: 'proj-test', name: 'Test Project' },
    userRole: 'Admin',
    memberData: null,
    loading: false,
    error: null,
    inviteMember: jest.fn(async () => ({ inviteLink: 'https://example.com/invite/t', token: 't' })),
    acceptInviteToken: jest.fn(async () => ({
      projectId: 'proj-test',
      role: 'Member',
      projectName: 'Test Project',
    })),
  }),
}))

jest.mock('../hooks/useRole', () => ({
  useRole: () => ({
    userRole: 'Admin',
    hasPermission: () => true,
    isOwner: false,
    isAdmin: true,
    isQALead: false,
    isMember: false,
    isViewer: false,
    loading: false,
  }),
}))

import App from '../App.jsx'

jest.mock('../utils/googleSheets.js', () => ({
  extractTokenFromUrl: () => null,
  initiateGoogleSignIn: jest.fn(),
  syncToGoogleSheets: jest.fn(async () => ({
    success: true,
    message: 'ok',
  })),
}))

jest.mock('../context/AuthContext.jsx', () => {
  const signOutUser = jest.fn()
  return {
    AuthProvider: ({ children }) => children,
    useAuth: () => ({
      user: {
        uid: 'user-1',
        email: 'zohaib@example.com',
        photoURL: null,
        displayName: 'Zohaib',
        providerData: [],
      },
      currentUser: {
        uid: 'user-1',
        email: 'zohaib@example.com',
        photoURL: null,
        displayName: 'Zohaib',
        providerData: [],
      },
      loading: false,
      roleLoading: false,
      userProfile: {
        role: 'Admin',
        email: 'zohaib@example.com',
        displayName: 'Zohaib',
        projectId: 'proj-test',
        onboardingComplete: true,
      },
      workspaceError: '',
      retryWorkspaceProfile: jest.fn(),
      isAdmin: true,
      isQALead: false,
      isTester: false,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canManageRoles: true,
      canImport: true,
      canExport: true,
      canCreateRun: true,
      canDeleteRun: true,
      canExecuteRun: true,
      canBulkUpdate: true,
      canDuplicate: true,
      canManageTemplates: true,
      signOutUser,
      configError: '',
      authError: '',
      clearAuthError: jest.fn(),
      signInWithGoogle: jest.fn(),
      signInWithEmailPassword: jest.fn(),
      registerWithEmailPassword: jest.fn(),
    }),
  }
})

jest.mock('../hooks/useConnectionState.js', () => ({
  useConnectionState: () => ({ isOnline: true }),
}))

jest.mock('../hooks/useTemplates.js', () => ({
  useTemplates: () => ({
    isSavingTemplate: false,
    addTemplate: jest.fn(),
    templates: [],
    loading: false,
    error: '',
    deletingTemplateIds: new Set(),
  }),
}))

jest.mock('../utils/validation.js', () => ({
  validateTestCase: jest.fn(() => ({ isValid: true, errors: {} })),
}))

/** @param {Record<string, unknown>} [data] */
function mockMemberDocSnap(data = { role: 'Admin' }) {
  return {
    exists: true,
    id: 'user-1',
    data: () => data,
  }
}

// ---- Firestore mocks (NO real Firestore calls) ----
let mockSnapshotDocs = []
const mockOnSnapshot = jest.fn((q, onNext, _onError) => {
  const snap = {
    exists: mockSnapshotDocs.length > 0,
    size: mockSnapshotDocs.length,
    docs: mockSnapshotDocs.map((d) => ({
      id: d.id,
      data: () => d.data,
    })),
  }
  onNext(snap)
  return () => {}
})

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  where: jest.fn(),
  limit: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn().mockImplementation(() => Promise.resolve(mockMemberDocSnap())),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  updateDoc: jest.fn(),
  getDocs: jest.fn().mockResolvedValue({ docs: [], empty: true, size: 0 }),
  writeBatch: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
  getFirestore: jest.fn(),
  onSnapshot: (...args) => mockOnSnapshot(...args),
}))

const mockAddTestCaseFirestore = jest.fn()
const mockDeleteTestCaseFirestore = jest.fn()
const mockUpdateTestCaseFirestore = jest.fn()
const mockGetDb = jest.fn(() => ({}))
const mockGetTestCasesOnce = jest.fn()

jest.mock('../firebase/firestore.js', () => ({
  getDb: () => mockGetDb(),
  addTestCase: (...args) => mockAddTestCaseFirestore(...args),
  deleteTestCase: (...args) => mockDeleteTestCaseFirestore(...args),
  updateTestCase: (...args) => mockUpdateTestCaseFirestore(...args),
  getTestCasesOnce: (...args) => mockGetTestCasesOnce(...args),
  subscribeToProjectTestCases: (projectId, { onData, onError }) => {
    if (!projectId) {
      onData([])
      return () => {}
    }
    try {
      const snap = {
        exists: mockSnapshotDocs.length > 0,
        size: mockSnapshotDocs.length,
        docs: mockSnapshotDocs.map((d) => ({
          id: d.id,
          data: () => d.data,
        })),
      }
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData(items)
    } catch (err) {
      onError(err)
    }
    return () => {}
  },
  logActivity: jest.fn(),
  fetchCommentCountsByTestCaseIds: jest.fn().mockResolvedValue({}),
  getTemplates: jest.fn(),
  addTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
}))

const SAMPLE_DOC = {
  id: 'doc1',
  data: {
    id: 'doc1',
    testCaseId: 'TC-001',
    module: 'Payments',
    title: 'UI renders',
    priority: 'Medium',
    severity: 'Minor',
    status: 'Not Executed',
    testType: 'Functional',
    assignedTo: 'QA',
    updatedAt: new Date().toISOString(),
  },
}

function renderAppAt(path) {
  window.history.pushState({}, 'Test', path)
  return render(<App />)
}

describe('test cases UI + firestore integration (mocked)', () => {
  jest.setTimeout(15000)

  beforeEach(() => {
    mockSnapshotDocs = []
    mockOnSnapshot.mockClear()
    mockAddTestCaseFirestore.mockClear()
    mockDeleteTestCaseFirestore.mockClear()
    mockUpdateTestCaseFirestore.mockClear()
  })

  it('test case list renders Firestore data', async () => {
    mockSnapshotDocs = [SAMPLE_DOC]

    renderAppAt('/test-cases')

    expect(await screen.findByText('TC-001')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('form submit calls addTestCase', async () => {
    mockSnapshotDocs = []
    mockAddTestCaseFirestore.mockResolvedValue({ success: true, id: 'newDoc' })

    renderAppAt('/test-cases/new')

    fireEvent.click(await screen.findByRole('button', { name: /create test case/i }))

    await waitFor(() => {
      expect(mockAddTestCaseFirestore).toHaveBeenCalledTimes(1)
    })
    const [uid, payload, projectId] = mockAddTestCaseFirestore.mock.calls[0]
    expect(uid).toBe('user-1')
    expect(projectId).toBe('proj-test')
    expect(payload.testCaseId).toBe('TC-001')
  })

  it('delete calls deleteTestCase', async () => {
    mockSnapshotDocs = [SAMPLE_DOC]
    mockDeleteTestCaseFirestore.mockResolvedValue({ success: true })

    renderAppAt('/test-cases')

    const deleteBtn = await screen.findByRole('button', { name: /^delete$/i })
    fireEvent.click(deleteBtn)

    const confirmDelete = await screen.findByRole('button', { name: /delete test case/i })
    fireEvent.click(confirmDelete)

    await waitFor(() => {
      expect(mockDeleteTestCaseFirestore).toHaveBeenCalledTimes(1)
    })
    const [uid, docId, projectId] = mockDeleteTestCaseFirestore.mock.calls[0]
    expect(uid).toBe('user-1')
    expect(docId).toBe('doc1')
    expect(projectId).toBe('proj-test')
  })
})
