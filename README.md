# Tiny Stack VM

A stack VM for make.fun's `tiny-stack-vm-01-run-20261122` bounty: runs each
drawn program (ISA.md v1) and answers with the bytes it writes and
the exit code it ends with.

![bounty](https://make.fun/badge/tiny-stack-vm-01-run-20261122.svg)
![rank](https://make.fun/badge/tiny-stack-vm-01-run-20261122/Nadanese93/tiny-stack-vm-01-run-20261122/rank.svg)
![reward](https://make.fun/badge/tiny-stack-vm-01-run-20261122/Nadanese93/tiny-stack-vm-01-run-20261122/reward.svg)

`node main.ts` reads `MAKEFUN_INPUT_DIR` (default `/input`), writes
`MAKEFUN_OUTPUT_DIR` (default `/output`): per instance `<id>/stdout.bin` and
`<id>/exit.txt`.
