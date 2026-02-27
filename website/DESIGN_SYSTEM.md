# Napper Design System

## Brand Identity

Napper is a CLI-first, developer-focused API testing tool. The brand conveys
**power**, **precision**, and **speed** — like its lightning bolt logo.

## Logo

Dark navy rounded square with white lightning-bolt code brackets (`</ />`).
The logo represents the fusion of code and speed.

## Color Palette

### Primary Colors

| Token             | Light          | Dark           | Usage                    |
|-------------------|----------------|----------------|--------------------------|
| `--color-navy`    | `#1B4965`      | `#1B4965`      | Logo bg, headings, brand |
| `--color-steel`   | `#2D6A8F`      | `#5BA4CF`      | Links, interactive       |
| `--color-sky`     | `#BEE3F8`      | `#1A3A52`      | Highlights, badges       |

### Accent Colors

| Token             | Value          | Usage                          |
|-------------------|----------------|--------------------------------|
| `--color-coral`   | `#E8734A`      | Primary CTA, warnings          |
| `--color-amber`   | `#F5A623`      | Secondary CTA, highlights      |
| `--color-teal`    | `#0D9488`      | Success states, assertions     |

### Neutrals

| Token             | Light          | Dark           |
|-------------------|----------------|----------------|
| `--color-bg`      | `#FAFBFC`      | `#0F1419`      |
| `--color-surface` | `#FFFFFF`      | `#1A2332`      |
| `--color-border`  | `#E2E8F0`      | `#2D3748`      |
| `--color-text`    | `#1A202C`      | `#E2E8F0`      |
| `--color-muted`   | `#64748B`      | `#94A3B8`      |

### HTTP Method Colors

| Method   | Color     | Token               |
|----------|-----------|----------------------|
| GET      | `#0D9488` | `--color-method-get` |
| POST     | `#E8734A` | `--color-method-post`|
| PUT      | `#F5A623` | `--color-method-put` |
| DELETE   | `#DC2626` | `--color-method-del` |
| PATCH    | `#7C3AED` | `--color-method-patch`|

## Typography

- **Headings**: `Inter`, system-ui fallback — bold, tight tracking
- **Body**: `Inter`, system-ui fallback — regular weight, 1.7 line height
- **Code**: `JetBrains Mono`, `Fira Code`, monospace fallback

### Scale

| Element | Size    | Weight | Tracking   |
|---------|---------|--------|------------|
| H1      | 3.5rem  | 800    | -0.03em    |
| H2      | 2.25rem | 700    | -0.02em    |
| H3      | 1.5rem  | 600    | -0.01em    |
| Body    | 1.05rem | 400    | normal     |
| Small   | 0.875rem| 400    | normal     |
| Code    | 0.9rem  | 400    | normal     |

## Spacing

8px base grid. Tokens: `--space-1` (4px) through `--space-16` (128px).

## Borders & Radius

- Cards: `12px` radius, `1px` border
- Buttons: `8px` radius
- Code blocks: `8px` radius
- Badges/pills: `9999px` radius (full round)

## Shadows

- `--shadow-sm`: `0 1px 2px rgba(0,0,0,0.05)`
- `--shadow-md`: `0 4px 12px rgba(0,0,0,0.08)`
- `--shadow-lg`: `0 12px 32px rgba(0,0,0,0.12)`
- `--shadow-glow`: `0 0 40px rgba(27,73,101,0.15)` (brand glow)

## Components

### Buttons

- **Primary**: Coral bg, white text, hover darkens 10%
- **Secondary**: Transparent, navy border, navy text, hover fills
- **Ghost**: No border, muted text, hover shows surface bg

### Code Blocks

- Dark background regardless of theme (`#0F1419`)
- Syntax highlighting with brand-aligned palette
- Top bar with language label and copy button

### Cards

- Surface background, subtle border, `shadow-sm`
- Hover lifts with `shadow-md` and subtle translate-y

### Feature Grid

- 3-column grid on desktop, single column mobile
- Icon + title + description pattern
- Alternating accent icon colors

## Animation

- Transitions: `150ms ease` for interactive elements
- Hero entrance: fade-in + slide-up on load
- Reduced motion: all animations respect `prefers-reduced-motion`

## Breakpoints

- Mobile: `< 640px`
- Tablet: `640px - 1024px`
- Desktop: `> 1024px`
- Wide: `> 1280px`
