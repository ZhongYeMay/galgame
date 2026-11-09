#include <SDL.h>
#include <SDL_image.h>
#include <SDL_ttf.h>
#include "audio.hpp"
#include <nlohmann/json.hpp>
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
using json=nlohmann::json;
namespace fs=std::filesystem;
struct Texture {
 SDL_Texture* ptr=nullptr; int w=0,h=0;
 void reset(){if(ptr)SDL_DestroyTexture(ptr);ptr=nullptr;}
 bool image(SDL_Renderer*r,const fs::path&p){
  reset();SDL_Surface*s=IMG_Load(p.string().c_str());
  if(!s){std::cerr<<IMG_GetError()<<" "<<p<<"\n";return false;}
  ptr=SDL_CreateTextureFromSurface(r,s);w=s->w;h=s->h;SDL_FreeSurface(s);return ptr!=nullptr;
 }
 void draw(SDL_Renderer*r,SDL_Rect dest){if(ptr)SDL_RenderCopy(r,ptr,nullptr,&dest);}
 ~Texture(){reset();}
};
static void text(SDL_Renderer*r,TTF_Font*f,const std::string&s,int x,int y,int maxWidth,SDL_Color c){
 if(!f||s.empty())return;
 // UTF-8 aware wrapping by Unicode codepoint boundaries.
 std::vector<std::string> chunks;std::string line;
 for(size_t i=0;i<s.size();){
  unsigned char b=static_cast<unsigned char>(s[i]);
  size_t n=b<128?1:(b<224?2:(b<240?3:4));n=std::min(n,s.size()-i);
  std::string glyph=s.substr(i,n);i+=n;
  if(glyph=="\n"){chunks.push_back(line);line.clear();continue;}
  std::string candidate=line+glyph;int width=0;
  if(TTF_SizeUTF8(f,candidate.c_str(),&width,nullptr)==0 && width>maxWidth && !line.empty()){
   chunks.push_back(line);line=glyph;
  }else line=candidate;
 }
 if(!line.empty())chunks.push_back(line);
 int lineHeight=TTF_FontLineSkip(f);
 for(const auto&part:chunks){
  if(part.empty()){y+=lineHeight;continue;}
  SDL_Surface*s=TTF_RenderUTF8_Blended(f,part.c_str(),c);
  if(!s)continue;
  SDL_Texture*t=SDL_CreateTextureFromSurface(r,s);
  if(t){SDL_Rect dst{x,y,s->w,s->h};SDL_RenderCopy(r,t,nullptr,&dst);SDL_DestroyTexture(t);}
  SDL_FreeSurface(s);y+=lineHeight;
 }
}
static bool save(const fs::path&p,const std::string&node){
 fs::create_directories(p.parent_path());
 auto temp=p;temp+=".tmp";
 {std::ofstream out(temp,std::ios::binary);if(!out)return false;out<<json({{"schema",1},{"node",node}}).dump(2);if(!out)return false;}
 std::error_code ec;fs::rename(temp,p,ec);
 if(ec){fs::remove(p,ec);ec.clear();fs::rename(temp,p,ec);}
 return !ec;
}
int main(int argc,char**argv){
 if((argc!=4 && argc!=5) || (argc==5 && std::string(argv[4])!="--smoke-test")){std::cerr<<"Usage: mayos_summer_play <game-root> <story.generated.json> <font.ttf> [--smoke-test]\n";return 2;}
 const bool smoke=(argc==5);
 fs::path root=fs::absolute(argv[1]),fontPath=argv[3];
 if(!fs::is_regular_file(root/"site/story.js")||!fs::is_regular_file(root/"site/game.js")){std::cerr<<"Missing original game files\n";return 3;}
 json data;
 try{std::ifstream f(argv[2]);if(!f)throw std::runtime_error("Missing story JSON");f>>data;
  if(data.at("schema")!=1||!data.at("story").is_object())throw std::runtime_error("Bad story schema");
 }catch(const std::exception&e){std::cerr<<e.what()<<"\n";return 4;}
 const json&story=data["story"];
 std::string node="p0";
 fs::path savePath;
 try{savePath=fs::temp_directory_path()/"mayos-summer"/"save.json";}catch(...){savePath="save.json";}
 if(SDL_Init(SDL_INIT_VIDEO)!=0)return 5;
 const bool audioReady=SDL_InitSubSystem(SDL_INIT_AUDIO)==0;
 NativeBgm music;
 if(audioReady&&!music.open())std::cerr<<"Audio device unavailable: BGM disabled\n";
 if(!(IMG_Init(IMG_INIT_WEBP)&IMG_INIT_WEBP)){SDL_Quit();return 6;}
 if(TTF_Init()!=0){IMG_Quit();SDL_Quit();return 7;}
 SDL_Window*w=SDL_CreateWindow("MayOS - 夏日未寄",SDL_WINDOWPOS_CENTERED,SDL_WINDOWPOS_CENTERED,1280,720,SDL_WINDOW_RESIZABLE);
 SDL_Renderer*r=w?SDL_CreateRenderer(w,-1,SDL_RENDERER_ACCELERATED|SDL_RENDERER_PRESENTVSYNC):nullptr;
 if(w&&!r)r=SDL_CreateRenderer(w,-1,SDL_RENDERER_SOFTWARE);
 TTF_Font*f=TTF_OpenFont(fontPath.string().c_str(),26);
 if(!w||!r||!f){std::cerr<<"SDL renderer or font initialization failed\n";if(f)TTF_CloseFont(f);if(r)SDL_DestroyRenderer(r);if(w)SDL_DestroyWindow(w);TTF_Quit();IMG_Quit();SDL_Quit();return 8;}
 Texture bg,actor;std::string bgKey,actorKey;
 auto jump=[&](const std::string&target){if(story.contains(target))node=target;else std::cerr<<"Invalid target: "<<target<<"\n";};
 bool running=true;
 while(running){
  const json&item=story.at(node);
  std::string route=item.value("route",std::string("mio"));
  std::string background=item.value("bg",std::string("studio"));
  int pose=item.value("pose",0);
  std::string sprite=route+"-"+std::to_string(pose);
  if(background!=bgKey){if(bg.image(r,root/"site/assets/retro"/(background+".webp")))bgKey=background;}
  if(sprite!=actorKey){if(actor.image(r,root/"site/assets/retro"/(sprite+".webp")))actorKey=sprite;}
  SDL_Event e;
  while(SDL_PollEvent(&e)){
   if(e.type==SDL_QUIT)running=false;
   if(e.type==SDL_MOUSEBUTTONDOWN && e.button.button==SDL_BUTTON_LEFT){
     int width,height;SDL_GetRendererOutputSize(r,&width,&height);
     int x=e.button.x,y=e.button.y;
     if(item.contains("choices")){
       int choiceStart=height*64/100+14+125;
       int index=(y-choiceStart)/36;
       if(x>=width/16 && y>=choiceStart && index>=0 && index<(int)item["choices"].size())
         jump(item["choices"][index][1].get<std::string>());
     }else if(!item.value("ending",false) && item.contains("next") && y>height*64/100){
       jump(item["next"].get<std::string>());
     }else if(item.value("ending",false)){jump("p0");}
     continue;
   }
   if(e.type!=SDL_KEYDOWN)continue;
   auto key=e.key.keysym.sym;
   if(key==SDLK_ESCAPE){running=false;continue;}
   if(key==SDLK_m){music.toggle();continue;}
   if(key==SDLK_UP){music.setVolume(0.40f);continue;}
   if(key==SDLK_DOWN){music.setVolume(0.12f);continue;}
   if(key==SDLK_F5){if(!save(savePath,node))std::cerr<<"Save failed\n";continue;}
   if(key==SDLK_F9){try{std::ifstream in(savePath);json state;in>>state;
      if(state.at("schema")==1&&state.at("node").is_string())jump(state.at("node").get<std::string>());
     }catch(...){std::cerr<<"Load failed\n";}continue;}
   if(item.value("ending",false)){if(key==SDLK_RETURN)jump("p0");continue;}
   if(item.contains("choices")){
    int index=key>=SDLK_1&&key<=SDLK_9?key-SDLK_1:-1;
    if(index>=0&&index<static_cast<int>(item["choices"].size()))jump(item["choices"][index][1].get<std::string>());
   }else if(key==SDLK_SPACE||key==SDLK_RETURN){
    if(item.contains("next")&&item["next"].is_string())jump(item["next"].get<std::string>());
   }
  }
  int width,height;SDL_GetRendererOutputSize(r,&width,&height);
  SDL_SetRenderDrawColor(r,16,16,20,255);SDL_RenderClear(r);
  bg.draw(r,SDL_Rect{0,0,width,height});
  int ah=height*85/100,aw=actor.h?ah*actor.w/actor.h:0;
  actor.draw(r,SDL_Rect{(width-aw)/2,height-ah,aw,ah});
  SDL_SetRenderDrawBlendMode(r,SDL_BLENDMODE_BLEND);
  SDL_SetRenderDrawColor(r,10,10,17,220);
  SDL_Rect panel{0,height*64/100,width,height*36/100};SDL_RenderFillRect(r,&panel);
  SDL_Color white{245,245,245,255},soft{192,194,202,255};
  int x=width/16,y=panel.y+14,maxWidth=width-x*2;
  if(item.value("ending",false)){
   text(r,f,item.value("title",std::string("Ending")),x,y,maxWidth,white);
   text(r,f,item.value("text",std::string("")),x,y+44,maxWidth,soft);
  }else{
   text(r,f,item.value("who",std::string("旁白")),x,y,maxWidth,white);
   text(r,f,item.value("text",std::string("")),x,y+40,maxWidth,soft);
   if(item.contains("choices")){
    int cy=y+125;
    for(size_t i=0;i<item["choices"].size();++i){
     std::string choice=std::to_string(i+1)+". "+item["choices"][i][0].get<std::string>();
     text(r,f,choice,x,cy,maxWidth,white);cy+=36;
    }
   }
  }
  SDL_RenderPresent(r);
  if(smoke)running=false;
 }
 music.close();if(audioReady)SDL_QuitSubSystem(SDL_INIT_AUDIO);
 actor.reset();bg.reset();TTF_CloseFont(f);SDL_DestroyRenderer(r);SDL_DestroyWindow(w);
 TTF_Quit();IMG_Quit();SDL_Quit();return 0;
}
