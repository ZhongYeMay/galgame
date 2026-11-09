#pragma once
#include <SDL.h>
#include <algorithm>
#include <array>
#include <cmath>

// Recreates the original site's small sine-wave BGM sequence through SDL audio.
// Audio is synthesized at runtime; no song recordings or game assets are altered.
class NativeBgm {
    static constexpr std::array<double,16> notes = {{
        293.66,369.99,440.0,587.33,554.37,440.0,369.99,329.63,
        293.66,349.23,440.0,523.25,493.88,440.0,349.23,329.63
    }};
    struct Voice {double phase=0, age=9, frequency=0; double gain=0;};
    std::array<Voice,16> voices{};
    SDL_AudioDeviceID device=0;
    double clock=0, nextNote=0;
    size_t index=0;
    float volume=0.24f;
    bool enabled=false;

    void add(double hz, double gain) {
        // At most two new voices per 0.95s and each voice lasts 4s.
        auto it=std::max_element(voices.begin(),voices.end(),
            [](const Voice&a,const Voice&b){return a.age<b.age;});
        *it=Voice{0,0,hz,gain};
    }
    static void callback(void* userdata, Uint8* bytes,int length) {
        auto& self=*static_cast<NativeBgm*>(userdata);
        auto* buffer=reinterpret_cast<float*>(bytes);
        int frames=length/static_cast<int>(sizeof(float));
        double dt=1.0/48000.0;
        constexpr double tau=6.283185307179586;
        for(int i=0;i<frames;i++) {
            if(self.enabled && self.clock>=self.nextNote) {
                self.add(notes[self.index++%notes.size()],0.13);
                self.add(146.83,0.025);
                self.nextNote+=0.95;
            }
            double sample=0;
            if(self.enabled) {
                for(auto& v:self.voices) {
                    if(v.age>=4.0)continue;
                    const double attack=std::min(1.0,v.age/0.025);
                    const double envelope=attack*std::exp(-2.0*v.age);
                    sample+=std::sin(v.phase)*v.gain*envelope;
                    v.phase+=tau*v.frequency*dt;
                    if(v.phase>tau)v.phase-=tau;
                    v.age+=dt;
                }
                self.clock+=dt;
            }
            buffer[i]=static_cast<float>(std::clamp(sample*self.volume,-1.0,1.0));
        }
    }
public:
    bool open() {
        SDL_AudioSpec requested{};
        requested.freq=48000;
        requested.format=AUDIO_F32SYS;
        requested.channels=1;
        requested.samples=1024;
        requested.callback=callback;
        requested.userdata=this;
        device=SDL_OpenAudioDevice(nullptr,0,&requested,nullptr,0);
        if(device)SDL_PauseAudioDevice(device,0);
        return device!=0;
    }
    void toggle() {
        if(!device)return;
        SDL_LockAudioDevice(device);
        enabled=!enabled;
        // Preserve voices on pause, but restart the original theme from the start.
        if(enabled){clock=0;nextNote=0;index=0;voices={};}
        SDL_UnlockAudioDevice(device);
    }
    void setVolume(float value) {
        if(!device)return;
        SDL_LockAudioDevice(device);
        volume=std::clamp(value,0.0f,1.0f);
        SDL_UnlockAudioDevice(device);
    }
    bool isAvailable() const {return device!=0;}
    void close(){if(device){SDL_CloseAudioDevice(device);device=0;}}
    ~NativeBgm(){close();}
};
