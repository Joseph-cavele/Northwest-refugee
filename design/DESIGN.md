---
name: Aureate Refuge
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#4c4546'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#7e7576'
  outline-variant: '#cfc4c5'
  surface-tint: '#5e5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1b'
  on-primary-container: '#848484'
  inverse-primary: '#c6c6c6'
  secondary: '#5d5f5f'
  on-secondary: '#ffffff'
  secondary-container: '#dfe0e0'
  on-secondary-container: '#616363'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#241a00'
  on-tertiary-container: '#a08000'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#ffe088'
  tertiary-fixed-dim: '#e9c349'
  on-tertiary-fixed: '#241a00'
  on-tertiary-fixed-variant: '#574500'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 72px
    fontWeight: '800'
    lineHeight: 80px
    letterSpacing: -0.04em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
---

## Brand & Style

The design system is engineered to position the North West House of Refuge (NWHR) at the intersection of humanitarian urgency and premium SaaS sophistication. The brand personality is authoritative yet deeply empathetic, utilizing a high-end minimalist aesthetic to evoke trust and institutional stability. 

By blending **Minimalism** with subtle **Glassmorphism**, the UI creates a sense of transparency and modern professionalism. The emotional response is one of empowered hope—moving away from traditional "charity" aesthetics toward a "social impact enterprise" feel. Large whitespace, precision-engineered layouts, and high-contrast accents define the visual narrative.

## Colors

The palette is strictly curated to convey prestige and clarity. 
- **Primary (Black):** Used for primary text, structural elements, and high-impact backgrounds to provide a "grounded" feel.
- **Secondary (White):** The dominant canvas color, ensuring the interface feels open and airy.
- **Accent (Metallic Gold):** Reserved exclusively for calls to action, progress indicators, and critical highlights. It represents value and the "gold standard" of care.
- **Neutral (Off-White):** Used for subtle section nesting and background depth.

Glassmorphic elements utilize a 60% opacity white with a 12px background blur to create layered hierarchy without introducing heavy colors.

## Typography

This design system utilizes **Inter** exclusively to maintain a cohesive, systematic SaaS appearance. The typographic hierarchy relies on extreme scale and weight contrast rather than font variety. 

Large display heads use heavy weights (800) and tight tracking to create a "bold statement" effect suitable for impact headlines. Body text is optimized for readability with generous line heights. Labels use all-caps and increased tracking for a clean, architectural look in navigation and metadata.

## Layout & Spacing

The layout philosophy follows a **fixed-fluid hybrid grid**. The content is centered within a 1280px container on desktop, utilizing a 12-column system. 

- **Desktop:** Large external margins (64px) to emphasize exclusivity and focus.
- **Mobile:** Margins reduce to 20px, with a 4-column grid.
- **Spacing Rhythm:** An 8px linear scale is used. Components are spaced using 32px, 64px, or 128px intervals to maintain the minimalist "breathable" feel. Padding within glassmorphic cards should be at least 40px to feel premium.

## Elevation & Depth

Depth is conveyed through **Glassmorphism** and **Ambient Shadows** rather than traditional stacking.
- **The Base:** Pure white (#FFFFFF) or light grey (#F9FAFB).
- **The Elevated Layer:** Semi-transparent white (rgba(255, 255, 255, 0.6)) with a 1px solid white border at 20% opacity. 
- **Shadows:** Use extremely soft, long-range shadows (e.g., `0 20px 40px rgba(0,0,0,0.05)`) to make elements appear to float gently above the surface. This creates a tactile, premium feel without visual clutter.

## Shapes

The shape language is defined by "Large Roundedness." Standard UI components like input fields and buttons use a **0.5rem (8px)** radius, while larger containers, cards, and modal sheets utilize a **1.5rem (24px)** radius. This softness balances the starkness of the black-and-white color palette, making the humanitarian mission feel approachable and kind.

## Components

### Buttons
- **Primary:** Metallic Gold (#D4AF37) background with Black (#000000) text. Bold weight, 0.5rem radius.
- **Secondary:** Black background with White text for high-contrast secondary actions.
- **Ghost:** Transparent background with a 1px Black or Gold border.

### Glass Cards
Containers used for impact metrics or donor stories. Features a `backdrop-filter: blur(12px)`, a 24px corner radius, and a subtle 1px white border.

### Inputs & Fields
Minimalist styling. Bottom-border only or very light grey stroke (#E5E7EB). Focus state transitions the border to Metallic Gold.

### Progress Indicators
Used for fundraising goals. The track is light grey (#F3F4F6) and the fill is a solid Metallic Gold.

### Chips/Tags
Small, pill-shaped elements with #F9FAFB backgrounds and 14px semi-bold text, used for categorizing relief efforts.