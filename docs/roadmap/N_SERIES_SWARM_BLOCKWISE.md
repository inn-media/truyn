# N-Series Swarm-Blockwise contract

N-Series qualification is candidate-bound and executes N1-N7 independently through Swarm-Blockwise. `main` movement triggers admission analysis over `BASE_SHA -> current main`; it does not automatically invalidate frozen qualification evidence. Only N-sensitive affected blocks are rerun. Unknown protected drift fails closed.

The final combined-state Admission Gate is mandatory before merge or measured execution. Old GREEN evidence alone is never launch authority.

N/SOVEREIGNTY is three independent measured cells: **10 -> 50 -> 100**. Each cell requires its own fresh admission; a smaller cell cannot authorize a larger cell.

These rules are machine locked by `config/n-series-swarm-blockwise-architecture-lock.json` and `.github/workflows/n-series-swarm-blockwise-lock.yml` and must not be weakened or bypassed.
