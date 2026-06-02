# OpenScanAI — Modern AI Dashboard UI Design

## Overview
A premium dark-themed AI control dashboard that unifies automation, agents, and system monitoring into a single cohesive interface. The design language emphasizes clarity, depth, and futuristic professionalism.

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar (240px)  │  Top Bar (64px)                         │
│                   ├─────────────────────────────────────────┤
│  Logo             │                                         │
│  ─────────────    │  Main Content Area (fluid)              │
│  Dashboard        │                                         │
│  Agents           │  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  Automations      │  │  KPI 1  │ │  KPI 2  │ │  KPI 3  │   │
│  Analytics        │  └─────────┘ └─────────┘ └─────────┘   │
│  Settings         │                                         │
│  ─────────────    │  ┌─────────────────────────────────┐   │
│  Agent Status     │  │      Main Chart / Activity      │   │
│    ● Online (8)   │  └─────────────────────────────────┘   │
│    ○ Offline (2)  │                                         │
│                   │  ┌─────────────┐ ┌─────────────────┐   │
│                   │  │ Agent List  │ │ Recent Activity │   │
│                   │  └─────────────┘ └─────────────────┘   │
│                   │                                         │
└───────────────────┴─────────────────────────────────────────┘
```

---

## Design System

### Color Palette (Dark Theme)
| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#0B0F19` | Page background |
| `--bg-surface` | `#111827` | Cards, panels |
| `--bg-elevated` | `#1F2937` | Hover states, dropdowns |
| `--border-subtle` | `#374151` | Dividers, borders |
| `--border-accent` | `#4F46E5` | Focus rings, active indicators |
| `--text-primary` | `#F9FAFB` | Headings, primary text |
| `--text-secondary` | `#9CA3AF` | Labels, descriptions |
| `--text-muted` | `#6B7280` | Timestamps, meta |
| `--accent-primary` | `#6366F1` | Primary actions, highlights |
| `--accent-secondary` | `#8B5CF6` | Gradients, secondary highlights |
| `--success` | `#10B981` | Online, success states |
| `--warning` | `#F59E0B` | Warnings, attention |
| `--danger` | `#EF4444` | Errors, offline |

### Typography
| Element | Font | Size | Weight | Line Height |
|---------|------|------|--------|-------------|
| Page Title | Inter | 24px | 600 | 1.2 |
| Card Title | Inter | 16px | 500 | 1.4 |
| Body | Inter | 14px | 400 | 1.5 |
| Label | Inter | 12px | 500 | 1.4 |
| Mono (data) | JetBrains Mono | 13px | 400 | 1.4 |

### Spacing Scale
- `xs`: 4px
- `sm`: 8px
- `md`: 16px
- `lg`: 24px
- `xl`: 32px
- `2xl`: 48px

### Border Radius
- Cards: `12px`
- Buttons: `8px`
- Badges/Pills: `9999px`
- Inputs: `6px`

---

## UI Section Breakdown

### 1. Sidebar Navigation
- **Width**: 240px, fixed
- **Background**: `--bg-surface` with 1px right border `--border-subtle`
- **Logo Area**: 64px height, centered logo + wordmark "OpenScanAI"
- **Nav Items**: Icon (20px) + Label, 40px height, 12px radius on hover
- **Active State**: Left 3px accent bar (`--accent-primary`) + subtle background tint
- **Agent Status Footer**: Compact summary of online/offline agent counts with colored dots

### 2. Top Bar
- **Height**: 64px
- **Left**: Breadcrumb / page title
- **Right**: 
  - Global search input (240px, ghost style)
  - Notification bell with unread dot
  - User avatar (32px circle) with dropdown

### 3. KPI Cards Row
- **Layout**: 3-4 column grid, equal width
- **Card Content**:
  - Label (text-secondary, 12px)
  - Value (text-primary, 28px, semibold)
  - Change indicator (arrow + %, colored)
  - Mini sparkline (optional, 40px height)
- **Examples**: Active Agents, Tasks Completed, System Uptime, API Calls/min

### 4. Main Chart Area
- **Height**: ~320px
- **Content**: Activity over time (line/area chart)
- **Styling**: Gradient fill under line, subtle gridlines, tooltip on hover
- **Controls**: Time range selector (1H, 24H, 7D, 30D) as pill toggle

### 5. Bottom Split Panel
- **Left (60%)**: Agent List Table
  - Columns: Name, Status (dot + label), Type, Last Activity, Actions
  - Row height: 48px
  - Status dot: 8px circle, animated pulse when online
- **Right (40%)**: Recent Activity Feed
  - Vertical list of events
  - Each item: Icon + Description + Timestamp
  - Auto-scroll with "View All" link

---

## UX Recommendations

1. **Progressive Disclosure**: Show summary data by default; expand cards for detailed breakdowns. Keep the initial view scannable.

2. **Real-time Feedback**: Agent status dots should pulse gently when active. Activity feed should update with subtle slide-in animation.

3. **Keyboard Navigation**: Ensure sidebar items and top-bar actions are fully keyboard accessible (Tab order, Enter to activate).

4. **Responsive Behavior**:
   - `< 1024px`: Collapse sidebar to 64px icon-only mode
   - `< 768px`: Hide sidebar behind hamburger menu; stack KPI cards 2x2; bottom panel stacks vertically
   - `< 480px`: Single column everything

5. **Empty States**: Design graceful empty states for "No Agents Running" and "No Recent Activity" with CTAs to create agents or view docs.

6. **Loading Skeletons**: Use animated pulse blocks matching the card structure while data loads — never show blank space.

7. **Tooltips**: Hovering over KPI values shows definition/context. Hovering chart points shows precise values.

---

## Component Inventory

| Component | Purpose |
|-----------|---------|
| `Sidebar` | Navigation + context |
| `TopBar` | Global actions + identity |
| `KpiCard` | Metric summary |
| `AreaChart` | Time-series visualization |
| `AgentTable` | Tabular agent listing |
| `ActivityFeed` | Event stream |
| `StatusDot` | Online/offline/busy indicator |
| `TimeRangePills` | Chart period selector |
| `IconButton` | Compact action buttons |
| `Avatar` | User/agent identity |

---

## Tech Stack Suggestions
- **Framework**: React + TypeScript
- **Styling**: Tailwind CSS or CSS Modules with CSS variables
- **Charts**: Recharts or Tremor
- **Icons**: Lucide React
- **Animations**: Framer Motion for transitions
- **Fonts**: Inter (Google Fonts), JetBrains Mono (optional)
