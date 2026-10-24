# MS47 build spike: engraving + MusicXML without Qt.
# Included from the root CMakeLists.txt when MS47_SPIKE_ENGINE_ONLY=ON (after SetupConfigure).

set(MUSE_QT_SUPPORT OFF CACHE BOOL "" FORCE)
set(MUSE_ENABLE_UNIT_TESTS OFF CACHE BOOL "" FORCE)
set(MUSE_COMPILE_USE_PCH OFF CACHE BOOL "" FORCE)
set(MUSE_COMPILE_USE_UNITY ON CACHE BOOL "" FORCE)
set(MUSE_MODULE_DRAW_USE_QTFONTMETRICS OFF CACHE BOOL "" FORCE)
set(MUSE_MODULE_GLOBAL_LOGGER_DEBUGLEVEL OFF CACHE BOOL "" FORCE)

set(MUE_BUILD_ENGRAVING_QML OFF)
set(MUE_BUILD_ENGRAVING_TESTS OFF)
set(MUE_BUILD_ENGRAVING_DEVTOOLS OFF)
set(MUE_BUILD_ENGRAVING_PLAYBACK OFF)
set(MUE_BUILD_IMPORTEXPORT_TESTS OFF)
set(MUSICXML_NO_INTERNAL ON)
set(ENGRAVING_NO_INTERNAL ON)
set(ENGRAVING_NO_ACCESSIBILITY ON)
set(GLOBAL_NO_INTERNAL ON)

if (OS_IS_WASM)
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -sUSE_ZLIB=1")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -sUSE_ZLIB=1")
    set(MUSE_THREADS_SUPPORT OFF CACHE BOOL "" FORCE)
    set(MUSE_CONFIGURATION_IS_WEB ON CACHE BOOL "" FORCE)
endif()

# MuseSetupConfiguration is already included by SetupConfigure; MUSE_QT_SUPPORT must be OFF on the command line.
if (MUSE_QT_SUPPORT)
    message(FATAL_ERROR "Configure with -DMUSE_QT_SUPPORT=OFF")
endif()

set(THIRDPARTY_DIR ${PROJECT_SOURCE_DIR}/thirdparty)

add_subdirectory(${MUSE_FRAMEWORK_SRC_PATH}/global spike_global)
add_subdirectory(${MUSE_FRAMEWORK_SRC_PATH}/draw spike_draw)
add_subdirectory(${PROJECT_SOURCE_DIR}/src/engraving spike_engraving)
add_subdirectory(${PROJECT_SOURCE_DIR}/src/importexport/musicxml spike_musicxml)

# ENGRAVING_NO_INTERNAL drops these, but they are Qt-free and layout needs the SMuFL fonts provider
target_sources(engraving PRIVATE
    ${PROJECT_SOURCE_DIR}/src/engraving/internal/engravingfont.cpp
    ${PROJECT_SOURCE_DIR}/src/engraving/internal/engravingfontsprovider.cpp
)

add_executable(ms47_spike ${CMAKE_CURRENT_LIST_DIR}/spike_main.cpp)
target_link_libraries(ms47_spike PRIVATE iex_musicxml engraving muse::draw muse::global)
target_include_directories(ms47_spike PRIVATE
    ${PROJECT_BINARY_DIR}
    ${PROJECT_SOURCE_DIR}/src
    ${PROJECT_SOURCE_DIR}/src/framework
    ${PROJECT_SOURCE_DIR}/src/framework/global
    ${PROJECT_SOURCE_DIR}/src/engraving
)
if (OS_IS_WASM)
    target_link_options(ms47_spike PRIVATE
        "SHELL:-s USE_ZLIB=1" "SHELL:-s ALLOW_MEMORY_GROWTH=1" "SHELL:-s INITIAL_MEMORY=64MB"
        "SHELL:-s STACK_SIZE=5MB" "SHELL:-s NODERAWFS=1" "SHELL:-s EXIT_RUNTIME=1" "SHELL:-s ENVIRONMENT=node")
else()
    target_link_options(ms47_spike PRIVATE -rdynamic -no-pie)
endif()
