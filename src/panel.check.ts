// `orca plugin check` renders the panel once per scenario; `orca plugin shot --scenario` draws one.
// Mock data only (src/mockData.ts): a fictional "Acme Shop" space. The README screenshots come from these.
import { defineCheck } from 'orca/testing'
import { requests, signedOutRequests } from './mockData'

export default defineCheck({
  signedOut: { requests: signedOutRequests },
  home: { requests, persisted: { plugin: { screen: 'home', openKey: null } } },
  issues: {
    requests,
    persisted: { plugin: { screen: 'issues', openKey: null, advancedOpen: true, issueFilters: { projectId: '10', categoryId: '30' } } }
  },
  detail: { requests, persisted: { plugin: { screen: 'home', openKey: 'SHOP-142' } } },
  settings: { requests, persisted: { plugin: { screen: 'settings', openKey: null } } }
})
