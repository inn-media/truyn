# D-500 Attempt 12 controller guards

- Frozen candidate: `a247d1a0eeb08483701db7af47a4049342d96be8`
- Frozen tree: `d1ebbc571b4fda2af3655e6b97e21a12b0b28b12`
- Qualification evidence: run `36960915266`
- Admission evidence before controller merge: run `37075967140`
- Base main: `3622ee2d9e19efbb6cd81dee9cfd4d2a80eb5d77`
- Attempt 11 is immutable evidence and must not be rerun.
- Attempt 12 launch token does not exist in this PR.
- After merge, admission must be refreshed against the new exact main before any launch token is created.
- Exactly one launch token may be created after duplicate, capacity and collision guards pass.
