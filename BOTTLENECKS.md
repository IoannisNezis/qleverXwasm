# WASM Index-Build Bottlenecks — Error Log

A chronological, evidence-first log of every memory/resource bottleneck hit while
building a QLever index inside the 4 GB WASM (SharedArrayBuffer) ceiling.

**Methodology.** Start from a vanilla upstream tree (empty `patch-sources`). For
each bottleneck:

1. **Reproduce** — build + run, capture the failing allocation from the log.
2. **Locate** — find the exact constant/allocation in upstream source.
3. **Patch** — smallest `sed` rule in the `justfile` `patch-sources` step that
   clears *this* bottleneck.
4. **Verify** — rebuild + re-run, confirm we advance past the previous failure.
5. **Document** — record the result below and mirror the final patch table in
   `QLEVER_PATCHES.md`.

Upstream pin: `qlever` @ `65279e68` (checked 2026-06-16).
Test dataset: `Size_1.nt` (1 triple), `baseName=input`, default 6 permutations.

Status legend: 🔴 open · 🟡 patched, pending verify · 🟢 verified fixed

---

## Bottleneck #1 — Twin relation sorter reserves 4 GB per permutation pair

**Status:** 🟡 patched (128 MB stopgap); switching to upstream PR #2890

**Phase:** `Creating permutations PSO and POS`

**Error (vanilla, 2026-06-16 14:07):**
```
INFO: Creating permutations PSO and POS ...
w:0,t:0x02235af8: warning: unsupported syscall: __syscall_madvise
w:0,t:0x02235af8: Cannot enlarge memory, requested 4482846720 bytes, but the limit is 4294967296 bytes!
w:0,t:0x02235af8: Cannot enlarge memory, requested 4482850816 bytes, but the limit is 4294967296 bytes!
buildIndex failed: std::bad_alloc
```

Requested **4,482,846,720 B ≈ 4.17 GB** for a **1-triple** dataset — far past the
4,294,967,296 B (4 GB) ceiling. The size is dataset-independent, so it is a fixed
upfront reservation, not data.

**Root cause.** Each `PermutationWriter` that writes a *pair* of permutations
constructs a `twinRelationSorter_` (`CompressedExternalIdTableSorter`) with a
**4 GB** memory budget. One such writer exists per permutation pair (PSO/POS is
the first), and the `CompressedExternalIdTableSorter` reserves a large block
buffer up front from that budget.

`src/index/CompressedRelationPermutationWriterImpl.h:146`
```cpp
twinRelationSorter_{basename + ".twin-twinRelationSorter", numColumns_,
                    4_GB, alloc_},
```

**Patch (stopgap, applied 2026-06-16):** reduce the hardcoded budget.
```
sed -i 's%4_GB, alloc_},%128_MB, alloc_},%' \
    {{qlever_dir}}/src/index/CompressedRelationPermutationWriterImpl.h
```

**Proper fix — upstream PR #2890** ("Make block size for `TwinRelationSorter`
configurable"): the budget becomes a parameter threaded from the call site as
`memoryLimitIndexBuilding() / 4`, i.e. tied to our `setMemoryLimitMB()` instead
of a hardcoded 4 GB. We will apply this PR via `git apply` and drop the 128 MB
sed. https://github.com/ad-freiburg/qlever/pull/2890

**Result:** With the 128 MB stopgap, the build no longer dies at PSO/POS
permutation creation — it now advances and hangs *earlier* at parsing, which
exposed Bottleneck #2 (the failure point moved, confirming #1 is cleared).

---

## Bottleneck #2 — Parallel Turtle parser hangs under WASM pthreads

**Status:** 🟡 patched (runtime `parallel-parsing: false`), pending verify

**Phase:** `Parsing input triples and creating partial vocabularies, one per batch`

**Error (patch-#1 build, 2026-06-16 14:20, 1-triple input):** no exception —
a **hang**. The log freezes at:
```
INFO: Processing triples from single input stream input.nt (parallel = true) ...
INFO: Parsing input triples and creating partial vocabularies, one per batch ...
```
…and never progresses (≥40 s for 1 triple). The worker spawns/destroys many
threads (w:1…w:27 in PTHREADS_DEBUG output); heap grows to ~2.4 GB then stalls.
No `Triples parsed` line is ever printed.

**Root cause.** QLever defaults to the *parallel* Turtle parser (it even warns:
`Implicitly using the parallel parser for a single input file ... deprecated`).
The parallel parser's worker-thread pipeline deadlocks/races under Emscripten
pthreads. This is **non-deterministic**: the vanilla run happened to get past
parsing (then died at #1); this run deadlocked in parsing.

**Attempt A (runtime, no rebuild):** force the single-threaded parser via the
settings file — `src/ui/events.ts` passes
`settingsJson: '{"parallel-parsing": false}'`. **Insufficient.** Log confirmed
`Processing triples ... (parallel = false)` but it still hung at the same line.
So the deadlock is *not* the Turtle parser threads — it is the item-map pipeline
that wraps the parser.

**Attempt B (compile-time, needs rebuild):** collapse the item-map fan-out.
```
sed -i 's|NUM_PARALLEL_ITEM_MAPS = 10;|NUM_PARALLEL_ITEM_MAPS = 1;|' \
    {{qlever_dir}}/src/index/ConstantsIndexBuilding.h
```
`NUM_PARALLEL_ITEM_MAPS` is the template arg of
`setupParallelPipeline<...>` at `src/index/IndexImpl.cpp:526`, so it is a
compile-time constant. (Runtime `parallel-parsing: false` is kept — fewer
threads is strictly safer under the WASM pool.)

**Result:** _(pending rebuild with NUM_PARALLEL_ITEM_MAPS=1)_

---

<!--
Template for the next entry:

## Bottleneck #N — <short title>

**Status:** 🔴 open

**Phase:** <index-build phase>

**Error:**
```
<verbatim log lines>
```

**Root cause.** <what allocates, why, file:line>

**Patch:**
```
<sed rule added to justfile>
```

**Result:** <what the next build/run showed>
-->
