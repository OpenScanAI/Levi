# OpenScanAI — React Landing Page Design

## Overview
A modern, responsive landing page for OpenScanAI built with React. Designed to establish brand presence and convert visitors into early adopters.

---

## Tech Stack
- React 18+ (functional components + hooks)
- CSS Modules or Tailwind CSS (recommend Tailwind for speed)
- React Router (if multi-page later; single page for MVP)
- Optional: Framer Motion for scroll animations

---

## Page Sections (Top to Bottom)

### 1. Navigation Bar
- Fixed top, height 64px, blur backdrop
- Left: OpenScanAI logo (text or icon + wordmark)
- Center: anchor links (Features, How It Works, Pricing, Docs)
- Right: "Get Started" CTA button + GitHub icon link
- Mobile: hamburger menu -> slide-down drawer

### 2. Hero Section
- Full viewport height (100vh) or min-height 600px
- Background: dark gradient (#0F1115 -> #1A1D24) with subtle animated mesh/noise
- Headline: "AI Agents That Actually Ship"
- Subheadline: 1-2 sentences on automation + dashboard + control
- Primary CTA: "Start Building" (accent color)
- Secondary CTA: "View Demo" (ghost button)
- Right side or below: hero illustration / product screenshot / 3D abstract shape
- Scroll indicator at bottom (animated chevron)

### 3. Social Proof / Logos Bar
- "Trusted by teams at" + 4-6 grayscale company logos (placeholder names)
- Horizontal row, evenly spaced, opacity 0.6

### 4. Features Grid
- Section title: "Everything You Need to Run AI at Scale"
- 3x2 grid of feature cards (responsive: 2 cols tablet, 1 col mobile)
- Each card: icon (48px), title, 2-line description
- Features:
  1. Multi-Agent Orchestration
  2. Real-Time Dashboard
  3. Secure by Default
  4. CI/CD Integration
  5. Analytics & Observability
  6. Extensible Plugin System

### 5. How It Works
- 3-step horizontal timeline (vertical on mobile)
- Step 1: Connect → Step 2: Configure → Step 3: Deploy
- Each step: number badge, title, short description, small illustration

### 6. Pricing Section
- 3 tiers: Starter (free), Pro, Enterprise
- Cards with clear feature lists and CTA buttons
- Highlight "Pro" as recommended (subtle border glow)

### 7. FAQ Accordion
- 5-6 common questions
- Expand/collapse with smooth height transition

### 8. Final CTA Banner
- Full-width dark band with gradient
- Headline: "Ready to Automate?"
- Button: "Get Started for Free"

### 9. Footer
- 4 columns: Product, Resources, Company, Legal
- Bottom row: copyright + social icons

---

## Responsive Breakpoints
- Desktop: 1280px+ (full layout, side-by-side hero)
- Tablet: 768px–1279px (stacked hero, 2-col grids)
- Mobile: <768px (single column, hamburger nav, reduced padding)

---

## Design Tokens (Dark Theme)
- Background: `#0F1115`
- Surface: `#1A1D24`
- Border: `#2A2E37`
- Primary Text: `#E8EAED`
- Secondary Text: `#9AA0A6`
- Accent: `#4F46E5`
- Accent Hover: `#4338CA`
- Success: `#22C55E`

---

## Component Breakdown
- `Navbar`
- `HeroSection`
- `LogoBar`
- `FeatureCard` (reused 6x)
- `FeaturesSection`
- `HowItWorksStep` (reused 3x)
- `HowItWorksSection`
- `PricingCard` (reused 3x)
- `PricingSection`
- `FAQItem` (reused 6x)
- `FAQSection`
- `CTABanner`
- `Footer`

---

## Assets Needed
- OpenScanAI logo (SVG)
- Hero illustration or abstract 3D render
- 6 feature icons (Lucide React recommended)
- 3 step illustrations (simple line art)
- Social proof logos (placeholder SVGs)

---

## Performance Targets
- Lighthouse Performance: 90+
- First Contentful Paint: <1.5s
- Lazy-load below-fold sections with Intersection Observer

---

## Next Steps
1. Scaffold React project with Vite
2. Install Tailwind + Lucide React
3. Build sections in order (Navbar -> Hero -> ... -> Footer)
4. Add Framer Motion scroll animations
5. Deploy to Vercel / Netlify
