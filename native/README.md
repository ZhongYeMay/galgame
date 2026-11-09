# MayOS native game port — development status

This is an **SDL2 + SDL2_image native rendering prototype**, not the complete game.
It draws the original WebP background and character with a fade-in using SDL rendering.
No browser, DOM, or embedded webview is used.

## Linux build

```sh
cmake -S native -B build/native
cmake --build build/native
python3 tools/build_native_manifest.py . build/native/manifest.json
python3 tools/verify_native_package.py . build/native/manifest.json
./build/native/mayos_summer .
```

Dependencies: SDL2, SDL2_image with WebP support, C++17 compiler, CMake.
The root argument must contain the complete original site/ directory.
Do not claim full compatibility: story parsing, branching, text, audio, saves,
download launcher, and MayKernel graphics/audio drivers are not implemented.
MayKernel support requires its own SDL-compatible platform backend or equivalent.
