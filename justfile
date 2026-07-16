qlever_dir := home_directory() / "code" / "qlever"
build_dir := qlever_dir / "build"
modified_dir := justfile_directory() / "modified_qlever_files"
public_dir := justfile_directory() / "public"
wasm_output_dir := build_dir / "src" / "libqlever"

# Copy modified files, install deps, configure, and build
build: copy-files patch-sources install configure compile deploy

# Copy modified QLever files into the qlever source tree
copy-files:
    cp {{modified_dir}}/CMakeLists.txt {{qlever_dir}}/src/libqlever/
    cp {{modified_dir}}/Qlever.cpp {{qlever_dir}}/src/libqlever/
    cp {{modified_dir}}/dummy.cpp {{qlever_dir}}/src/libqlever/
    cp {{modified_dir}}/conanfile.txt {{qlever_dir}}/
    cp {{modified_dir}}/emscripten.profile {{qlever_dir}}/conanprofiles/

# Patch upstream QLever sources for WASM memory constraints (4 GB ceiling)
patch-sources:
    # METHODOLOGY (2026-06-16 rewrite): start from a VANILLA upstream tree and
    # re-add patches ONE AT A TIME, only after a build proves the patch is
    # required. Every patch must correspond to a documented bottleneck in
    # BOTTLENECKS.md (error evidence + root cause + measured effect). Do NOT
    # re-add the old stale patch set wholesale — upstream changed and most no
    # longer match.
    #
    # Bottleneck #1: twinRelationSorter_ reserves 4 GB per permutation pair,
    # blowing the 4 GB ceiling even for a 1-triple dataset. Reduce to 128 MB.
    # See BOTTLENECKS.md#bottleneck-1.
    sed -i 's%4_GB, alloc_},%128_MB, alloc_},%' {{qlever_dir}}/src/index/CompressedRelationPermutationWriterImpl.h
    #
    # Bottleneck #2: the partial-vocabulary pipeline (setupParallelPipeline<
    # NUM_PARALLEL_ITEM_MAPS>) deadlocks under WASM pthreads with the default
    # fan-out of 10. Collapse to a single item-map stage. See
    # BOTTLENECKS.md#bottleneck-2.
    sed -i 's|NUM_PARALLEL_ITEM_MAPS = 10;|NUM_PARALLEL_ITEM_MAPS = 1;|' {{qlever_dir}}/src/index/ConstantsIndexBuilding.h

# Install dependencies via Conan
install:
    cd {{qlever_dir}} && conan install . \
        -pr:b default \
        -pr:h conanprofiles/emscripten.profile \
        -s build_type=Release \
        -b missing \
        -of build

# Configure CMake
configure:
    cd {{build_dir}} && cmake -S .. -B . \
        -DCMAKE_TOOLCHAIN_FILE=conan_toolchain.cmake \
        -DCMAKE_BUILD_TYPE=Release \
        -DLOGLEVEL=TRACE \
        -DUSE_PARALLEL=true \
        -D_NO_TIMING_TESTS=ON \
        -D_EMSCRIPTEN_NO_INDEXBUILDER_AND_SERVER=ON \
        -D_NO_BENCHMARK=ON \
        -D_DISABLE_EMSCRIPTEN_PROBLEMATIC_TESTS=ON \
        -GNinja

# Build WASM output
compile:
    cd {{build_dir}} && cmake --build . --target qleverwasm

# Copy WASM build output into public/
deploy:
    cp {{wasm_output_dir}}/qlever.js {{public_dir}}/
    cp {{wasm_output_dir}}/qlever.wasm {{public_dir}}/

# Rebuild (skip conan install, just compile + deploy)
rebuild: compile deploy

# Clean build directory
clean:
    rm -rf {{build_dir}}
