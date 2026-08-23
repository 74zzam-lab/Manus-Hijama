# V2-5.9 Responsive UAT

Test Login / Activation / BootFlow / Owner Hub / all modals.

| Resolution | 100% | 125% | 150% | 175% |
|------------|------|------|------|------|
| 1024×768 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 1280×720 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 1366×768 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 1440×900 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 1600×900 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 1920×1080 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| 2560×1440 | UNVERIFIED | UNVERIFIED | UNVERIFIED | UNVERIFIED |

| Check | Result |
|-------|--------|
| Safe area ≈ clamp(24px,5vh,48px) top/bottom | UNVERIFIED |
| Modal never touches viewport edges | UNVERIFIED |
| Modal never clips outside window | UNVERIFIED |
| Header visible | UNVERIFIED |
| Body scrollable (single scroll) | UNVERIFIED |
| Footer / primary actions always visible | UNVERIFIED |
| No cropped/hidden elements | UNVERIFIED |
| No unintended horizontal scroll | UNVERIFIED |
| No chaotic wrap on Google/License/Branch/Device | UNVERIFIED |
| Activation grid 3→2→1 | UNVERIFIED |
| Sticky wizard header/footer | UNVERIFIED |
| Tab reaches all fields/buttons | UNVERIFIED |
| 1024×768 + 175% scaling usable | UNVERIFIED |
| RTL + LTR | UNVERIFIED |
| Keyboard / focus order | UNVERIFIED |
| Zero console/rendering errors | UNVERIFIED |

**Pages:** Login · Registration/Owner create · Google OAuth · Activation & Licensing · License Pull/Key · Branch · Device · Data source · Restore · Owner password reset · BootFlow

Ready for main: NO  
Code layout fix landed — **Windows Setup EXE proof still required** (do not mark PASS from unit tests alone).
