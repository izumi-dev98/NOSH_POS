# Project UI Style Guide

## Overview
This document outlines the UI styling conventions used in the POS_IT project.

## Color Palette

| Purpose | Color | Tailwind Class |
|---------|-------|----------------|
| Primary | Indigo | `indigo-600` |
| Primary Hover | Indigo Dark | `indigo-700` |
| Secondary | Slate | `slate-500`, `slate-600`, `slate-700`, `slate-800` |
| Background | Slate 50 | `bg-slate-50` |
| Card Background | White | `bg-white` |
| Success | Emerald | `emerald-600` |
| Error/Delete | Red | `red-500`, `red-600` |

## Typography

- Headings: `text-2xl font-bold text-slate-800`
- Subheadings: `text-sm text-slate-500 mt-1`
- Body: `text-sm text-slate-600`
- Table Header: `text-sm font-semibold text-slate-700`

## Common Components

### Page Container
```jsx
<div className="p-6 bg-slate-50 min-h-screen">
```

### Page Header
```jsx
<div className="mb-6">
  <h1 className="text-2xl font-bold text-slate-800">Page Title</h1>
  <p className="text-sm text-slate-500 mt-1">Page description</p>
</div>
```

### Card/Container
```jsx
<div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
```

### Table Header
```jsx
<thead className="bg-slate-100">
  <tr>
    <th className="px-4 py-3 text-left font-semibold text-slate-700">Header</th>
  </tr>
</thead>
```

### Table Row Hover
```jsx
<tr className="border-b border-slate-100 hover:bg-indigo-50/50 transition">
```

### Button Styles

**Primary Button:**
```jsx
className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
```

**Success Button (Export):**
```jsx
className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
```

**Danger Button:**
```jsx
className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
```

### Form Inputs
```jsx
className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
```

### Filter Buttons (Active/Inactive)
```jsx
// Active
className="px-4 py-2 rounded-lg text-sm font-medium capitalize transition bg-indigo-600 text-white"

// Inactive
className="px-4 py-2 rounded-lg text-sm font-medium capitalize transition bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-indigo-600"
```

## Layout

### Navbar
- Height: `h-12` (48px)
- Background: `bg-white`
- Border: `border-b border-slate-200`
- Contains: Menu toggle (FontAwesome `faBars`), Logo, Title, User avatar

### Sidebar
- Width: `w-60` (240px)
- Top position: `top-12`
- Height: `h-[calc(100vh-3rem)]`
- Background: `bg-white`
- Border: `border-r border-slate-200`

## Icons

Uses FontAwesome for icons:
- Menu toggle: `faBars` from `@fortawesome/free-solid-svg-icons`
- Import example:
```jsx
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars } from "@fortawesome/free-solid-svg-icons";

// Usage
<FontAwesomeIcon icon={faBars} />
```

## File Structure

All page components follow the same structure:
1. Page container with `bg-slate-50`
2. Header section with title and description
3. Search/Filter card with white background
4. Data table or content area
5. Pagination (if applicable)

## Notes

- Always use `rounded-xl` for cards and containers
- Use `shadow-sm` for subtle shadows
- Use `border-slate-200` for borders
- Table rows should have hover effect with `hover:bg-indigo-50/50`
- Button text should be `text-sm font-medium`
- Form inputs should have `focus:ring-indigo-500`