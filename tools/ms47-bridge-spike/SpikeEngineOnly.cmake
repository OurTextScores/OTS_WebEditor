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
option(MS47_WITH_PLAYBACK "Build engraving playback (MPE) and the audio engine into the bridge" ON)
set(MUE_BUILD_ENGRAVING_PLAYBACK ${MS47_WITH_PLAYBACK})
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

# MuseSetupConfiguration is already included by SetupConfigure (it writes muse_framework_config.h): MUSE_QT_SUPPORT,
# MUSE_CONFIGURATION_IS_WEB, MUSE_THREADS_SUPPORT and MUSE_MODULE_AUDIO_EXPORT must be set on the command line (build.sh);
# the FORCE sets here only fix a reconfigure.
if (MUSE_QT_SUPPORT)
    message(FATAL_ERROR "Configure with -DMUSE_QT_SUPPORT=OFF")
endif()

set(THIRDPARTY_DIR ${PROJECT_SOURCE_DIR}/thirdparty)

add_subdirectory(${MUSE_FRAMEWORK_SRC_PATH}/global spike_global)
add_subdirectory(${MUSE_FRAMEWORK_SRC_PATH}/draw spike_draw)
if (MS47_WITH_PLAYBACK)
    # As upstream's own Qt-free WASM audio engine (src/web/audioengine): engine + common, FluidSynth, no export codecs
    set(MUSE_MODULE_AUDIO_EXPORT OFF CACHE BOOL "" FORCE)
    set(WEBENGINE_FACADE_MODE OFF)
    set(MUSE_MODULE_MPE_QML OFF)
    set(MUSE_MODULE_MPE_TESTS OFF)
    add_subdirectory(${MUSE_FRAMEWORK_SRC_PATH}/mpe spike_mpe)
    add_subdirectory(${MUSE_FRAMEWORK_SRC_PATH}/audio/common spike_audio_common)
    add_subdirectory(${MUSE_FRAMEWORK_SRC_PATH}/audio/engine spike_audio_engine)
endif()
add_subdirectory(${PROJECT_SOURCE_DIR}/src/engraving spike_engraving)
add_subdirectory(${PROJECT_SOURCE_DIR}/src/importexport/musicxml spike_musicxml)

# ENGRAVING_NO_INTERNAL drops these, but they are Qt-free and layout needs the SMuFL fonts provider
target_sources(engraving PRIVATE
    ${PROJECT_SOURCE_DIR}/src/engraving/internal/engravingfont.cpp
    ${PROJECT_SOURCE_DIR}/src/engraving/internal/engravingfontsprovider.cpp
)


# Preserve the original standalone harness when installed in its existing worktree.
if(EXISTS "${CMAKE_CURRENT_LIST_DIR}/spike_main.cpp")
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

endif()

if(OS_IS_WASM)
option(MS47_BRIDGE_FAST_LINK "Skip Binaryen optimization while porting" OFF)
option(MS47_BROWSER "Also link the browser package webmscore.lib.{js,wasm,data}" ON)
set(MS47_PRELOAD_DIR "" CACHE PATH "Resources preloaded at /res by the browser package (staged root minus lazy-resources.json)")

# One bridge, two link variants: ms47_bridge (Node, host file system: the test harness) and webmscore_lib (the 4.00
# browser package contract: ES module factory, MEMFS, preloaded resources)
function(ms47_bridge_target target)
    add_executable(${target} ${CMAKE_CURRENT_FUNCTION_LIST_DIR}/bridge.cpp)
    target_link_libraries(${target} PRIVATE iex_musicxml engraving muse::draw muse::global)
    if (MS47_WITH_PLAYBACK)
        target_link_libraries(${target} PRIVATE muse_audio_engine muse_audio_common muse::mpe embind)
        target_compile_definitions(${target} PRIVATE MS47_WITH_PLAYBACK)
        target_include_directories(${target} PRIVATE ${MUSE_FRAMEWORK_SRC_PATH}/mpe ${MUSE_FRAMEWORK_SRC_PATH}/audio ${MUSE_FRAMEWORK_SRC_PATH}/audio/engine)
    endif()
    # MIDI export: upstream's writer, made Qt-free by the patch (read/import path stays Qt-only)
    target_sources(${target} PRIVATE
        ${PROJECT_SOURCE_DIR}/src/importexport/midi/internal/midiexport/exportmidi.cpp
        ${PROJECT_SOURCE_DIR}/src/importexport/midi/internal/midishared/midifile.cpp
    )
    # Reuse the font libraries already configured by muse_draw for SVG glyph outlines.
    get_target_property(MS47_DRAW_INCLUDES muse_draw INCLUDE_DIRECTORIES)
    target_include_directories(${target} PRIVATE ${MS47_DRAW_INCLUDES})
    target_include_directories(${target} PRIVATE ${PROJECT_BINARY_DIR} ${PROJECT_SOURCE_DIR}/src
        ${PROJECT_SOURCE_DIR}/src/framework ${PROJECT_SOURCE_DIR}/src/framework/global ${PROJECT_SOURCE_DIR}/src/engraving)
    target_link_options(${target} PRIVATE
        "SHELL:-s USE_ZLIB=1" "SHELL:-s ALLOW_MEMORY_GROWTH=1" "SHELL:-s INITIAL_MEMORY=64MB" "SHELL:-s STACK_SIZE=5MB"
        "SHELL:-s MODULARIZE=1" "SHELL:-s NO_EXIT_RUNTIME=1"
        "SHELL:-s EXPORTED_FUNCTIONS=['_malloc','_free']"
        --no-entry)
    if(MS47_BRIDGE_FAST_LINK)
        target_link_options(${target} PRIVATE -O0 -g2 --emit-symbol-map)
    endif()
endfunction()

ms47_bridge_target(ms47_bridge)
target_link_options(ms47_bridge PRIVATE
    "SHELL:-s NODERAWFS=1" "SHELL:-s ENVIRONMENT=node" "SHELL:-s IMPORTED_MEMORY=1" "SHELL:-s EXPORT_NAME=MS47Bridge"
    "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','stringToUTF8','UTF8ToString','HEAPU8','getValue','FS_createPath','FS_createDataFile']")

if (MS47_BROWSER)
    if (NOT IS_DIRECTORY "${MS47_PRELOAD_DIR}")
        message(FATAL_ERROR "MS47_BROWSER needs MS47_PRELOAD_DIR (build.sh stages it)")
    endif()
    ms47_bridge_target(webmscore_lib)
    # Same names, module shape and runtime methods as the 4.00 package (web/CMakeLists.txt in the fork), so
    # web-public/src (helper.js, index.js) and its rollup bundles load it unchanged
    set_target_properties(webmscore_lib PROPERTIES OUTPUT_NAME webmscore SUFFIX ".lib.js"
        RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/browser)
    target_compile_definitions(webmscore_lib PRIVATE MS47_BROWSER)
    target_link_options(webmscore_lib PRIVATE
        "SHELL:-s ENVIRONMENT=web,worker,node" "SHELL:-s EXPORT_ES6=1"
        "SHELL:-s FORCE_FILESYSTEM=1" "SHELL:-s ALLOW_TABLE_GROWTH=1"
        "SHELL:-s NODEJS_CATCH_EXIT=0" "SHELL:-s NODEJS_CATCH_REJECTION=0"
        "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','stringToUTF8','UTF8ToString','getValue','setValue','HEAPU8','FS_createPath','FS_createDataFile']"
        "SHELL:--preload-file ${MS47_PRELOAD_DIR}@/res")
    # build.sh rewrites the stamp when the staged preload changes: relink to repackage webmscore.lib.data
    set_property(TARGET webmscore_lib APPEND PROPERTY LINK_DEPENDS "${MS47_PRELOAD_DIR}.stamp")
    # Browser bundlers must not see emscripten's Node-only `import("module")` (patch_lib.py explains)
    add_custom_command(TARGET webmscore_lib POST_BUILD
        COMMAND python3 ${CMAKE_CURRENT_LIST_DIR}/patch_lib.py $<TARGET_FILE:webmscore_lib>
        VERBATIM)
endif()
endif()
