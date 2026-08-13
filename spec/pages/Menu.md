# Menu Page Specification

## Overview
The Menu page allows management of menu items and their ingredient mappings.

---

## Current Implementation

### File Location
`src/pages/Menu.jsx`

### Features
- List all menu items
- Add new menu item with ingredients
- Edit existing menu item
- Delete menu item
- Search menu items
- Ingredient selection from inventory

---

## No Changes Required
This component does not need modifications for the new features.

---

## Features

### Menu Item Fields
- `menu_name`: Name of the menu item
- `price`: Price in MMK
- `ingredients`: Array of ingredient links

### Menu Ingredients
Each menu item can be linked to inventory items:
- `inventory_id`: Reference to inventory item
- `qty`: Quantity needed per menu unit

---

## UI Structure
```
+--------------------------------------------------+
|  Menu Management                                  |
|  [Search...]                    [+ Add Menu]     |
+--------------------------------------------------+
|  +------------+  +------------+  +------------+  |
|  | Item A    || | Item B    || | Item C    |  |
|  | 5000 MMK  || | 3000 MMK  || | 8000 MMK  |  |
|  | Ing: X, Y || | Ing: Z    || | Ing: X, Z |  |
|  | [Edit][X] || | [Edit][X] || | [Edit][X] |  |
|  +------------+  +------------+  +------------+  |
+--------------------------------------------------+

[Modal: Add/Edit Menu]
+------------------------------------------+
|  Menu Name: [____________]                |
|  Price:     [____________]                |
|  Ingredients:                            |
|  [Select Item ▼] [Qty: ___] [+]        |
|  [Item 1 - 2 units]                     |
|  [Item 2 - 1 unit] [X]                  |
|  [+ Add Ingredient]                      |
|  [Cancel] [Save]                        |
+------------------------------------------+
```

---

## Dependencies
- `react`
- `supabase`
- `sweetalert2`

---

## Current Behavior
Menu items are linked to inventory via `menu_ingredients` table.
This relationship is used for inventory deduction when orders complete.
