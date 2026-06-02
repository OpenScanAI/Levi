# OpenScanAI Dashboard — Design System

## Color Palette (Dark Theme)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#0B0F19` | Main page background |
| `--bg-secondary` | `#111827` | Cards, panels, sidebar |
| `--bg-tertiary` | `#1A2235` | Hover states, elevated surfaces |
| `--accent-primary` | `#6366F1` | Primary buttons, active nav, highlights |
| `--accent-secondary` | `#8B5CF6` | Gradients, secondary accents |
| `--accent-success` | `#10B981` | Positive metrics, online status |
| `--accent-warning` | `#F59E0B` | Alerts, warnings |
| `--accent-danger` | `#EF4444` | Errors, critical alerts |
| `--text-primary` | `#F9FAFB` | Headings, primary text |
| `--text-secondary` | `#9CA3AF` | Labels, secondary text |
| `--text-muted` | `#6B7280` | Timestamps, hints |
| `--border` | `#1F2937` | Card borders, dividers |
| `--border-hover` | `#374151` | Hover borders |

## Typography

| Element | Font | Weight | Size | Line Height |
|---------|------|--------|------|-------------|
| H1 | Inter | 700 | 28px | 1.2 |
| H2 | Inter | 600 | 20px | 1.3 |
| H3 | Inter | 600 | 16px | 1.4 |
| Body | Inter | 400 | 14px | 1.5 |
| Caption | Inter | 500 | 12px | 1.4 |
| Metric | Inter | 700 | 32px | 1.1 |

## Spacing Scale

| Token | Value |
|-------|-------|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-10` | 40px |

## Border Radius

| Token | Value |
|-------|-------|
| `--radius-sm` | 6px |
| `--radius-md` | 10px |
| `--radius-lg` | 14px |
| `--radius-xl` | 20px |

## Shadows

| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.5)` |
| `--shadow-glow` | `0 0 20px rgba(99,102,241,0.15)` |

## Component Patterns

### Card
- Background: `--bg-secondary`
- Border: 1px solid `--border`
- Border-radius: `--radius-lg`
- Padding: `--space-5`
- Hover: border-color transitions to `--border-hover`, subtle `--shadow-md`

### Sidebar Nav Item
- Padding: `--space-3` `--space-4`
- Border-radius: `--radius-md`
- Active: background `--accent-primary` at 15% opacity, text `--accent-primary`
- Hover: background `--bg-tertiary`

### Button (Primary)
- Background: `--accent-primary`
- Text: white
- Padding: `--space-3` `--space-5`
- Border-radius: `--radius-md`
- Hover: brightness 1.1, `--shadow-glow`

## Responsive Breakpoints

| Name | Width | Layout Change |
|------|-------|---------------|
| Mobile | < 768px | Single column, sidebar becomes drawer |
| Tablet | 768–1024px | 2-column grid, collapsed sidebar |
| Desktop | > 1024px | Full layout, expanded sidebar |
