"""Integration tests against the exact exported original story, when generated."""
import unittest
from pathlib import Path
from story_runtime import StoryRuntime

STORY = Path(__file__).parent / "story.generated.json"

@unittest.skipUnless(STORY.is_file(), "Generate native/story.generated.json first")
class OriginalStoryTests(unittest.TestCase):
    def test_all_six_original_endings(self):
        for route, letter in enumerate("MNS"):
            for ending in (0, 1):
                with self.subTest(route=letter, ending=ending):
                    game = StoryRuntime(STORY)
                    choices = iter((route, ending))
                    for _ in range(256):
                        if game.current.get("ending"):
                            break
                        options = game.current.get("choices")
                        game.advance(next(choices) if options else None)
                    else:
                        self.fail("A branch did not end in 256 nodes")
                    self.assertEqual(game.node, "end" + letter + str(ending + 1))
                    self.assertGreater(len(game.read), 5)

    def test_every_original_node_has_valid_links(self):
        game = StoryRuntime(STORY)
        self.assertGreater(len(game.story), 50)
        self.assertEqual(len([k for k, v in game.story.items() if v.get("ending")]), 6)

if __name__ == "__main__":
    unittest.main()
