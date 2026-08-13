# Supabase Client Configuration

## Overview
The createClients.js file initializes the Supabase client for database connections.

---

## Current Implementation

### File Location
`src/createClients.js`

### Configuration
- Supabase project URL
- Supabase anon/public key

---

## Code
```javascript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  'https://bjstydtzxedjdxkunibl.supabase.co',
  'sb_publishable_XiUFS9P5majdKa9Z2HN5Ig_y9Pe3aIa'
);

export default supabase;
```

---

## No Changes Required
This file does not need modifications for the new features.
