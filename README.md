# CAMC Seating

Auditorium seating charts for school events, with a clean Apple-style design.
The website is hosted free on **GitHub Pages**, and all data lives in **Supabase**.

| Page | Who | What |
| --- | --- | --- |
| `/` | Everyone | Search for an event and view its seating plan. Find a class, a person or a seat number, and see the VIP guests. |
| `/teacher/` | Teachers | Create events and edit seating charts (auto-allocate, drag to swap, names and photos, extra seats, import/export JSON). Add and edit **classes** and **VIP groups** under **Classes & VIP**. |
| `/teacher/` | Administrator | Sign in as `camcadmin` to create teacher accounts. The administrator cannot edit seating charts, classes or VIP groups. |

## Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and press **Run**.
   This creates the tables, the security rules, the `camcadmin` account and the default classes. It is safe to run again later.
3. Open **Project Settings → API** (or **Connect**) and copy:
   - the **Project URL**, e.g. `https://abcdefghijklm.supabase.co`
   - the **anon** / **publishable** key

### 2. Connect the website

Edit [`docs/config.js`](docs/config.js) (you can do it on github.com with the pencil icon) and paste the two values in.

The anon key is designed to be public. Never use the **service_role** key here.

### 3. GitHub Pages

1. In the repository go to **Settings → Pages**.
2. Under **Build and deployment** choose **Source: Deploy from a branch**, then pick the branch and the **`/docs`** folder, and press **Save**.
3. After a minute the site appears at `https://<your-username>.github.io/<repository>/`. The teacher page is at `…/teacher/`.

Every push to that branch publishes the site again automatically.

## Administrator account

- **Username:** `*********`
- **Password:** `********`

Sign in at `/teacher/` and use **Change Password** in the top bar before going live.

## Classes and VIP groups

Teachers manage these at `/teacher/` → **Classes & VIP** (or with **New Class or VIP Group** inside the editor).

- **Classes** are the student groups used by auto-allocate, e.g. `7A`.
- **VIP groups** are guest categories, e.g. `VIP-Board` for the Board of Directors. To seat a VIP guest, click a seat in the editor, choose the VIP group and type the guest's name (a photo is optional). VIP seats are marked with a star and listed under **VIP Guests** on the public page.
- Changing a group's name or colour updates every event. A group's code can't be changed after it is created. Deleting a group keeps the seats that already use it, in their last colour.

## How it is secured

GitHub Pages only serves static files, so the browser talks to Supabase directly with the public anon key. Everything that matters is enforced inside the database by `supabase/schema.sql`:

- Row Level Security is on for every table. Visitors can only **read** events and classes/VIP groups. They cannot read accounts or sessions.
- Every change goes through a database function that checks the signed-in user's session and role: the administrator can only create teacher accounts, and only teachers can change seating charts, classes and VIP groups.
- Passwords are hashed with bcrypt. Sessions last 12 hours of inactivity, and only a SHA-256 hash of each session token is stored. Ten wrong passwords in 15 minutes locks that username for a while.

## Running locally

Any static file server works, for example:

```bash
python3 -m http.server 8000 --directory docs
# open http://localhost:8000/
```

`docs/config.js` must point at your Supabase project.

## Importing old layouts

Layouts exported from the original single-file planner (`SeatLayout_*.json`) can be loaded with **Import JSON** in the editor. Remember to press **Save** afterwards.
