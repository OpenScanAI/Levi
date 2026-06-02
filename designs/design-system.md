# OpenScanAI Dashboard — Design System & UI Spec

## 1. Layout Structure

```
App
├── Sidebar (fixed, 260px)
│   ├── Brand (logo + name)
│   ├── Navigation (grouped links)
│   └── User Profile
└── Main Content
    ├── Header (sticky, 64px)
    │   ├── Page Title + Breadcrumb
    │   └── Search + Actions
    └── Dashboard Content
        ├── Stats Row (4 cards)
        ├── Two-Column Section
        │   ├── Chart Card
        │   └── Activity Feed
        ├── Agents Grid (3 cards)
        └── Status Bar
```

## 2. Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#0B0F19` | Page background |
| `--bg-secondary` | `#111827` | Sidebar background |
| `--bg-card` | `#1A1F2E` | Card surfaces |
| `--bg-card-hover` | `#222A3A` | Hover state |
| `--text-primary` | `#F1F5F9` | Headings, primary text |
| `--text-secondary` | `#94A3B8` | Body text |
| `--text-muted` | `#64748B` | Labels, placeholders |
| `--accent-primary` | `#6366F1` | Primary indigo |
| `--accent-secondary` | `#8B5CF6` | Purple accent |
| `--success` | `#10B981` | Positive metrics |
| `--warning` | `#F59E0B` | Warnings, idle |
| `--danger` | `#EF4444` | Errors, alerts |
| `--info` | `#3B82F6` | Info states |

## 3. Typography

- **Font**: Inter (Google Fonts)
- **Weights**: 300, 400, 500, 600, 700
- **Scale**:
  - Page Title: 20px / weight 600
  - Card Title: 15px / weight 600
  - Body: 13-14px / weight 400-500
  - Labels: 11-12px / weight 500 / uppercase for nav
  - Stats Value: 28px / weight 700

## 4. Spacing System

- **Base unit**: 4px
- **Common values**: 8, 12, 16, 20, 24, 28px
- **Card padding**: 20px
- **Section gap**: 28px
- **Grid gap**: 20px

## 5. Component Specs

### Stat Card
- Background: `--bg-card`
- Border: 1px solid `--border-subtle`
- Border radius: 12px
- Padding: 20px
- Hover: translateY(-1px) + shadow-md
- Icon container: 32x32px, colored background at 10% opacity

### Agent Card
- Same base as Stat Card
- Status dot: 8px circle with glow
- Metrics: 2-column grid, centered

### Chart Area
- Height: 260px
- Bars: gradient from accent to transparent
- Hover: opacity 0.8 → 1.0

## 6. UX Recommendations

1. **Progressive Disclosure**: Show summary stats first, drill down via "View Report" links
2. **Color Coding**: Use consistent semantic colors (green=good, amber=attention, red=problem)
3. **Real-time Feedback**: Status dots and "Last updated" timestamp build trust
4. **Responsive Priority**: Stack cards on tablet, hide sidebar on mobile (hamburger)
5. **Empty States**: Design placeholder for "No recent activity" and "No agents running"
6. **Loading Skeletons**: Use pulsing `--bg-card-hover` blocks while data loads

## 7. Responsive Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| > 1200px | Full layout, 4-col stats, 3-col agents |
| ≤ 1200px | 2-col stats, 1-col two-col section, 2-col agents |
| ≤ 768px | Hidden sidebar, stacked everything |

## 8. Accessibility Notes

- All icons have context via adjacent text labels
- Color alone does not convey meaning (icons + text always paired)
- Focus states: 2px outline in `--accent-primary`
- Minimum contrast ratio: 4.5:1 for body text
