import json
import tempfile
import unittest
from pathlib import Path
from story_runtime import StoryRuntime

class StoryRuntimeTests(unittest.TestCase):
    def test_all_six_endings(self):
        with tempfile.TemporaryDirectory() as directory:
            story=Path(directory)/"story.json"
            data={"schema":1,"story":{
                "p0":{"next":"routeChoice"},
                "routeChoice":{"choices":[["M","m"],["N","n"],["S","s"]]},
                **{k:{"choices":[["good","end"+k+"1"],["soft","end"+k+"2"]]} for k in ("m","n","s")},
                **{"end"+k+str(i):{"ending":True,"title":"end"} for k in ("m","n","s") for i in (1,2)}
            }}
            story.write_text(json.dumps(data))
            for route in range(3):
                for ending in range(2):
                    game=StoryRuntime(story)
                    game.advance()
                    game.advance(route)
                    game.advance(ending)
                    self.assertTrue(game.current["ending"])
                    save=Path(directory)/"save.json"
                    game.save(save)
                    restored=StoryRuntime(story)
                    restored.load(save)
                    self.assertEqual(restored.node,game.node)
                    self.assertEqual(restored.read,game.read)
    def test_invalid_choice_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            story=Path(directory)/"story.json"
            story.write_text(json.dumps({"schema":1,"story":{"p0":{"choices":[["x","end"]]},"end":{"ending":True}}}))
            game=StoryRuntime(story)
            with self.assertRaises(ValueError):game.advance(99)

if __name__=="__main__":unittest.main()
