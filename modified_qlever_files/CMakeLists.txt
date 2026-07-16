
# Locate the ICU .dat file.
# Try 1: Conan ICU package variables (set by CMakeDeps if ICU is a dependency)
file(GLOB ICU_DAT_FILE "${icu_RES_DIRS_RELEASE}/icudt*.dat")
if(NOT ICU_DAT_FILE)
    file(GLOB ICU_DAT_FILE "${icu_PACKAGE_FOLDER_RELEASE}/res/icudt*.dat")
endif()
# Try 2: Emscripten ICU port cache (when using -sUSE_ICU=1)
if(NOT ICU_DAT_FILE)
    get_filename_component(EMSCRIPTEN_ROOT "${CMAKE_C_COMPILER}" DIRECTORY)
    file(GLOB ICU_DAT_FILE "${EMSCRIPTEN_ROOT}/cache/ports/icu/icu/source/data/in/icudt*.dat")
endif()
if(NOT ICU_DAT_FILE)
    message(FATAL_ERROR "Could not find ICU .dat file. Check your Conan ICU package or Emscripten ICU port.")
endif()
# Get just the filename (e.g. icudt68l.dat)
get_filename_component(ICU_DAT_NAME "${ICU_DAT_FILE}" NAME)
message(STATUS "Embedding ICU data: ${ICU_DAT_FILE} as /icu/${ICU_DAT_NAME}")

add_executable(qleverwasm dummy.cpp)

target_compile_options(qleverwasm PRIVATE -fexceptions)

set_target_properties(qleverwasm PROPERTIES
    OUTPUT_NAME "qlever"
    SUFFIX ".js"
)

target_link_options(qleverwasm PRIVATE
    # Module format
    -sMODULARIZE=1
    -sEXPORT_NAME=QLever
    -sENVIRONMENT=web,worker
    -sEXPORT_ES6=0
    -sEXPORTED_RUNTIME_METHODS=['FS','getExceptionMessage']
    --no-entry

    # Threading (no PROXY_TO_PTHREAD — module runs in a Web Worker)
    -sUSE_PTHREADS=1
    -sPTHREAD_POOL_SIZE=32
    -sPTHREAD_POOL_SIZE_STRICT=0
    -sDEFAULT_PTHREAD_STACK_SIZE=4194304

    # Memory
    -sALLOW_MEMORY_GROWTH=1

    # Debugging / exceptions
    -sDISABLE_EXCEPTION_CATCHING=0
    -fexceptions
    -sSAFE_HEAP=0
    -sPTHREADS_DEBUG=1
    -sASSERTIONS=2
    --minify=0

    -sERROR_ON_WASM_CHANGES_AFTER_LINK=0

    # Embed ICU data into the WASM virtual filesystem
    "SHELL:--embed-file ${ICU_DAT_FILE}@/icu/${ICU_DAT_NAME}"
)

target_link_libraries(qleverwasm PRIVATE embind "-Wl,--whole-archive" qlever "-Wl,--no-whole-archive")


add_library(qlever STATIC Qlever.cpp)
target_compile_options(qlever PRIVATE -fexceptions)
qlever_target_link_libraries(qlever parser engine util index absl::strings embind)
