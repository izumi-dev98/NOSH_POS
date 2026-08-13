# UserCreate Page Specification

## Overview
The UserCreate page provides user management functionality for administrators.

---

## Current Implementation

### File Location
`src/pages/UserCreate.jsx`

### Features
- List all users with pagination
- Add new user
- Edit existing user
- Delete user
- Search users by username or full name
- Role assignment

### State
| State        | Type    | Description                    |
|--------------|---------|--------------------------------|
| users        | array   | List of all users              |
| search       | string  | Search input value             |
| currentPage  | number  | Current pagination page        |
| itemsPerPage | number  | Items per page (5)             |
| modalOpen    | boolean | Modal visibility state         |
| editingUser  | object  | User being edited (null = add) |
| fullName     | string  | Form: full name input          |
| username     | string  | Form: username input           |
| password     | string  | Form: password input           |
| role         | string  | Form: selected role            |

---

## UI Structure
```
+--------------------------------------------------+
|  User Management                                  |
|  [Search...]                    [Add User]       |
+--------------------------------------------------+
|  # | Full Name | Username | Role    | Actions   |
|  1 | John Doe | john    | admin   | [Edit][X] |
|  2 | Jane     | jane    | user    | [Edit][X] |
+--------------------------------------------------+
|  [Prev] [1] [2] [Next]                          |
+--------------------------------------------------+

[Modal: Add/Edit User]
+------------------------------------------+
|  Add User                                 |
|  Full Name: [____________]                |
|  Username:  [____________]                |
|  Password:  [____________]                |
|  Role:      [▼ Select Role]             |
|  [Cancel] [Add/Update]                   |
+------------------------------------------+
```

---

## Roles
- superadmin
- admin
- chef
- user

---

## CRUD Operations

### Create
- Insert new user with full_name, username, password, role

### Update
- Update full_name, username, role
- Password optional (only if provided)

### Delete
- Confirmation dialog required
- Delete from user table

---

## Dependencies
- `react`
- `supabase`
- `sweetalert2`

---

## No Changes Required
This component does not need modifications for the new features.
