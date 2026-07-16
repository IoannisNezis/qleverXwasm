# QLever Source Modifications for WebAssembly

All changes to the upstream QLever source code are applied at build time.
Modified files in `modified_qlever_files/` replace their upstream counterparts.
Patches in the `justfile` `patch-sources` step modify upstream files via `sed`.

## Why: the 4 GB hard ceiling

WebAssembly with pthreads uses `SharedArrayBuffer`, which is limited to
4 GB by browser engines (V8/SpiderMonkey). This limit applies regardless
of `-sMEMORY64`. We build in **wasm32 mode** (32-bit pointers) to
maximize usable memory within this ceiling — wasm64 doubles pointer size
and wastes address space for no benefit under the 4 GB cap. QLever's
defaults are tuned for native builds with datasets like Wikidata
(20 billion triples) and assume tens of gigabytes of RAM. Every constant
below was reduced to fit index building within the 4 GB WASM memory ceiling.

### Architecture: wasm32

The Conan profile (`emscripten.profile`) sets `arch=wasm` (32-bit).
`-sMEMORY64` is **not** used. This means:
- Pointers are 4 bytes (not 8), halving pointer overhead in all data structures
- Maximum addressable memory is 4 GB, matching the SharedArrayBuffer limit
- `MAXIMUM_MEMORY` is set to 4 GB in the linker flags

> **Note:** wasm64 (`-sMEMORY64=1`) was previously tried but provides no benefit —
> `SharedArrayBuffer` (required for pthreads) is capped at 4 GB by browser engines
> regardless of Memory64 support, so 64-bit pointers only waste address space.

---

## Modified files (copied into qlever source tree)

### `src/libqlever/CMakeLists.txt`

Replaces the upstream CMakeLists to build a WASM module with Emscripten bindings.

| Setting | Value | Rationale |
|---------|-------|-----------|
| `PTHREAD_POOL_SIZE` | 20 | Pre-allocated Web Worker threads. |
| `PTHREAD_POOL_SIZE_STRICT` | 2 | Warns (but does not fail) if the pool is exhausted at runtime. |
| `DEFAULT_PTHREAD_STACK_SIZE` | 4 MB (4194304) | Upstream default is 16 MB. With 20 threads this uses 80 MB total instead of 320 MB (20 × 16 MB). |
| `PTHREADS_DEBUG` | 1 | Logs pthread operations (creation, joins, mutex). Set to 0 for production. |
| `ASSERTIONS` | 2 | Catches WASM runtime errors. Set to 0 for production. |
| `NO_MINIFY` | 1 | Keeps `qlever.js` readable for debugging. Remove for production. |

### `src/libqlever/Qlever.cpp`

Replaces the upstream file. Contains the `buildIndex()` implementation and
Emscripten embind bindings. Changes vs upstream:

- Embind bindings expose `noPatterns`, `onlyPsoAndPos`, `settingsFile`,
  `setParserBufferSizeMB()` in addition to the original `baseName`,
  `inputFiles`, and `setMemoryLimitMB()`.

---

## Patched constants (applied by `just patch-sources`)

### `src/index/ConstantsIndexBuilding.h`

| Constant | Upstream | Patched | Purpose |
|----------|----------|---------|---------|
| `NUM_TRIPLES_PER_PARTIAL_VOCAB` | 100,000 | 10,000 | Triples processed per vocabulary batch. Smaller batches use less RAM per batch. Can be overridden at runtime via the settings JSON key `num-triples-per-batch`. |
| `PARSER_BATCH_SIZE` | 1,000,000 | 10,000 | Triples the parser buffers before processing. Controls the pipeline's in-flight memory. Can be overridden at runtime via the settings JSON key `parser-batch-size`. |
| `NUM_PARALLEL_ITEM_MAPS` | 2 | 1 | Parallel hash maps for vocabulary ID assignment. This is a template parameter (`setupParallelPipeline<NUM_PARALLEL_ITEM_MAPS>`) so it cannot be changed at runtime. Halving it halves the hash map memory. |
| `NUM_PARALLEL_PARSER_THREADS` | 8 → 2 | 1 | Threads for the parallel Turtle parser. Fewer threads = fewer stacks, less concurrent memory pressure, and fewer Web Workers consumed. |
| `QUEUE_SIZE_BEFORE_PARALLEL_PARSING` | 10 | 2 | Unparsed blocks buffered before the parser. Each block holds raw RDF text. |
| `QUEUE_SIZE_AFTER_PARALLEL_PARSING` | 10 | 2 | Parsed blocks buffered after the parser. Each block holds parsed triples. |
| `BATCH_SIZE_VOCABULARY_MERGE()` | 10,000,000 | 100,000 | Entries buffered during vocabulary merge. This is a `std::atomic` so technically runtime-adjustable, but there is no public setter exposed. |

### `src/index/CompressedRelationPermutationWriterImpl.h`

| Constant | Upstream | Patched | Purpose |
|----------|----------|---------|---------|
| Twin relation sorter memory | 4 GB (`4_GB`) | 128 MB (`128_MB`) | Memory budget for the `twinRelationSorter_` in `PermutationWriter`. Created once per permutation pair to handle large relations (e.g. `rdf:type`). The upstream 4 GB budget reserves ~2 GB upfront for a single block buffer, which combined with existing heap usage exceeds the 4 GB WASM ceiling. |

### `src/index/IndexImpl.cpp`

| Constant | Upstream | Patched | Purpose |
|----------|----------|---------|---------|
| Unsorted-triples buffer | 1 GB (`1_GB`) | 128 MB (`128_MB`) | Memory buffer for the external `TripleVec` that stores unsorted triple IDs before sorting. This is the `ExternalVector` block buffer passed to the constructor at line ~485. |
| `lookupQueue` thread count | 10 | 2 | Threads for partial→global ID lookups in `convertPartialToGlobalIds()`. Upstream uses 10 for throughput on large datasets; reduced to avoid exhausting the WASM Web Worker pool. |
| `queueManager` thread count | 5 | 1 | Threads for reading partial vocabulary ID map files in `convertPartialToGlobalIds()`. Reduced for same reason. Queue size also reduced from 10 to 4. |

### `src/global/Constants.h`

| Constant | Upstream | Patched | Purpose |
|----------|----------|---------|---------|
| `DEFAULT_MEMORY_LIMIT_INDEX_BUILDING` | 5 GB (`5_GB`) | 1 GB (`1_GB`) | Upper bound on memory for sorting and permutation building. Divided equally among 2 simultaneous external sorters. Can be overridden at runtime via `setMemoryLimitMB()`. |

Note: `DEFAULT_MEM_FOR_QUERIES` (4 GB) is NOT patched. It is only used
when no explicit memory limit is set via the `EngineConfig` constructor.

---

## CMake configure flags

Set in the `justfile` `configure` step:

| Flag | Value | Rationale |
|------|-------|-----------|
| `LOGLEVEL` | `TRACE` | Enables all `AD_LOG_DEBUG`, `AD_LOG_TIMING`, `AD_LOG_TRACE` statements compiled into the QLever source. Set to `INFO` for production. |
| `USE_PARALLEL` | `true` | Enables `__gnu_parallel::sort`. Required for index building. |

---

## Runtime-configurable parameters

These can be set from JavaScript without recompiling:

### Via embind properties on `IndexBuilderConfig`

| Property | Type | Effect |
|----------|------|--------|
| `setMemoryLimitMB(mb)` | function | Overrides `DEFAULT_MEMORY_LIMIT_INDEX_BUILDING` for this build. |
| `setParserBufferSizeMB(mb)` | function | Sets the RDF parser chunk size. Must be large enough for the largest single statement. |
| `noPatterns` | boolean | Skips pattern precomputation. Saves memory but disables certain query optimizations. |
| `onlyPsoAndPos` | boolean | Builds only 2 permutations instead of 6. Significant memory and time savings. Only supports queries where predicates are bound. |
| `settingsFile` | string | Path (in Emscripten VFS) to a JSON settings file. |

### Via the JSON settings file

Write a JSON file to the Emscripten VFS and set `config.settingsFile` to its path.
Supported keys (read by `IndexImpl::readIndexBuilderSettingsFromFile()`):

| Key | Type | Default (patched) | Effect |
|-----|------|--------------------|--------|
| `num-triples-per-batch` | integer | 10,000 | Overrides `NUM_TRIPLES_PER_PARTIAL_VOCAB`. |
| `parser-batch-size` | integer | 10,000 | Overrides `PARSER_BATCH_SIZE`. |
| `parallel-parsing` | boolean | auto | Force enable/disable the parallel parser. |
| `locale` | string | `"en_US"` | Collation locale for vocabulary sorting. |
| `ignore-punctuation` | boolean | false | Ignore punctuation in collation. |
| `ascii-prefixes-only` | boolean | false | Faster parsing for well-behaved Turtle files. |
| `prefixes-external` | string[] | [] | IRI prefixes to externalize (not keep in RAM). |
| `languages-internal` | string[] | default set | Language tags to keep in internal vocabulary. |
| `parser-integer-overflow-behavior` | string | `"overflowing-integers-throw"` | How to handle integer overflow: `"overflowing-integers-throw"`, `"overflowing-integers-become-doubles"`, or `"all-integers-to-double"`. |

---

## Constants NOT patched (unchanged from upstream)

These were evaluated but left at their upstream values:

| Constant | Value | Location | Reason |
|----------|-------|----------|--------|
| `MAX_INTERNAL_LITERAL_BYTES` | 1,000,000 | ConstantsIndexBuilding.h | Only affects very large literals. |
| `PARSER_MIN_TRIPLES_AT_ONCE` | 10,000 | ConstantsIndexBuilding.h | Minimum for stream parsing efficiency. |
| `THRESHOLD_RELATION_CREATION` | 2,097,152 | ConstantsIndexBuilding.h | Threshold for MmapVector vs RAM. Unlikely to be hit with small datasets. |
| `BLOCKSIZE_VOCABULARY_MERGING` | 100 | ConstantsIndexBuilding.h | Small enough already. |
| `BUFFER_SIZE_PARTIAL_TO_GLOBAL_ID_MAPPINGS` | 10,000 | ConstantsIndexBuilding.h | Small enough already. |
| `BUFFER_SIZE_JOIN_PATTERNS_WITH_OSP` | 50,000 | ConstantsIndexBuilding.h | Only used if patterns are enabled. |
| `UNCOMPRESSED_BLOCKSIZE_COMPRESSED_METADATA_PER_COLUMN` | 250 KB | ConstantsIndexBuilding.h | Metadata block size, minimal memory impact. |
| `BZIP2_MAX_TOTAL_BUFFER_SIZE` | 1 GB | ConstantsIndexBuilding.h | Only used for BZIP2 input recovery. |
| `DEFAULT_MEM_FOR_QUERIES` | 4 GB | Constants.h | Query-time limit, not index building. |
| `NUM_SORT_THREADS` | 4 | Constants.h | Used by parallel sort, fits within thread pool. |
