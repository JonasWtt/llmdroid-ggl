cmake_minimum_required(VERSION 3.22.1)
project("pocketgguf" LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

include(FetchContent)

# Build llama.cpp & ggml as static libraries linked directly into libpocketgguf.so
# Disable OpenMP on Android so libomp.so is not required at runtime on user devices
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)

FetchContent_Declare(
    llama
    GIT_REPOSITORY https://github.com/ggml-org/llama.cpp.git
    GIT_TAG        b5400
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(llama)

add_library(
    pocketgguf
    SHARED
    llama_jni_bridge.cpp
)

find_library(
    log-lib
    log
)

target_link_options(
    pocketgguf
    PRIVATE
    "-Wl,--wrap=fopen"
)

target_link_libraries(
    pocketgguf
    PRIVATE
    llama
    ggml
    android
    ${log-lib}
)
