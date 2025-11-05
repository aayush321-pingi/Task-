# Next.js Dynamic Data Table Manager

This project implements a Dynamic Data Table Manager using Next.js, Redux Toolkit, and MUI. It includes features requested:

- Table view with default columns: Name, Email, Age, Role
- Sorting, global search, client-side pagination (10 rows/page)
- Manage Columns modal to add/show/hide columns and persist visibility
- CSV import (PapaParse) and CSV export (only visible columns)
- Inline editing with Save All / Cancel All, row delete with confirmation
- Theme toggle (Light/Dark)

NOTE: This repository is scaffolded as a starting point. To run locally:

1. Install dependencies:

```powershell
cd path\to\project\f:\task
npm install
```

2. Run dev server:

```powershell
npm run dev
```

Open http://localhost:3000

Further improvements: virtualization for very large datasets, drag-and-drop column reordering, tests and CI.

Static preview
--------------
There's a standalone static preview you can open in a browser without the Next.js app. It includes advanced client-side features wired via CDNs:

- `static/index.html` — preview implementing table, sorting, fuzzy search (Fuse.js), column drag-and-drop (SortableJS), analytics chart (Chart.js), CSV import/export (PapaParse), inline editing, pagination, theme toggle, and column persistence.

Open the preview:

PowerShell:
```powershell
# open file directly (may have file-API limitations in some browsers)
start 'f:\task\static\index.html'

# Or serve locally for best compatibility (recommended):
cd f:\task\static
npx http-server -c-1
```

The static preview is ideal for quick demos and exploration of the UI without running the full Next.js dev server.
