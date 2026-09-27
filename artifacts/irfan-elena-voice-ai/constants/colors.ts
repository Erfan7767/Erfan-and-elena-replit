/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#F8FAFC',
    tint: '#5EEAD4',

    // Core surfaces
    background: '#08111F',
    foreground: '#F8FAFC',

    // Cards / elevated surfaces
    card: '#101D2F',
    cardForeground: '#F8FAFC',

    // Primary action color (buttons, links, active states)
    primary: '#5EEAD4',
    primaryForeground: '#06211F',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#16263D',
    secondaryForeground: '#D7E4F2',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#132239',
    mutedForeground: '#8DA3BB',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#F59E7A',
    accentForeground: '#2B130E',

    // Destructive actions (delete, error states)
    destructive: '#FB7185',
    destructiveForeground: '#28070D',

    // Borders and input outlines
    border: '#223650',
    input: '#1A2D46',
  },

  dark: {
    text: '#F8FAFC',
    tint: '#5EEAD4',
    background: '#08111F',
    foreground: '#F8FAFC',
    card: '#101D2F',
    cardForeground: '#F8FAFC',
    primary: '#5EEAD4',
    primaryForeground: '#06211F',
    secondary: '#16263D',
    secondaryForeground: '#D7E4F2',
    muted: '#132239',
    mutedForeground: '#8DA3BB',
    accent: '#F59E7A',
    accentForeground: '#2B130E',
    destructive: '#FB7185',
    destructiveForeground: '#28070D',
    border: '#223650',
    input: '#1A2D46',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
