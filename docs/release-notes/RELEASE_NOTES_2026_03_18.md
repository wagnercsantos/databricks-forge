# Release Notes -- 2026-03-18

**Databricks Forge v0.38.1**

---

## v0.38.1 -- Fix runs page not showing runs for any user

### Bug Fixes
- **Runs page empty for all users due to user-scoping mismatch** -- The `/runs` page and `GET /api/runs` filtered results by `createdBy` (the current user's email from `x-forwarded-email`), but the Databricks Apps proxy does not consistently set this header, causing a mismatch between the email stored at run creation time and the email resolved at listing time. Neither user could see their own runs, while the dashboard's "Recent Runs" (which had no filter) displayed them correctly. Removed the user-scoping filter so the runs page now shows all runs from all users, matching the dashboard behaviour. The `createdBy` field is still recorded on new runs for audit purposes.

---

## All Commits

| Hash | Summary |
|---|---|
| `ad9bcac` | fix: remove user-scoping from /runs page so all users see all runs |
