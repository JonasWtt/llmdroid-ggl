cmake_minimum_required(VERSION 3.22.1)
project("pocketgguf" LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Optional: To link full upstream llama.cpp submodule, uncomment:
# add_subdirectory(llama.cpp)

add_library(
    pocketgguf
    SHARED
    llama_jni_bridge.cpp
)

find_library(
    log-lib
    log
)

target_link_libraries(
    pocketgguf
    ${log-lib}
    # llama
)
