# Admin Setup Guide

## Overview
The golf tournament app now has admin access control. Only users with the `is_admin` flag can:
- Add new players
- Edit existing players
- Delete players

Regular users can view players but cannot modify them.

## Setting Up Admin Access

### Step 1: Run the SQL Migration

1. Open your Supabase project dashboard
2. Go to the SQL Editor
3. Open the file `add-admin-field.sql` from this project
4. Copy and paste the entire SQL script into the Supabase SQL Editor
5. Click "Run" to execute the migration

This will:
- Add the `is_admin` column to the `players` table
- Create an index for performance
- Set up RLS policies (currently allowing all operations for compatibility)

### Step 2: Designate Yourself as Admin

After running the migration, execute this SQL command in the Supabase SQL Editor:

```sql
UPDATE players
SET is_admin = TRUE
WHERE email = 'tom.galia@outlook.com';
```

Replace the email with your actual email address if different.

### Step 3: Test Admin Access

1. Release your current profile in the app (if claimed)
2. Claim your profile again (this will reload the `is_admin` flag from the database)
3. Navigate to the Players page
4. You should now see:
   - Edit and Delete buttons on each player card
   - "Add Player" button at the bottom of the page

### Adding More Admins

To designate other users as admins, run:

```sql
UPDATE players
SET is_admin = TRUE
WHERE email = 'another-admin@example.com';
```

Or to make multiple users admins at once:

```sql
UPDATE players
SET is_admin = TRUE
WHERE email IN (
  'admin1@example.com',
  'admin2@example.com',
  'admin3@example.com'
);
```

### Removing Admin Access

To remove admin privileges:

```sql
UPDATE players
SET is_admin = FALSE
WHERE email = 'former-admin@example.com';
```

## How It Works

1. **Profile Secret Authentication**: Users claim their profile using their name and profile secret
2. **Admin Flag**: When a profile is claimed, the `is_admin` field is loaded from the database
3. **UI Conditional Rendering**: Admin-only buttons/features are conditionally shown based on `isAdmin` from the auth context
4. **Client-Side Enforcement**: Currently, admin checks are client-side only

## Important Notes

- **Client-Side Only**: The current implementation checks admin status on the client side. For production, you should also add server-side (RLS policy) enforcement.
- **Shared Table**: The `players` table is shared between the golf and cornhole apps. Admin flags apply to both apps.
- **Re-claim Required**: After updating `is_admin` in the database, users must release and re-claim their profile for changes to take effect.

## Future Enhancements

Consider implementing:
1. Server-side RLS policies that check `is_admin` (requires custom JWT or service role approach)
2. Admin management UI (admins can promote/demote other users)
3. Role-based permissions (viewer, editor, admin, super-admin)
4. Audit logging for admin actions
