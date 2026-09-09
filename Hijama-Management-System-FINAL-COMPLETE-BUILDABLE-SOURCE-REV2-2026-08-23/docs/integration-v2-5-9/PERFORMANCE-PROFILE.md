# V2-5.9 Performance Profile

Measure on Windows Setup EXE (3 runs → median). Do not use sleep to hide latency.

| Operation | Run1 ms | Run2 ms | Run3 ms | Median | API calls | Network ms | DB ms | Lock wait | UI-blocking | Result |
|-----------|---------|---------|---------|--------|-----------|------------|-------|-----------|-------------|--------|
| Google callback | | | | | | | | | | UNVERIFIED |
| Drive activation scan | | | | | | | | | | UNVERIFIED |
| License validation | | | | | | | | | | UNVERIFIED |
| Organization fetch | | | | | | | | | | UNVERIFIED |
| Branch fetch | | | | | | | | | | UNVERIFIED |
| Device registration | | | | | | | | | | UNVERIFIED |
| Branch creation | | | | | | | | | | UNVERIFIED |
| Restore metadata scan | | | | | | | | | | UNVERIFIED |
| Restore | | | | | | | | | | UNVERIFIED |
| Initial sync | | | | | | | | | | UNVERIFIED |
| Owner Hub load | | | | | | | | | | UNVERIFIED |
| Owner account operation | | | | | | | | | | UNVERIFIED |

Targets: no frozen renderer; real progress; no duplicate requests; parallelize safe reads.

Ready for main: NO
