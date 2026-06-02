# OpenScanAI — Modern AI Dashboard Layout Design

## Overview
A premium dark-themed AI SaaS dashboard that serves as the central command center for OpenScanAI's automation, agents, and system control.

---

## Layout Structure

### 1. Global Shell
- **Top Navigation Bar**: Fixed height 64px. Contains logo, global search, notification bell, user avatar dropdown.
- **Sidebar Navigation**: Collapsible, 260px expanded / 72px collapsed. Icons + labels.
- **Main Content Area**: Fluid width, scrollable. Padding 24px.
- **Right Context Panel**: Optional 320px panel for details/inspector (collapsible).

### 2. Responsive Breakpoints
- Desktop: 1440px+ (full layout)
- Tablet: 768px–1439px (sidebar collapses to icons only, right panel hidden)
- Mobile: <768px (sidebar becomes bottom nav or hamburger menu, stacked cards)

---

## UI Section Breakdown

### Sidebar Navigation
1. Dashboard (home icon)
2. Agents (robot icon)
3. Automations (bolt icon)
4. Analytics (chart icon)
5. Logs / Activity (list icon)
6. Settings (gear icon)

Each item has an active state with a left 3px accent border and subtle background glow.

### Dashboard Home View
- **Welcome Header**: "Good morning, [User]" + current date + quick-action chips.
- **KPI Analytics Cards Row** (4 cards):
  - Active Agents (count + sparkline)
  - Tasks Completed Today (count + % change)
  - System Health (status badge + uptime)
  - API Requests (count + rate graph)
- **Main Content Grid**:
  - Left column (2/3): Live Agent Activity Feed (scrollable list with status badges)
  - Right column (1/3): Quick Stats & Recent Alerts
- **Bottom Section**: Performance Chart (line chart, last 7 days)

### Agents View
- Agent cards in a responsive grid (3 cols desktop, 2 tablet, 1 mobile)
- Each card: avatar, name, status dot, last active, action buttons (pause, logs, config)

### Analytics View
- Date range picker top-right
- Tab switcher: Overview, Agents, API Usage, Errors
- Full-width charts with drill-down capability

---

## UX Recommendations

1. **Progressive Disclosure**: Show summary metrics first; let users expand for detail. Reduces cognitive load.
2. **Status At-a-Glance**: Use color-coded dots (green=healthy, yellow=warning, red=critical) consistently across all views.
3. **Empty States**: Every list/chart should have a designed empty state with a CTA, never a blank screen.
4. **Loading Skeletons**: Use shimmer skeletons instead of spinners for perceived performance.
5. **Keyboard Shortcuts**: `/` for search, `g+d` for Dashboard, `g+a` for Agents, `esc` to close panels.
6. **Dark Mode First**: Design for #0F1115 background, #1A1D24 cards, #E8EAED primary text. Light mode is optional later.
7. **Micro-interactions**: Subtle hover lifts on cards (translateY -2px), smooth 200ms transitions on all state changes.

---

## Design System Suggestions

### Color Palette (Dark)
- Background: `#0F1115`
- Surface / Card: `#1A1D24`
- Border: `#2A2E37`
- Primary Text: `#E8EAED`
- Secondary Text: `#9AA0A6`
- Accent / Brand: `#4F46E5` (indigo)
- Success: `#22C55E`
- Warning: `#EAB308`
- Error: `#EF4444`

### Typography
- Font: Inter (Google Fonts) or system-ui fallback
- Headings: 600 weight, tight tracking (-0.02em)
- Body: 400 weight, 1.5 line-height
- Mono: JetBrains Mono for data/numbers

### Spacing Scale
- Base unit: 4px
- Common: 4, 8, 12, 16, 24, 32, 48, 64

### Shadows (for depth in dark mode)
- Card: `0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)`
- Elevated: `0 10px 15px -3px rgba(0,0,0,0.4), 0 4px 6px -2px rgba(0,0,0,0.2)`

### Border Radius
- Cards: 12px
- Buttons: 8px
- Pills / Tags: 9999px
- Inputs: 6px

---

## Deliverables
- This design document
- Recommended next step: Create a React + Tailwind prototype or Figma wireframes
