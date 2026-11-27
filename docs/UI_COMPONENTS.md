# NEXCUT AI — Shared Modern UI Components

## Overview
This document describes the modern, accessible UI components created in `components/ui/` for NEXCUT AI.

## Component Library

### 1. Breadcrumb (`components/ui/Breadcrumb.tsx`)
- Provides hierarchical route navigation (`nav aria-label="Breadcrumb"`).
- Keyboard accessible, current-page indication (`aria-current="page"`), and responsive text truncation for long project/clip titles.

### 2. HamburgerMenu (`components/ui/HamburgerMenu.tsx`)
- Responsive navigation for header navigation.
- Maintains full desktop link navigation while offering a collapsible drawer for mobile viewports.
- Fully accessible with Escape key dismiss, focus trapping, and `aria-expanded` state.

### 3. Modal (`components/ui/Modal.tsx`)
- Reusable accessible modal dialog container (`role="dialog"`, `aria-modal="true"`).
- Features focus trap, Escape key listener, backdrop blur, and customizable confirm/cancel/destructive actions.

### 4. Select (`components/ui/Select.tsx`)
- Custom/styled dropdown selection control with keyboard navigation support and disabled option handling.

### 5. RadioGroup (`components/ui/RadioGroup.tsx`)
- Form-compliant exclusive selection control (`role="radiogroup"`).
- Supports vertical/horizontal layouts and full keyboard arrow key navigation.

### 6. SelectionCard (`components/ui/SelectionCard.tsx`)
- Selectable card component for options, presets, or creation modes (`role="button"`, `tabIndex=0`).
- Displays active state, badges, icons, and descriptions.

### 7. Accordion (`components/ui/Accordion.tsx` & `AccordionItem`)
- Collapsible section container (`aria-expanded`, `aria-controls`).
- Supports smooth expanding/collapsing of advanced settings panels without affecting video preview playback performance.

## Styling & Design System Conventions
- Styled with Tailwind CSS matching NEXCUT AI's dark glassmorphism theme (`zinc-950`, `cyan-300`, `cyan-300/20` borders).
- Respects `prefers-reduced-motion` and keyboard focus outlines (`focus:ring-2 focus:ring-cyan-300`).
