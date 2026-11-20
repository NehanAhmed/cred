---
version: alpha
name: Stripe Modern
description: A light, editorial financial platform with minimal framing, vivid gradient accents, and calm blue-violet action states.
colors:
  primary: "#533AFD"
  secondary: "#0A2540"
  tertiary: "#B9B9F9"
  neutral: "#FFFFFF"
  surface: "#FFFFFF"
  on-surface: "#0A2540"
  accent: "#81B81A"
  border: "#D9E2F2"
  muted: "#6B7A90"
  error: "#E5484D"
typography:
  headline-display:
    fontFamily: "sohne-var"
    fontSize: "56px"
    fontWeight: 300
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline-lg:
    fontFamily: "sohne-var"
    fontSize: "48px"
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline-md:
    fontFamily: "sohne-var"
    fontSize: "32px"
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline-sm:
    fontFamily: "sohne-var"
    fontSize: "20px"
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body-lg:
    fontFamily: "sohne-var"
    fontSize: "18px"
    fontWeight: 300
    lineHeight: 1.6
    letterSpacing: "-0.01em"
  body-md:
    fontFamily: "sohne-var"
    fontSize: "16px"
    fontWeight: 300
    lineHeight: 1.6
    letterSpacing: "-0.01em"
  body-sm:
    fontFamily: "sohne-var"
    fontSize: "14px"
    fontWeight: 300
    lineHeight: 1.6
    letterSpacing: "-0.01em"
  label-lg:
    fontFamily: "sohne-var"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0em"
  label-md:
    fontFamily: "sohne-var"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0em"
  label-sm:
    fontFamily: "sohne-var"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  none: 0px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px
spacing:
  xs: 6px
  sm: 14px
  md: 24px
  lg: 40px
  xl: 96px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.sm}"
    padding: "16px 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.neutral}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.sm}"
    padding: "16px 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.sm}"
    padding: "16px 24px"
    height: "48px"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.none}"
    padding: "0px"
    height: "auto"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "8px"
  input:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "14px 16px"
  chip:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "6px 12px"
---

# Stripe Modern

## Overview

Stripe feels premium, technical, and unusually airy for a finance product. The page is built for founders, developers, and business teams who need trust first, then speed and scale. The emotional tone is calm and authoritative, with a single high-energy visual accent: the flowing rainbow ribbon that adds momentum without making the interface feel noisy.

## Colors

- **Primary (#533AFD):** The signature action color, a vivid blue-violet used for primary buttons, links, and emphasis against the white canvas.
- **Secondary (#0A2540):** A deep navy used for main text, navigation, and high-contrast brand communication.
- **Tertiary (#B9B9F9):** A softer lavender support tone that works well for borders, subtle emphasis, and hover transitions.
- **Neutral (#FFFFFF):** The dominant background color, creating a clean editorial field that lets typography and color accents breathe.
- **Surface (#FFFFFF):** Card and panel surfaces stay identical to the page background, reinforcing the flat, open layout.
- **On-surface (#0A2540):** Default readable text color for body copy, labels, and interface chrome.
- **Accent (#81B81A):** A sparing green accent that can support status, validation, or secondary brand moments.
- **Border (#D9E2F2):** A pale cool line color for separators and framing that remains visually light.
- **Muted (#6B7A90):** A subdued blue-gray for secondary metadata and supporting copy.
- **Error (#E5484D):** Reserved for destructive actions, validation states, and alerts.

## Typography

The system uses `sohne-var` with SF Pro Display fallbacks, producing a modern sans-serif voice that feels polished and product-oriented. Headings are very light in weight, which gives the page a refined, architectural look even at large sizes. Body text follows the same family with slightly smaller sizes and generous line heights, keeping long marketing copy readable and elegant.

Display and section headings should use `headline-display`, `headline-lg`, and `headline-md` for landing pages and major content transitions. Body content should use `body-lg`, `body-md`, and `body-sm` depending on reading distance and density. Labels and UI text use `label-lg`, `label-md`, and `label-sm`, with minimal letter spacing and no uppercase-caps system visible in the screenshot.

## Layout

The layout is spacious, fixed to a wide centered content column with substantial side margins and a clean top navigation bar. Sections are separated by subtle horizontal rules and large vertical whitespace, which makes the page feel expansive rather than dense. Use the spacing scale as a loose rhythm: `xs` for tight internal gaps, `sm` for related items, `md` for component padding and small clusters, `lg` for section separation, and `xl` for major page breaks.

Cards and content modules should maintain generous inner padding but avoid heavy framing. The hero area uses asymmetrical composition: text is left aligned, while the color ribbon occupies the upper-right and diagonal center-right space. This creates visual motion without breaking the overall grid discipline.

## Elevation & Depth

Stripe is intentionally low-elevation and mostly flat. Instead of strong shadows, the interface relies on contrast, whitespace, thin dividers, and the presence of a few luminous gradients to create hierarchy. When depth is needed, use soft shadows very sparingly and keep them diffuse; avoid stacked or dramatic elevation.

## Shapes

The shape language is understated and precise. Interactive controls use small radii, centered on `rounded.sm` and occasionally `rounded.md`, which keeps the system crisp and product-like. Avoid large rounded corners except for pills, badges, or accent chips where `rounded.full` is appropriate.

## Components

Buttons are compact, rectangular, and text-forward. `button-primary` should be filled with `colors.primary`, use white text, and keep the 48px height with 16px vertical padding and 24px horizontal padding. `button-primary-hover` can deepen into `colors.secondary` for a more grounded hover state. `button-secondary` should stay white with a light cool border and primary-colored text. `button-tertiary` is reserved for text-only links or inline CTAs and should remain transparent with no border.

Buttons should feel confident but not oversized. Keep the label weight at `label-lg` rather than heavy bold styling, and preserve the clean spacing around icon-only affordances and chevrons.

Cards should be white, nearly flat, and minimally outlined. Use `card` for marketing modules, logo containers, or content tiles; keep shadows soft if used at all, and let surrounding whitespace do most of the work. Inputs should mirror buttons in restraint: white background, subtle border, modest radius, and comfortable padding. Focus states should be clear through color and border contrast rather than dramatic glow.

Chips and small status tokens should be pill-shaped and lightly bordered or filled, with `chip` as a rounded utility for filters, tags, or metadata. Links should remain visually simple and use the primary color, with no underline unless interaction requires extra clarity. Navigation items and utility actions should stay compact and text-based, matching the page’s editorial tone.

## Do's and Don'ts

- Do keep layouts open, airy, and centered with clear content hierarchy.
- Do use `sohne-var` light weights for headlines to preserve the refined Stripe feel.
- Do rely on primary blue-violet for the main CTA and important links.
- Do use subtle borders and whitespace to separate sections instead of heavy shadows.
- Don't introduce saturated backgrounds or dense panels that compete with the hero ribbon.
- Don't make buttons overly rounded, oversized, or visually loud.
- Don't use bold, condensed, or decorative typefaces for core marketing copy.
- Don't overuse the green accent; reserve it for secondary meaning or status.