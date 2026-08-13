# POS System - Category Feature Specification

## Project Overview
- **Project Name**: POS (Point of Sale) System
- **Type**: Web Application (React + Supabase)
- **Core Functionality**: Category management for menu items with CRUD operations and menu filtering
- **Target Users**: Restaurant staff (superadmin, admin, chef roles)

---

## UI/UX Specification

### Layout Structure

#### Sidebar
- Category link already exists in sidebar navigation
- Accessible to: superadmin, admin, chef roles
- Navigation path: `/category`

#### Pages
1. **Category Page** (`/category`)
   - Search bar at top
   - "Add Category" button on right
   - Grid layout for category cards (1 col mobile, 2 col tablet, 3 col desktop)

2. **Menu Page** (`/menu`)
   - Search bar at top
   - "Add Menu" button on right
   - Category filter tabs below search
   - Grid layout for menu cards

### Visual Design
- **Color Palette**:
  - Primary: Blue-600 (#2563EB)
  - Success: Green-600 (#16A34A)
  - Danger: (#EF Red-5004444)
  - Background: Gray-100 (#F3F4F6)
  - Card Background: White (#FFFFFF)

- **Typography**:
  - Headings: Bold, text-gray-800
  - Body: Regular, text-gray-500/600

- **Spacing**:
  - Page padding: 24px (p-6)
  - Card gap: 24px (gap-6)
  - Card padding: 20px (p-5)

- **Components**:
  - Buttons: Rounded-2xl, shadow, hover transitions
  - Inputs: Border, rounded-2xl, focus ring
  - Modals: Fixed overlay, centered, max-height scrollable

---

## Functionality Specification

### Category Management (Category.jsx)

#### Features
1. **List Categories**
   - Fetch all categories from `categories` table
   - Display in responsive grid
   - Show: name, description, ID

2. **Search Categories**
   - Filter by name in real-time

3. **Create Category**
   - Modal form with name (required) and description (optional)
   - Insert into `categories` table

4. **Edit Category**
   - Pre-fill modal with existing data
   - Update `categories` table

5. **Delete Category**
   - Confirmation dialog
   - Set related menu items category_id to null
   - Delete from `categories` table

### Menu Category Integration (Menu.jsx)

#### Features
1. **Category Filter Tabs**
   - "All" tab (default)
   - Dynamic tabs from categories table
   - Active tab highlighted blue

2. **Category Selection in Form**
   - Dropdown in add/edit menu modal
   - Optional selection (can be empty)

3. **Category Display on Cards**
   - Show category name below price
   - Handle uncategorized items gracefully

---

## Database Schema

### Table: categories
| Column | Type | Constraints |
|--------|------|-------------|
| id | bigint | primary key |
| name | text | not null |
| description | text | nullable |
| created_at | timestamp | default now |

---

## Acceptance Criteria

### Category Page
- [ ] Can view all categories in grid
- [ ] Can search categories by name
- [ ] Can add new category with name
- [ ] Can edit existing category
- [ ] Can delete category (menu items unaffected)
- [ ] Modal opens/closes properly

### Menu Page
- [ ] Category filter tabs display correctly
- [ ] Can filter menu by category
- [ ] Can assign category when creating menu
- [ ] Can change category when editing menu
- [ ] Category name displays on menu card

### Sidebar
- [ ] Category link visible for allowed roles
- [ ] Navigation to /category works

---

## File Changes

### Modified Files
- `src/pages/Menu.jsx` - Added category filter tabs, category dropdown, category display
- `src/components/Sidebar.jsx` - Already has Category link
- `src/pages/Category.jsx` - Already has full CRUD

### Created Files
- `SPEC.md` - This specification

---

# Internal Consumption Feature Specification

## Overview
- **Purpose**: Track internal inventory usage (waste, samples, staff consumption)
- **Access**: All roles (superadmin, admin, chef, user)
- **Permission**: Only superadmin can delete/edit records

---

## UI/UX Specification

### Layout
- Sidebar: "Internal Consumption" link
- Page: List of consumption records with expand/collapse
- Modal: Multi-item selection with quantity input

### Visual Design
- Consistent with existing POS styling
- Blue primary buttons, red for delete
- Expandable record cards

---

## Functionality Specification

### 1. View Usage Records
- List all internal consumption records
- Expand to see individual items used
- Show date, notes, status

### 2. Record Usage (All Roles)
- Select multiple inventory items
- Enter quantity for each item
- Add optional notes
- Deduct from inventory on save

### 3. Permission Control
- **All roles**: View inventory, record usage
- **Only superadmin**: Delete consumption records (restores inventory)
- Other roles cannot edit/delete consumption records

### 4. Export Report
- Export all records to CSV/Excel
- Include: Date, Item Name, Quantity, Unit, Notes

---

## Database Schema

### Table: internal_consumption
| Column | Type | Constraints |
|--------|------|-------------|
| id | bigint | primary key |
| notes | text | nullable |
| status | text | default 'completed' |
| user_name | text | nullable (who recorded the usage) |
| created_at | timestamp | default now |

### Table: internal_consumption_items
| Column | Type | Constraints |
|--------|------|-------------|
| id | bigint | primary key |
| consumption_id | bigint | FK to internal_consumption |
| inventory_id | bigint | FK to inventory |
| qty | numeric | not null |

---

## Acceptance Criteria

### Records
- [ ] View list of consumption records
- [ ] Expand record to see item details

### Recording Usage
- [ ] Select multiple inventory items
- [ ] Enter quantity for each selected item
- [ ] Validate quantity doesn't exceed available stock
- [ ] Deduct inventory on save

### Permissions
- [ ] All roles can record usage
- [ ] All roles can view inventory units
- [ ] Only superadmin can delete records

### Reporting
- [ ] Export report as CSV/Excel
- [ ] Report includes date, item, quantity, unit, notes

---

## File Changes

### Created
- `src/pages/InternalConsumption.jsx` - Main component
- `SPEC.md` - This specification

### Modified
- `src/App.jsx` - Added route and access rights
- `src/components/Sidebar.jsx` - Added navigation link
