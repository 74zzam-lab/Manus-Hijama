# V2-5.3 — Module Wiring Matrix

| Module | Status | Notes |
|--------|--------|-------|
| OwnerBootstrap | WIRED | TTL + CAS claim; boot-flow + Owner Hub redeem |
| OwnerProfile | WIRED | recovery/transfer/sessionEpoch/emergency |
| OwnerMigration | WIRED | demoteOwnerRole + promote options |
| OwnerHub | WIRED | redeem/emergency/reset/transfer UI |
| BootFlowUI | WIRED | redeemSetupToken button |
| LicenseCloud | WIRED | local CAS + optional push |
| DeviceRegistry | WIRED | transferDevice + canSync revoke |
| CenterId | WIRED | confirmCenterSwitch |
| LicenseLimits | WIRED | maxUsers + offline grace |
| LicenseLifecycle | WIRED | refresh/upgrade/downgrade |
| index.html | WIRED | maxUsers, grace hard-block, sessionEpoch |
