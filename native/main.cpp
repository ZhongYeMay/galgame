#include <algorithm>
#include <SDL.h>
#include <SDL_image.h>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>
namespace fs = std::filesystem;
struct Image {
    SDL_Texture* texture = nullptr;
    int w=0,h=0;
    void clear(){if(texture) SDL_DestroyTexture(texture);texture=nullptr;}
    bool load(SDL_Renderer* renderer,const fs::path& path){
        clear();
        SDL_Surface* surface=IMG_Load(path.string().c_str());
        if(!surface){std::cerr<<"Image error: "<<IMG_GetError()<<" "<<path<<"\n";return false;}
        texture=SDL_CreateTextureFromSurface(renderer,surface);
        w=surface->w;h=surface->h;SDL_FreeSurface(surface);
        return texture!=nullptr;
    }
};
int main(int argc,char** argv){
    if(argc!=2){std::cerr<<"Usage: mayos_summer <verified-game-root>\n";return 2;}
    const fs::path root=fs::weakly_canonical(argv[1]);
    if(!fs::is_regular_file(root/"site/story.js") || !fs::is_regular_file(root/"site/game.js")){
        std::cerr<<"Incomplete game package; refusing to launch\n";return 3;
    }
    if(SDL_Init(SDL_INIT_VIDEO|SDL_INIT_EVENTS)!=0){std::cerr<<SDL_GetError()<<"\n";return 4;}
    if(!(IMG_Init(IMG_INIT_WEBP)&IMG_INIT_WEBP)){std::cerr<<"WebP unavailable: "<<IMG_GetError()<<"\n";SDL_Quit();return 5;}
    SDL_Window* window=SDL_CreateWindow("夏日未寄 - MayOS Native",SDL_WINDOWPOS_CENTERED,SDL_WINDOWPOS_CENTERED,1280,720,SDL_WINDOW_RESIZABLE);
    if(!window){std::cerr<<SDL_GetError()<<"\n";IMG_Quit();SDL_Quit();return 6;}
    SDL_Renderer* renderer=SDL_CreateRenderer(window,-1,SDL_RENDERER_ACCELERATED|SDL_RENDERER_PRESENTVSYNC);
    if(!renderer)renderer=SDL_CreateRenderer(window,-1,SDL_RENDERER_SOFTWARE);
    if(!renderer){SDL_DestroyWindow(window);IMG_Quit();SDL_Quit();return 7;}
    Image bg,actor;
    if(!bg.load(renderer,root/"site/assets/retro/studio.webp") ||
       !actor.load(renderer,root/"site/assets/retro/mio-0.webp")){
        bg.clear();actor.clear();SDL_DestroyRenderer(renderer);SDL_DestroyWindow(window);IMG_Quit();SDL_Quit();return 8;
    }
    bool running=true;
    Uint32 transitionStart=SDL_GetTicks();
    while(running){
        SDL_Event event;
        while(SDL_PollEvent(&event)){
            if(event.type==SDL_QUIT || (event.type==SDL_KEYDOWN && event.key.keysym.sym==SDLK_ESCAPE))running=false;
        }
        int w,h;SDL_GetRendererOutputSize(renderer,&w,&h);
        SDL_SetRenderDrawColor(renderer,16,16,20,255);SDL_RenderClear(renderer);
        SDL_Rect backdrop{0,0,w,h};
        SDL_RenderCopy(renderer,bg.texture,nullptr,&backdrop);
        float t=std::min(1.0f,(SDL_GetTicks()-transitionStart)/500.0f);
        SDL_SetTextureAlphaMod(actor.texture,static_cast<Uint8>(255*t));
        int ah=static_cast<int>(h*0.87),aw=actor.h?ah*actor.w/actor.h:0;
        SDL_Rect sprite{(w-aw)/2,h-ah,aw,ah};
        SDL_RenderCopy(renderer,actor.texture,nullptr,&sprite);
        SDL_RenderPresent(renderer);
    }
    bg.clear();actor.clear();SDL_DestroyRenderer(renderer);SDL_DestroyWindow(window);IMG_Quit();SDL_Quit();
    return 0;
}
