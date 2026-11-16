# CAMC Seating

Auditorium seating charts for school events, with a clean Apple-style design.

| Page | Who | What |
| --- | --- | --- |
| `/` | Everyone | Search for an event and view its seating plan. Find a class, a person or a seat number. |
| `/teacher` | Teachers | Sign in to create events and edit seating charts (auto-allocate, drag to swap, names and photos, extra seats, import/export JSON). |
| `/teacher` | Administrator | Sign in as `camcadmin` to create teacher accounts. The administrator cannot edit seating charts. |

## Run it

Requires Node.js 18 or newer. There are no dependencies to install.

```bash
npm start            # http://localhost:3000
PORT=8080 npm start  # choose a port
```

Data is saved to `data/db.json` (set `DATA_DIR` to store it elsewhere). Back up that file to keep your events and accounts.

## Administrator account

On first start the server creates:

- **Username:** `camcadmin`
- **Password:** `sisbcamc`

Sign in at `/teacher` and use **Change Password** in the top bar to set a new password before going live.

## Importing old layouts

Layouts exported from the previous single-file planner (`SeatLayout_*.json`) can be loaded with **Import JSON** in the editor.
Remember to press **Save** afterwards.

## Notes

- Passwords are hashed with scrypt; sessions use an HttpOnly cookie and expire after 12 hours of inactivity.
- Serve the site over HTTPS in production (for example behind a reverse proxy) so the session cookie is marked `Secure`.
