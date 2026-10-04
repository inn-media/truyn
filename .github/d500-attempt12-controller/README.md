Canonical D-500 Attempt 12 controller transition for task `truyn-d500-acceptance-repair-8f3c2a`.

This PR changes the acceptance controller from immutable Attempt 11 to Attempt 12 for frozen candidate `a247d1a0eeb08483701db7af47a4049342d96be8` / tree `d1ebbc571b4fda2af3655e6b97e21a12b0b28b12`.

The PR itself cannot launch D-500. After merge, the D-series admission must be refreshed against the exact new `main`. A launch token may be created only after the refreshed admission and the duplicate/capacity/collision guards pass.
