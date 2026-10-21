# Known limitations (stated plainly)

- **Content**: see `docs/CONTENT_REPORT.md` for how many of the 1,300 units are authored. All authored lessons and questions were drafted with AI assistance and have **not** been theologically reviewed.
- Payments (Paystack) and email (Resend) are written to the documented APIs but have **not** been tested against live accounts. Without keys, no payment can be taken and email is held.
- AI-assisted authoring is not implemented (the platform is complete without it).
- PDF import extracts selectable text only; scanned PDFs need OCR first. No virus scanning of uploads.
- Printing/PDF uses the browser's Print; DOCX export exists for curricula. No server-side PDF generation.
- Offline/PWA caching is not implemented; examinations require a connection (answers autosave and the session recovers).
- Files are stored in the database (fine for logos); object storage is not configured.
- Row-level security is not enabled (composite foreign keys + server scoping are used instead).
- Maintenance mode setting is stored but not yet enforced on pages.
- Accessibility targets WCAG 2.2 AA but has not had an external audit; no automated browser end-to-end suite (integration tests cover the workflow at service level).
- Legal pages are templates awaiting legal review.
