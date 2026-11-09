#include "deepseek_chat.hpp"
#include <SDL.h>
#include <SDL_image.h>
#include <SDL_ttf.h>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <deque>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
using json=nlohmann::json;
namespace fs=std::filesystem;

struct Texture {
    SDL_Texture* value=nullptr;
    int width=0,height=0;
    bool load(SDL_Renderer* renderer,const fs::path& path) {
        SDL_Surface* surface=IMG_Load(path.string().c_str());
        if(!surface) {std::cerr<<"Image missing: "<<path<<"\n";return false;}
        SDL_Texture* next=SDL_CreateTextureFromSurface(renderer,surface);
        int w=surface->w,h=surface->h;
        SDL_FreeSurface(surface);
        if(!next)return false;
        if(value)SDL_DestroyTexture(value);
        value=next;width=w;height=h;
        return true;
    }
    void draw(SDL_Renderer* r,const SDL_Rect& rect)const {
        if(value)SDL_RenderCopy(r,value,nullptr,&rect);
    }
    ~Texture(){if(value)SDL_DestroyTexture(value);}
};

static void paintText(SDL_Renderer*r,TTF_Font*font,const std::string&text,
                      int x,int y,int maxWidth,SDL_Color color,int maxHeight=10000) {
    if(text.empty()||maxWidth<=0||maxHeight<=0)return;
    SDL_Surface* surface=TTF_RenderUTF8_Blended_Wrapped(font,text.c_str(),color,
                                                  static_cast<Uint32>(maxWidth));
    if(!surface)return;
    SDL_Texture* texture=SDL_CreateTextureFromSurface(r,surface);
    if(texture){
        SDL_Rect source{0,0,surface->w,std::min(surface->h,maxHeight)};
        SDL_Rect destination{x,y,source.w,source.h};
        SDL_RenderCopy(r,texture,&source,&destination);
        SDL_DestroyTexture(texture);
    }
    SDL_FreeSurface(surface);
}

static bool updateBuffer(std::string& value,const std::string& text) {
    if(value.size()+text.size()>900)return false;
    value+=text;return true;
}
static void backspaceUtf8(std::string& value) {
    if(value.empty())return;
    size_t at=value.size()-1;
    while(at>0 && (static_cast<unsigned char>(value[at])&0xc0)==0x80)--at;
    value.erase(at);
}
struct Entry {std::string who,content;};
static const std::string routes[3]={"mio","nagi","shiori"};
static const std::string scenes[3]={"m0","n0","s0"};

int main(int argc,char**argv) {
    const bool smoke=argc==5&&std::string(argv[4])=="--smoke-test";
    if(argc!=4&&!smoke) {
        std::cerr<<"Usage: mayos_summer_ai <complete-game-root> <story.generated.json> <CJK-font> [--smoke-test]\n";
        return 2;
    }
    const fs::path root=fs::absolute(argv[1]);
    if(!fs::is_regular_file(root/"site/story.js") ||
       !fs::is_regular_file(root/"site/game.js") ||
       !fs::is_regular_file(root/"site/index.html")) {
        std::cerr<<"Incomplete original game package\n";return 3;
    }
    json data;
    try {
        std::ifstream stream(argv[2]);
        if(!stream)throw std::runtime_error("Story export not found");
        stream>>data;
        if(data.at("schema")!=1 || !data.at("characters").is_object()
           || !data.at("story").is_object())throw std::runtime_error("Unsupported story export");
        for(int i=0;i<3;i++){
            if(!data["characters"].contains(routes[i]) || !data["story"].contains(scenes[i]))
                throw std::runtime_error("Original heroine or scene missing");
        }
    } catch(const std::exception&e){std::cerr<<e.what()<<"\n";return 4;}

    if(SDL_Init(SDL_INIT_VIDEO|SDL_INIT_EVENTS)!=0){std::cerr<<SDL_GetError()<<"\n";return 5;}
    if(!(IMG_Init(IMG_INIT_WEBP)&IMG_INIT_WEBP)){std::cerr<<IMG_GetError()<<"\n";SDL_Quit();return 6;}
    if(TTF_Init()!=0){IMG_Quit();SDL_Quit();return 7;}
    SDL_Window* window=SDL_CreateWindow("夏日未寄 | AI 自由对话",SDL_WINDOWPOS_CENTERED,
                SDL_WINDOWPOS_CENTERED,1280,720,SDL_WINDOW_RESIZABLE);
    SDL_Renderer* renderer=window?SDL_CreateRenderer(window,-1,SDL_RENDERER_ACCELERATED|SDL_RENDERER_PRESENTVSYNC):nullptr;
    if(window&&!renderer)renderer=SDL_CreateRenderer(window,-1,SDL_RENDERER_SOFTWARE);
    TTF_Font* font=TTF_OpenFont(argv[3],23);
    if(!window||!renderer||!font) {
        std::cerr<<"Failed to initialize SDL window, renderer or CJK font\n";
        if(font)TTF_CloseFont(font);if(renderer)SDL_DestroyRenderer(renderer);
        if(window)SDL_DestroyWindow(window);TTF_Quit();IMG_Quit();SDL_Quit();return 8;
    }
    SDL_StartTextInput();
    DeepSeekChat chat;
    Texture background,actor;
    int active=0;
    std::deque<Entry> transcript;
    std::string input;
    std::string errorText;
    bool pending=false, running=true;
    const auto begin=[&](bool proactive){
        const auto state=chat.status();
        if(state.busy)return;
        if(proactive && chat.send(data["characters"].at(routes[active]),
                                  data["story"].at(scenes[active]),
                                  "",routes[active],true)){
            pending=true;
            errorText.clear();
        } else {
            errorText=chat.status().error;
        }
    };
    const auto select=[&](int route){
        if(chat.status().busy || !chat.selectRoute(routes[route]))return;
        active=route;
        transcript.clear();
        input.clear();
        errorText.clear();
        const fs::path original=root/"site/assets/retro";
        const auto& character=data["characters"].at(routes[route]);
        background.load(renderer,original/(character.value("bg",std::string("studio"))+".webp"));
        actor.load(renderer,original/(routes[route]+"-0.webp"));
        begin(true); // The first line is generated by DeepSeek, never hardcoded.
    };
    // Only enter the AI mode; no forced quizzes, numerical story choices, or canned replies.
    select(0);

    const SDL_Color white{244,240,237,255},muted{197,198,202,255},mint{188,232,222,255};
    while(running) {
        SDL_Event event;
        while(SDL_PollEvent(&event)){
            if(event.type==SDL_QUIT){running=false;continue;}
            if(event.type==SDL_TEXTINPUT){if(!pending)updateBuffer(input,event.text.text);continue;}
            if(event.type!=SDL_KEYDOWN)continue;
            const auto key=event.key.keysym.sym;
            if(key==SDLK_ESCAPE){running=false;continue;}
            if(key==SDLK_F1||key==SDLK_F2||key==SDLK_F3) {
                select(static_cast<int>(key-SDLK_F1));continue;
            }
            if(key==SDLK_F4){
                if(!pending)begin(true);
                continue;
            }
            if(key==SDLK_BACKSPACE){if(!pending)backspaceUtf8(input);continue;}
            if((key==SDLK_RETURN || key==SDLK_KP_ENTER)&&!pending&&!input.empty()){
                // No fixed player answers: the exact text the player typed is sent.
                if(chat.send(data["characters"].at(routes[active]),
                             data["story"].at(scenes[active]),input,routes[active])){
                    transcript.push_back({"你",input});
                    while(transcript.size()>20)transcript.pop_front();
                    input.clear();errorText.clear();pending=true;
                }else errorText=chat.status().error;
            }
        }
        if(pending){
            const auto state=chat.status();
            if(!state.busy){
                pending=false;
                if(!state.answer.empty()){
                    transcript.push_back({data["characters"].at(routes[active]).value("name",std::string("女主角")),
                                          state.answer});
                    while(transcript.size()>20)transcript.pop_front();
                    errorText.clear();
                } else errorText=state.error.empty()?"本轮未生成对白，请使用 F4 重试。":state.error;
            }
        }
        int width=0,height=0;
        SDL_GetRendererOutputSize(renderer,&width,&height);
        SDL_SetRenderDrawColor(renderer,18,16,25,255);
        SDL_RenderClear(renderer);
        background.draw(renderer,SDL_Rect{0,0,width,height});
        if(actor.value){
            int actorHeight=height*87/100;
            int actorWidth=actor.height?actorHeight*actor.width/actor.height:0;
            actor.draw(renderer,SDL_Rect{(width-actorWidth)/2,height-actorHeight,actorWidth,actorHeight});
        }
        SDL_SetRenderDrawBlendMode(renderer,SDL_BLENDMODE_BLEND);
        const int panelTop=height*36/100;
        SDL_SetRenderDrawColor(renderer,12,12,18,235);
        SDL_Rect panel{0,panelTop,width,height-panelTop};
        SDL_RenderFillRect(renderer,&panel);
        const int margin=std::max(20,width/20);
        const int contentWidth=width-2*margin;
        const std::string name=data["characters"].at(routes[active]).value("name",std::string("女主角"));
        paintText(renderer,font,name+"  ·  AI 自由对白",margin,panelTop+10,contentWidth,mint,40);
        paintText(renderer,font,"F1 澪  /  F2 凪  /  F3 栞  /  F4 女主主动发言  /  ESC 退出",
                  margin,panelTop+43,contentWidth,muted,40);

        const int transcriptTop=panelTop+79;
        const int inputTop=height-91;
        // A bottom-aligned transcript showing the newest lines without a scroll requirement.
        const int rowHeight=68;
        int available=std::max(1,(inputTop-transcriptTop-16)/rowHeight);
        int first=std::max(0,static_cast<int>(transcript.size())-available);
        int y=transcriptTop;
        for(int i=first;i<static_cast<int>(transcript.size());++i){
            const auto& e=transcript[static_cast<size_t>(i)];
            paintText(renderer,font,e.who+": "+e.content,margin,y,contentWidth,
                      e.who=="你"?white:mint,rowHeight-4);
            y+=rowHeight;
        }
        const std::string status=pending?"DeepSeek 正在生成对白…":
                                 !errorText.empty()?errorText:"输入你的回答，Enter 发送";
        paintText(renderer,font,status,margin,inputTop-26,contentWidth,
                  errorText.empty()?muted:SDL_Color{255,186,162,255},28);
        SDL_SetRenderDrawColor(renderer,46,45,54,255);
        SDL_Rect inputRect{margin,inputTop,contentWidth,55};
        SDL_RenderFillRect(renderer,&inputRect);
        paintText(renderer,font,"> "+input+(pending?"":" |"),margin+13,inputTop+12,
                  contentWidth-24,white,35);
        SDL_RenderPresent(renderer);
        if(smoke)running=false;
        SDL_Delay(20);
    }
    SDL_StopTextInput();
    // Wait for the bounded in-flight request before libcurl is torn down.
    TTF_CloseFont(font);
    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    TTF_Quit();
    IMG_Quit();
    SDL_Quit();
    return 0;
}
