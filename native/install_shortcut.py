#!/usr/bin/env python3
"""Install a Linux application-menu shortcut to the GitHub-backed native launcher."""
import os
from pathlib import Path
import sys

def desktop_quote(value: str) -> str:
    if "\n" in value or "\r" in value:
        raise ValueError("Invalid launcher path")
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"').replace("%", "%%") + '"'

def main():
    launcher = Path(__file__).resolve().with_name("launch_native.py")
    if not launcher.is_file():
        raise SystemExit("Native launcher is missing")
    root = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
    destination = root / "applications" / "mayos-summer.desktop"
    destination.parent.mkdir(parents=True, exist_ok=True)
    entry = ("[Desktop Entry]\n"
             "Type=Application\n"
             "Name=夏日未寄 (MayOS Native)\n"
             "Comment=完整游戏资源首次启动时从 GitHub 下载并校验\n"
             "Exec=/usr/bin/env python3 " + desktop_quote(str(launcher)) + "\n"
             "Icon=applications-games\n"
             "Terminal=true\n"
             "Categories=Game;\n"
             "StartupNotify=true\n")
    destination.write_text(entry, encoding="utf-8")
    destination.chmod(0o644)
    print("Installed application shortcut:", destination)

if __name__ == "__main__":
    main()
