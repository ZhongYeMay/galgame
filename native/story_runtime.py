#!/usr/bin/env python3
"""Portable reference story-state implementation for testing native port semantics.
No original dialogue or choices are rewritten; all data comes from exported JSON.
"""
import json
from pathlib import Path

class StoryRuntime:
    def __init__(self, story_file, mature=False):
        data=json.loads(Path(story_file).read_text(encoding="utf-8"))
        if data.get("schema")!=1:raise ValueError("Unsupported story schema")
        self.story=data["story"]
        self.mature=bool(mature)
        self.node="p0"
        self.read=set()
        self.history=[]
        self._validate()
    def _validate(self):
        for name, item in self.story.items():
            targets=[item.get("next"),item.get("matureNext")]
            targets += [choice[1] for choice in item.get("choices",[])]
            for target in targets:
                if target and target not in self.story:
                    raise ValueError(f"Broken story link {name} -> {target}")
    @property
    def current(self):
        return self.story[self.node]
    def advance(self, choice=None):
        item=self.current
        self.read.add(self.node)
        self.history.append({"node":self.node,"who":item.get("who",""),"text":item.get("text","")})
        if item.get("ending"):return False
        if "choices" in item:
            if not isinstance(choice,int) or not 0<=choice<len(item["choices"]):
                raise ValueError("Choice index required")
            target=item["choices"][choice][1]
        else:
            if choice is not None:raise ValueError("Unexpected choice")
            target=item.get("matureNext") if self.mature and item.get("matureNext") else item.get("next")
        if target not in self.story:raise ValueError("Missing next node")
        self.node=target
        return True
    def save(self, filename):
        path=Path(filename)
        path.parent.mkdir(parents=True,exist_ok=True)
        temp=path.with_suffix(path.suffix+".tmp")
        temp.write_text(json.dumps({"schema":1,"node":self.node,"read":sorted(self.read),"history":self.history},ensure_ascii=False),encoding="utf-8")
        temp.replace(path)
    def load(self, filename):
        data=json.loads(Path(filename).read_text(encoding="utf-8"))
        if data.get("schema")!=1 or data.get("node") not in self.story:
            raise ValueError("Invalid save")
        self.node=data["node"]
        self.read=set(x for x in data.get("read",[]) if x in self.story)
        self.history=list(data.get("history",[]))

if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser()
    p.add_argument("story_json")
    p.add_argument("--choice",type=int,default=0)
    a=p.parse_args()
    game=StoryRuntime(a.story_json)
    while not game.current.get("ending"):
        game.advance(a.choice if game.current.get("choices") else None)
    print(game.node,game.current["title"])
