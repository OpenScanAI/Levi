# OpenScanAI — Modern AI Dashboard Layout Design

## Overview

A premium dark-themed AI control dashboard that serves as the central nervous system for OpenScanAI. The design emphasizes clarity, speed, and trust — critical emotions for users managing AI agents and automation workflows.

---

## Layout Structure

### Grid System
- **Desktop**: 12-column grid, 24px gutter, max container 1440px
- **Tablet**: 8-column grid, 20px gutter
- **Mobile**: 4-column grid, 16px gutter

### Core Layout Zones

```
+--------------------------------------------------+
|  SIDEBAR  |  HEADER (breadcrumb, search, user)   |
|           +--------------------------------------+
|  (fixed)  |                                      |
|           |  MAIN CONTENT AREA                   |
|  240px    |  (scrollable)                        |
|           |                                      |
|           |  +------------+ +----------------+   |
|           |  |  KPI ROW   | |  KPI ROW       |   |
|           |  +------------+ +----------------+   |
|           |                                      |
|           |  +--------------------------------+  |
|           |  |      ANALYTICS CHARTS          |  |
|           |  +--------------------------------+  |
|           |                                      |
|           |  +------------+ +----------------+   |
|           |  |  AGENT     | |  ACTIVITY      |   |
|           |  |  STATUS    | |  FEED          |   |
|           |  +------------+ +----------------+   |
|           |                                      |
+--------------------------------------------------+
```

---

## UI Section Breakdown

### 1. Sidebar Navigation
- **Width**: 240px (collapsible to 64px on hover/toggle)
- **Background**: `var(--bg-elevated)` with 1px right border `var(--border-subtle)`
- **Elements**:
  - Logo mark + wordmark at top
  - Primary nav items: Dashboard, Agents, Workflows, Analytics, Settings
  - Each item: icon (20px) + label + optional badge count
  - Active state: left 3px accent bar + elevated background
  - Bottom section: User profile mini-card

### 2. Header
- **Height**: 64px
- **Background**: `var(--bg-base)` with subtle bottom border
- **Left**: Breadcrumb / page title
- **Center**: Global search bar (glassmorphism, 320px, placeholder "Search agents, workflows...")
- **Right**: Notification bell (with dot indicator), Theme toggle, User avatar dropdown

### 3. KPI Cards Row
- **Layout**: 4-column grid on desktop, 2x2 on tablet, stack on mobile
- **Card specs**:
  - Background: `var(--bg-card)` with `backdrop-filter: blur(12px)`
  - Border: 1px `var(--border-subtle)`
  - Border-radius: 12px
  - Padding: 20px
  - Each card: metric label (small, muted), large metric value (32px, bold), trend indicator (up/down arrow + %), mini sparkline chart
- **Metrics**:
  - Active Agents
  - Tasks Completed (24h)
  - Avg Response Time
  - System Health Score

### 4. Analytics Charts Section
- **Layout**: Full-width card, height ~400px
- **Background**: same glassmorphism card style
- **Contents**:
  - Tab switcher: "Activity", "Performance", "Costs"
  - Main area: Line/area chart (time-series)
  - Right sidebar (inside card): Summary stats for selected period
  - Time range selector: 1H, 24H, 7D, 30D

### 5. Agent Status Panel
- **Layout**: 1/3 width on desktop, full-width on mobile
- **Contents**:
  - Header: "Active Agents" + "View All" link
  - List of agent cards (compact):
    - Avatar/status dot (green/yellow/red)
    - Agent name + role
    - Current task snippet
    - Uptime indicator
  - Empty state: "No active agents" with CTA to deploy

### 6. Activity Feed
- **Layout**: 1/3 width on desktop, full-width on mobile
- **Contents**:
  - Header: "Recent Activity" + filter dropdown
  - Scrollable list of event items:
    - Icon (colored by event type)
    - Event description
    - Timestamp (relative: "2m ago")
    - Optional: "View" action link
  - Event types: agent_started, task_completed, alert_triggered, deployment

---

## UX Recommendations

### Information Hierarchy
1. **Immediate**: KPIs at top — users should grasp system health in <3 seconds
2. **Contextual**: Charts in middle — trends and patterns for deeper understanding
3. **Actionable**: Agent status + activity at bottom — what needs attention right now

### Interaction Patterns
- **Hover states**: All cards lift slightly (`translateY(-2px)`) with enhanced shadow
- **Loading states**: Skeleton screens matching card shapes, never spinners on initial load
- **Empty states**: Always include an icon, helpful message, and primary CTA
- **Error states**: Inline card-level errors, never full-page crash screens

### Responsive Behavior
- **< 768px**: Sidebar becomes a bottom nav (icon-only, 5 items)
- **< 1024px**: KPI cards go 2x2, charts stack full-width
- **> 1440px**: Content area centers with max-width, sidebar stays fixed left

### Accessibility
- All interactive elements have visible focus rings (2px offset, accent color)
- Color is never the sole indicator — always pair with icon or text
- Minimum touch target: 44x44px on mobile
- Respect `prefers-reduced-motion`: disable transforms/animations

---

## Design System Suggestions

### Color Palette (Dark Theme)
```
--bg-base:        #0a0e1a
--bg-elevated:    #111827
--bg-card:        rgba(17, 24, 39, 0.7)
--text-primary:   #f3f4f6
--text-secondary: #9ca3af
--text-muted:     #6b7280
--accent-primary: #3b82f6
--accent-success: #10b981
--accent-warning: #f59e0b
--accent-danger:  #ef4444
--border-subtle:  rgba(255, 255, 255, 0.08)
--border-focus:   rgba(59, 130, 246, 0.5)
```

### Typography
- **Font family**: Inter (system fallback: -apple-system, BlinkMacSystemFont, 'Segoe UI')
- **Scale**:
  - Display: 32px / 700 / -0.02em
  - H1: 24px / 600 / -0.01em
  - H2: 20px / 600 / 0
  - Body: 14px / 400 / 0
  - Small: 12px / 500 / 0.01em
- **Line heights**: Headings 1.2, Body 1.5

### Spacing Scale
```
4px  (xs)
8px  (sm)
12px (md)
16px (lg)
20px (xl)
24px (2xl)
32px (3xl)
48px (4xl)
```

### Shadows & Effects
```
Card shadow: 0 4px 24px rgba(0, 0, 0, 0.25)
Elevated shadow: 0 8px 32px rgba(0, 0, 0, 0.35)
Glassmorphism: backdrop-filter: blur(12px) saturate(180%)
Card border-radius: 12px
Button border-radius: 8px
```

### Animation Tokens
```
Duration fast:   150ms
Duration normal: 250ms
Duration slow:   350ms
Easing default:  cubic-bezier(0.4, 0, 0.2, 1)
Easing bounce:   cubic-bezier(0.34, 1.56, 0.64, 1)
```

### Component Primitives
- **Buttons**:
  - Primary: accent bg, white text, hover brightness 110%
  - Secondary: transparent bg, border, hover elevated bg
  - Ghost: transparent, hover subtle bg
- **Inputs**: bg-elevated, 1px border, focus ring accent
- **Badges**: pill shape, small text, colored by sentiment
- **Tooltips**: dark bg, rounded, 8px padding, 200ms fade

---

## Deliverables Summary

| Deliverable | Status |
|-------------|--------|
| Layout structure (grid + zones) | Complete |
| UI section breakdown (6 sections) | Complete |
| UX recommendations | Complete |
| Responsive behavior rules | Complete |
| Design system (colors, type, spacing, effects) | Complete |

---

*Design by CTO 2 | OpenScanAI Design System v1.0*
