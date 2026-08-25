# V2-5.3 — Target Design

## Owner claim

`redeemSetupToken` → verify signature/hash + TTL + not consumed → synchronous CAS on `licenseVersion` → mark consumed → `OwnerProfile.createProfile` once → store emergencyRecoveryHash+recoverySalt → audit.

Race: second device gets `bootstrap_already_consumed` / `claim_conflict`.

## Recovery / transfer

Authorized emergency recovery recreates OwnerProfile using license emergency hash + salt (Google alone denied). Transfer promotes new owner (`noCurrentUserFallback`), demotes old to admin, bumps `sessionEpoch`, audits.

## Identity / License

IDs stable in userData. `CenterId.setCenterId` requires `CONFIRM_CENTER_SWITCH`. Revoke/transfer blocks sync without DB wipe. `LicenseLimits.canCreateUser` + `evaluateOfflineGrace` enforced. `LicenseLifecycle` upgrade/downgrade touches limits/features only.
