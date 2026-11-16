# CAMC Seating

Auditorium seating charts for school events, with a clean Apple-style design and data stored in Supabase.

| Page | Who | What |
| --- | --- | --- |
| `/` | Everyone | Search for an event and view its seating plan. Find a class, a person or a seat number, and see the list of VIP guests. |
| `/teacher` | Teachers | Create events and edit seating charts (auto-allocate, drag to swap, names and photos, extra seats, import/export JSON). Add and edit **classes** and **VIP groups** under **Classes & VIP**. |
| `/teacher` | Administrator | Sign in as `camcadmin` to create teacher accounts. The administrator cannot edit seating charts, classes or VIP groups. |

## Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the dashboard open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and press **Run**.
   It creates the `camc_*` tables with Row Level Security turned on and no public policies, so nobody can read or change data with the public `anon` key.
3. Open **Project Settings → API** and copy the **Project URL** and the **service_role** secret key.
4. Copy `.env.example` to `.env` and fill in both values:

   ```bash
   cp .env.example .env
   ```

The service-role key bypasses Row Level Security, so it must stay on the server. Never put it in the browser or commit it to git (`.env` is already ignored).

## Run it

Requires Node.js 22 or newer.

```bash
npm install
npm start            # http://localhost:3000
PORT=8080 npm start  # choose a port
```

On first start the server creates the administrator account and the default classes and VIP group in Supabase.

If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not set, the server stores everything in a local file, `data/db.json`, instead. This is handy for trying the app out, but use Supabase for real events.

## Administrator account

- **Username:** `camcadmin`
- **Password:** `sisbcamc`

Sign in at `/teacher` and use **Change Password** in the top bar to set a new password before going live.

## Classes and VIP groups

Teachers manage these at `/teacher` → **Classes & VIP** (or with **New Class or VIP Group** inside the editor).

- **Classes** are the student groups used by auto-allocate, e.g. `7A`.
- **VIP groups** are guest categories, e.g. `VIP-Board` for the Board of Directors. To seat a VIP guest, click a seat in the editor, choose the VIP group and type the guest's name (a photo is optional). VIP seats are marked with a star and listed under **VIP Guests** on the public page.
- Changing a group's name or colour updates every event. A group's code can't be changed after it is created. Deleting a group keeps the seats that already use it, in their last colour.

## Importing old layouts

Layouts exported from the previous single-file planner (`SeatLayout_*.json`) can be loaded with **Import JSON** in the editor.
Remember to press **Save** afterwards.

## Notes

- Passwords are hashed with scrypt. Sessions are stored in Supabase (only a SHA-256 hash of each token is saved) and expire after 12 hours of inactivity.
- Serve the site over HTTPS in production (for example behind a reverse proxy) so the session cookie is marked `Secure`.
