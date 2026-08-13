# Database Schema Specification

## Overview
This document describes the database schema changes required for the POS VIBE system.

---

## Tables

### 1. orders
| Column     | Type         | Default     | Description                    |
|------------|--------------|-------------|--------------------------------|
| id         | uuid         | auto        | Primary key                    |
| created_at | timestamp    | now()       | Order creation time            |
| total      | numeric      | -           | Order total amount             |
| status     | text         | 'pending'   | Order status                   |

**Status Values:**
- `pending` - Order created, waiting for completion
- `completed` - Order completed, inventory deducted
- `cancelled` - Order cancelled, inventory returned

---

### 2. order_items
| Column   | Type    | Description              |
|----------|---------|--------------------------|
| id       | uuid    | Primary key              |
| order_id | uuid    | Foreign key to orders    |
| menu_id  | uuid    | Foreign key to menu      |
| qty      | numeric | Quantity ordered         |
| price    | numeric | Price per unit           |

---

### 3. menu
| Column     | Type    | Description        |
|------------|---------|---------------------|
| id         | uuid    | Primary key        |
| menu_name  | text    | Name of menu item  |
| price      | numeric | Price              |

---

### 4. menu_ingredients
| Column        | Type    | Description                    |
|---------------|---------|--------------------------------|
| id            | uuid    | Primary key                    |
| menu_id       | uuid    | Foreign key to menu            |
| inventory_id  | uuid    | Foreign key to inventory       |
| qty           | numeric | Quantity needed per menu unit |

---

### 5. inventory
| Column    | Type    | Description           |
|-----------|---------|-----------------------|
| id        | uuid    | Primary key           |
| item_name | text    | Name of inventory item|
| qty       | numeric | Current quantity      |
| type      | text    | Type/category         |

---

## Relationships

```
orders (1) --> (N) order_items
menu (1) --> (N) menu_ingredients
menu_ingredients (N) --> (1) inventory
order_items (N) --> (1) menu
```

---

## Migration SQL

```sql
-- Add status column to orders table
ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'pending';

-- Add constraint for valid status values
ALTER TABLE orders ADD CONSTRAINT status_check CHECK (status IN ('pending', 'completed', 'cancelled'));
```
