# 13 — Offline Queue UAT

## Automated

Outbox pending survives process restart; flush after reconnect delivers to peer (`test-v2-4-outbox-dual-device.js`).

## Installed Windows Device A

| Step | Result |
|------|--------|
| Offline create/edit client/visit/invoice/booking/expense/inventory | NOT_STARTED |
| Restart offline — data + outbox present | NOT_STARTED |
| UI shows Offline + pending count | NOT_STARTED |
| Reconnect flush → Device B receives | NOT_STARTED |
| No duplicates / no data loss | NOT_STARTED |
| Simulated week offline via clock abstraction | NOT_STARTED |
