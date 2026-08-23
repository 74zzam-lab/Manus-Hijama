# Security Report

- **bundle_tamper**: PASS — bundle_tampered
- **registry_invalid-sig**: PASS — registry_tampered:invalid-sig
- **registry_missing-sig**: PASS — registry_sig_missing:missing-sig
- **registry_wrong-schema**: PASS — registry_tampered:wrong-schema
- **registry_wrong-version**: WARN — version field detectable; app should compare expected version
- **registry_tampered-body**: PASS — registry_tampered:tampered-body
- **malformed_key**: PASS — 
- **malformed_key**: PASS — XXXXX
- **malformed_key**: PASS — TDWI2
- **malformed_key**: PASS — TDWI2-P99
- **malformed_key**: PASS — TDWI2-P03AA-!!!!!
- **malformed_key**: PASS — NOT-A-KEY-AT-ALL
- **hmac_validation**: PASS — V5 MAC rejects tampered keys
- **registry_signatures**: PASS — PBKDF2+HMAC-SHA256
