# CAMC Seating

Auditorium seating charts for school events, with a clean Apple-style design.
The website is hosted free on **GitHub Pages**, and all data lives in **Supabase**.

| Page | Who | What |
| --- | --- | --- |
| `/` | Everyone | Search for an event and view its seating plan. Find a class, a person or a seat number, and see the VIP guests. |
| `/teacher/` | Teachers | Create events and edit seating charts (auto-allocate, drag to swap, names and photos, extra seats, import/export JSON). Add and edit **classes** and **VIP groups** under **Classes & VIP**. |
| `/loykrathong/` | Everyone | Build a krathong (base, petals, flowers, candles, incense, decoration), add a name and a wish, and float it. No sign-in needed. |
| `/liveloykrathong/` | Big screen | A night river where every krathong floats past with its wish. New ones appear within a few seconds. Includes a QR code to the builder. |
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

## Loy Krathong

- **Builder:** share `…/loykrathong/` (or let people scan the QR code on the live river).
- **Live river:** open `…/liveloykrathong/` on the projector computer and press **Full Screen**. The controls and cursor hide after a few seconds.
- **Moderation:** teachers sign in at `/teacher/` → **Loy Krathong** to hide or delete krathongs, turn **Accepting krathongs** off when the event ends, or **Clear All Krathongs** to start fresh next year. Hidden krathongs leave the live river within about 30 seconds.
- **Limits:** names up to 40 characters, wishes up to 140. Up to 120 krathongs per network every 10 minutes (phones on school Wi-Fi share one network address), and 300 per minute overall.

If you set up the database before Loy Krathong was added, run `supabase/schema.sql` again in the SQL Editor to add it. Nothing existing is changed.

## Studio: voting, message walls, awards and run of show

These live in their own folders, separate from the main seating site. Teachers sign in at `…/studio/` with their usual CAMC Seating account.

| Folder | Who | What |
| --- | --- | --- |
| `/studio/` | Teachers | Create and run everything below, approve questions and messages, and move the big screens on |
| `/vote/` | Students (iPad, Mac, Windows) | Enter the 6-character code, vote, ask questions and upvote them |
| `/livevote/` | Big screen | Join code and QR, the question with a live vote count, results bars, or the top questions |
| `/wall/` | Students | Post a message to a themed wall (Wai Khru, Songkran, Graduation, New Year, Christmas or plain) |
| `/livewall/` | Big screen | Approved messages as sticky notes. New ones jump to the front, and pages turn when it's full |
| `/awards/` | Big screen | One winner at a time with a reveal. Upcoming winners are never sent to the screen, so they stay secret |
| `/runshow/` | Backstage screen | Now / Next / Later with a timer against each item's planned minutes |

Tips:

- In the studio, **Open Big Screen** opens the right screen for the projector. Press **Full Screen** there; the buttons and cursor hide after a few seconds.
- Questions and messages wait for a teacher to approve them unless you turn that off.
- Link an award show to a seating chart and give each award a seat (e.g. `B4`). The studio then shows where the next winner is sitting, so you can call them up in time.
- Each device can vote once per question (it can change its vote until voting closes).

If your database was set up before the studio was added, run `supabase/schema.sql` again in the SQL Editor. Nothing existing is changed.

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
