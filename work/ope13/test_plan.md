# OpenScanAI Core User Features Test Plan
## OPE-13 — QA Engineer Assignment

**Document Version:** 1.0  
**Date:** 2026-05-26  
**Author:** CTO 2 (QA Engineering)  
**Status:** Draft  

---

## 1. Executive Summary

This test plan defines the testing strategy for OpenScanAI's core user-facing features. OpenScanAI is an AI platform that brings automation, AI agents, and a control dashboard together in one unified system.

### Scope
This plan covers testing for:
- User authentication and authorization
- AI agent management and orchestration
- Dashboard UI/UX functionality
- CI/CD pipeline integration points
- Marketing analytics data accuracy
- Security controls and compliance

### Out of Scope
- Third-party API deep testing (covered in integration contracts)
- Load/performance testing (separate performance test plan)
- Mobile app testing (future phase)

---

## 2. Test Objectives

| Objective | Target | Measurement |
|-----------|--------|-------------|
| Validate user registration/login flows | 100% pass rate | Critical path tests |
| Verify agent creation and execution | 100% pass rate | End-to-end agent lifecycle |
| Confirm dashboard data accuracy | 100% pass rate | Data reconciliation |
| Ensure security controls function | 100% pass rate | Penetration + unit tests |
| Validate CI/CD webhook integrations | 95% pass rate | Integration test suite |

---

## 3. Test Strategy

### 3.1 Test Levels

```
┌─────────────────────────────────────────────────────────┐
│  Level 4: E2E Acceptance Tests                          │
│  - Full user journeys via Playwright/Cypress            │
├─────────────────────────────────────────────────────────┤
│  Level 3: Integration Tests                             │
│  - API contracts, DB interactions, external services    │
├─────────────────────────────────────────────────────────┤
│  Level 2: Component Tests                               │
│  - React components, Rust modules, isolated units       │
├─────────────────────────────────────────────────────────┤
│  Level 1: Unit Tests                                    │
│  - Functions, utilities, business logic                 │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Test Types

| Type | Focus Area | Tools |
|------|-----------|-------|
| Functional | Feature correctness per requirements | Jest, Vitest, pytest |
| UI/UX | Responsive design, accessibility | Playwright, axe-core |
| Security | Auth, injection, XSS, CSRF | OWASP ZAP, custom tests |
| Integration | API contracts, service boundaries | Supertest, curl suites |
| Regression | Prevent feature breakage | Automated CI suite |

---

## 4. Test Environment

### 4.1 Environment Matrix

| Environment | Purpose | Data |
|-------------|---------|------|
| `local` | Developer testing | Seeded mock data |
| `ci` | Automated pipeline | Fresh per-run fixtures |
| `staging` | Pre-release validation | Anonymized production-like |
| `prod` | Smoke tests only | Live (read-only checks) |

### 4.2 Required Test Data

- **Users:** 5 test accounts (admin, manager, agent-operator, viewer, unverified)
- **Agents:** 3 configured agents (idle, running, error states)
- **Companies:** 2 test companies with different permission levels
- **Issues:** 20+ issues across all statuses for dashboard testing

---

## 5. Feature Test Cases

### 5.1 User Authentication (OPE-9: Database Schema)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| AUTH-01 | User registration | 1. Navigate to signup<br>2. Enter valid email/password<br>3. Submit form | Account created, verification email sent | P0 |
| AUTH-02 | Login with valid credentials | 1. Enter registered credentials<br>2. Submit | Redirect to dashboard, session established | P0 |
| AUTH-03 | Login with invalid credentials | 1. Enter wrong password<br>2. Submit | Error message, no session created | P0 |
| AUTH-04 | Password reset flow | 1. Click forgot password<br>2. Enter email<br>3. Click reset link<br>4. Set new password | Password updated, can login with new | P1 |
| AUTH-05 | Session expiration | 1. Login<br>2. Wait for token expiry<br>3. Attempt action | Redirect to login page | P1 |

### 5.2 AI Agent Management (OPE-22: Creative Specialist Agents)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| AGENT-01 | Create new agent | 1. Click "New Agent"<br>2. Fill name, role, adapter<br>3. Save | Agent appears in list with correct config | P0 |
| AGENT-02 | Update agent configuration | 1. Select agent<br>2. Modify adapter settings<br>3. Save | Changes persisted, agent status updated | P0 |
| AGENT-03 | Delete agent | 1. Select agent<br>2. Click delete<br>3. Confirm | Agent removed, associated issues reassigned | P1 |
| AGENT-04 | Agent heartbeat status | 1. Create process agent with valid command<br>2. Wait for heartbeat | Status shows idle/running correctly | P1 |
| AGENT-05 | Agent error recovery | 1. Configure agent with invalid command<br>2. Trigger run<br>3. Fix config | Error state cleared on next successful run | P1 |

### 5.3 Dashboard (OPE-23: Modern AI Dashboard)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| DASH-01 | Dashboard loads | 1. Login<br>2. Navigate to dashboard | All widgets render without errors | P0 |
| DASH-02 | Real-time agent status | 1. Trigger agent run<br>2. Observe dashboard | Status indicator updates in real-time | P0 |
| DASH-03 | Issue filtering | 1. Click status filters<br>2. Verify counts | Correct issues displayed per filter | P1 |
| DASH-04 | Responsive layout | 1. Resize browser<br>2. Check mobile view | Layout adapts, no horizontal scroll | P1 |
| DASH-05 | Dark/light theme | 1. Toggle theme switch | All components reflect selected theme | P1 |

### 5.4 CI/CD Integration (OPE-8: GitHub Actions)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| CICD-01 | Webhook triggers build | 1. Push commit to main<br>2. Check pipeline | GitHub Actions workflow starts | P0 |
| CICD-02 | Build artifact creation | 1. Complete successful build<br>2. Check releases | Artifact uploaded to release storage | P1 |
| CICD-03 | Failed build notification | 1. Introduce build error<br>2. Push commit | Failure logged, notification sent | P1 |
| CICD-04 | Deployment to staging | 1. Tag release<br>2. Trigger deploy | Staging environment updated | P1 |

### 5.5 Marketing Analytics (OPE-12: Analytics Tracking)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| ANAL-01 | Page view tracking | 1. Visit landing page<br>2. Check analytics | Page view event recorded | P1 |
| ANAL-02 | Conversion tracking | 1. Complete signup<br>2. Check funnel | Conversion event fired with correct data | P1 |
| ANAL-03 | Dashboard analytics display | 1. Open analytics dashboard<br>2. Verify metrics | Data matches backend records | P1 |

### 5.6 Security Controls (OPE-11: Security Review)

| ID | Test Case | Steps | Expected Result | Priority |
|----|-----------|-------|-----------------|----------|
| SEC-01 | SQL injection prevention | 1. Enter SQL in search field<br>2. Submit | Input sanitized, no error exposure | P0 |
| SEC-02 | XSS prevention | 1. Enter script in agent name<br>2. Save | Script encoded, not executed | P0 |
| SEC-03 | CSRF protection | 1. Attempt cross-site form POST | Request rejected without valid token | P0 |
| SEC-04 | Role-based access control | 1. Login as viewer<br>2. Attempt admin action | Action denied with 403 | P0 |
| SEC-05 | Audit logging | 1. Perform sensitive action<br>2. Check logs | Action recorded with user + timestamp | P1 |

---

## 6. Test Schedule

| Phase | Activities | Duration | Owner |
|-------|-----------|----------|-------|
| Week 1 | Test environment setup, fixture creation | 3 days | QA Engineer |
| Week 1-2 | Unit + Component test development | 5 days | QA + Developers |
| Week 2 | Integration test development | 4 days | QA Engineer |
| Week 3 | E2E test development | 5 days | QA Engineer |
| Week 3 | Security testing | 3 days | Security Engineer |
| Week 4 | Regression suite execution | 3 days | QA Engineer |
| Week 4 | Bug fix verification | 2 days | QA + Developers |
| Week 5 | Final sign-off | 2 days | CTO 2 |

---

## 7. Entry/Exit Criteria

### Entry Criteria
- [ ] All P0 features implemented and deployed to staging
- [ ] Unit test coverage ≥ 70% for new code
- [ ] Test environment provisioned and stable
- [ ] Test data fixtures prepared and validated

### Exit Criteria
- [ ] 100% of P0 test cases passed
- [ ] ≤ 5 open P1 bugs (none critical)
- [ ] Security scan with no high/critical findings
- [ ] Performance baseline established (page load < 3s)
- [ ] Test report reviewed and approved by CTO 2

---

## 8. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Agent adapter testing requires live LLM keys | High | Medium | Use mock adapters in CI, live in staging |
| Dashboard data depends on background jobs | Medium | High | Add job status endpoints for test synchronization |
| Cross-browser compatibility issues | Medium | Medium | Test on Chrome, Firefox, Safari in CI |
| Flaky E2E tests due to timing | Medium | High | Implement retry logic, explicit waits |

---

## 9. Test Deliverables

1. **This Test Plan** (OPE-13)
2. **Test Cases** (spreadsheet or TestRail project)
3. **Automated Test Suite** (repository: `/tests`)
4. **Bug Reports** (GitHub Issues with `qa` label)
5. **Test Summary Report** (post-execution)

---

## 10. Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Engineer | CTO 2 | 2026-05-26 | [Pending] |
| CTO | [CTO Agent] | [Pending] | [Pending] |
| CEO | [CEO Agent] | [Pending] | [Pending] |

---

*This document is a living document and will be updated as the project evolves.*
