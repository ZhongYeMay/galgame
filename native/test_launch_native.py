"""No-network tests for safe full-package extraction."""
import hashlib
import io
from pathlib import Path
import tempfile
import unittest
import zipfile
from launch_native import extract_checked, verify_cached

ORIGINAL = {
    "site/index.html": b"<title>Game</title>",
    "site/story.js": b"story",
    "site/game.js": b"game",
    "site/style.css": b"body{}",
    "site/assets/retro/studio.webp": b"webp",
}
def manifest():
    return {p: (len(data), hashlib.sha256(data).hexdigest())
            for p, data in ORIGINAL.items()}

def zip_game(path, updates=None):
    with zipfile.ZipFile(path, "w") as archive:
        for name, content in {**ORIGINAL, **(updates or {})}.items():
            archive.writestr("galgame-deadbeef/" + name, content)

class LauncherTests(unittest.TestCase):
    def test_complete_verified_extract(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            zip_game(root / "assets.zip")
            extract_checked(root / "assets.zip", root / "game", manifest())
            self.assertTrue(verify_cached(root / "game", manifest()))
            (root / "game/site/game.js").write_bytes(b"tampered")
            self.assertFalse(verify_cached(root / "game", manifest()))

    def test_incomplete_asset_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            with zipfile.ZipFile(root / "assets.zip", "w") as archive:
                archive.writestr("galgame-deadbeef/site/index.html", ORIGINAL["site/index.html"])
            with self.assertRaises(ValueError):
                extract_checked(root / "assets.zip", root / "game", manifest())

    def test_extra_asset_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            zip_game(root / "assets.zip", {"site/unknown.txt": b"unexpected"})
            with self.assertRaises(ValueError):
                extract_checked(root / "assets.zip", root / "game", manifest())

    def test_traversal_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            zip_game(root / "assets.zip", {"site/../../outside": b"unsafe"})
            with self.assertRaises(ValueError):
                extract_checked(root / "assets.zip", root / "game", manifest())

    def test_bad_hash_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            zip_game(root / "assets.zip", {"site/game.js": b"changed"})
            with self.assertRaises(ValueError):
                extract_checked(root / "assets.zip", root / "game", manifest())

if __name__ == "__main__":
    unittest.main()
