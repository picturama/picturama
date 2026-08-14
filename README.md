# Picturama

Digital image organizer powered by the web

[![](https://picturama.github.io/assets/picturama-screenshot.jpg)](https://picturama.github.io/)

## Download

Please visit the [Picturama website](https://picturama.github.io/).

**Linux:** an AppImage requires FUSE to run, but Ubuntu and Debian no longer install FUSE 2 by default.
If it doesn't start, install it with `sudo apt install libfuse2` (on Ubuntu 24.04: `libfuse2t64`), or run
the AppImage with `--appimage-extract-and-run`. And make sure the file is executable (`chmod +x`).

## Features

- Scan local files - Keep your privacy, don't upload your personal photos to a cloud service
- Non-Destructive - The original images won't be touched (unless you purge the trash)
- Read various photo formats: JPG, PNG, TIF, WebP, HEIC / HEIF
- Read raw formats of [a whole bunch of cameras](https://www.libraw.org/supported-cameras) (only on Mac and Linux, see [Issue #25](https://github.com/picturama/picturama/issues/25))
- Browse photos by dates
- View photo in detail (zoomable)
- View EXIF information
- Tags
- Favorites
- Rotate photos
- Delete photos

## Develop

See [DEVELOP.md](DEVELOP.md) for details about how to build Picturama.
