# V2-5 Final Stabilization — Target Design

1. Pre-login Google bind + license pull must work without RBAC session.
2. Destructive restore/wipe remain gated (Owner/admin ranks as policy).
3. OAuth uses PKCE S256 + loopback + encrypted refresh tokens + revoke on logout.
4. Google Sheets access is Apps Script vault only; client never crashes on vault errors.
5. Owner is an independent top role above Admin for org/license/transfer/emergency.
6. Admin remains operational manager with less power.
7. Full Install→Google→License→Org→Branch→Restore→Sync→Usage cycle must be re-validated.
8. Ready for main stays NO until independent review.
