import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

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
      userProfile: { role: 'Admin', email: 'zohaib@example.com', displayName: 'Zohaib' },
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

// ---- Firestore mocks (NO real Firestore calls) ----
let mockSnapshotDocs = []
const mockOnSnapshot = jest.fn((q, onNext, _onError) => {
  const snap = {
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
  doc: jest.fn(),
  addDoc: jest.fn(),
  deleteDoc: jest.fn(),
  updateDoc: jest.fn(),
  getDocs: jest.fn(),
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
  logActivity: jest.fn(),
  fetchCommentCountsByTestCaseIds: jest.fn().mockResolvedValue({}),
  // keep the template exports available for any eager imports
  getTemplates: jest.fn(),
  addTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
}))

describe('test cases UI + firestore integration (mocked)', () => {
  beforeEach(() => {
    mockSnapshotDocs = []
    mockOnSnapshot.mockClear()
    mockAddTestCaseFirestore.mockClear()
    mockDeleteTestCaseFirestore.mockClear()
    mockUpdateTestCaseFirestore.mockClear()
  })

  it('test case list renders Firestore data', async () => {
    mockSnapshotDocs = [
      {
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
        },
      },
    ]

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /view all/i }))

    expect(await screen.findByText('TC-001')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('form submit calls addTestCase', async () => {
    mockSnapshotDocs = [] // start with empty list so next id is deterministic
    mockAddTestCaseFirestore.mockResolvedValue({ success: true, id: 'newDoc' })

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /^new test case$/i }))
    fireEvent.click(screen.getByRole('button', { name: /create test case/i }))

    // Hook should compute TC-001 and call Firestore wrapper once
    expect(mockAddTestCaseFirestore).toHaveBeenCalledTimes(1)
    const [uid, payload] = mockAddTestCaseFirestore.mock.calls[0]
    expect(uid).toBe('user-1')
    expect(payload.testCaseId).toBe('TC-001')
  })

  it('delete calls deleteTestCase', async () => {
    mockSnapshotDocs = [
      {
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
        },
      },
    ]
    mockDeleteTestCaseFirestore.mockResolvedValue({ success: true })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /view all/i }))

    const deleteBtn = await screen.findByRole('button', { name: /^delete$/i })
    fireEvent.click(deleteBtn)

    const confirmDelete = await screen.findByRole('button', { name: /delete test case/i })
    fireEvent.click(confirmDelete)

    expect(mockDeleteTestCaseFirestore).toHaveBeenCalledTimes(1)
    const [uid, docId] = mockDeleteTestCaseFirestore.mock.calls[0]
    expect(uid).toBe('user-1')
    expect(docId).toBe('doc1')
  })
})

