#include "deepseek_chat.hpp"
#include <cassert>
#include <deque>
#include <iostream>
#include <string>

int main() {
    using Json = nlohmann::json;
    const Json scene={{"who","旁白"},{"text","今天的海风很轻，电台即将开播。"}};
    const std::string question="你觉得今天的天气怎么样？";
    std::deque<Json> history;
    for(int i=0;i<10;i++){
        history.push_back({{"role","user"},{"content","之前的话题"}});
        history.push_back({{"role","assistant"},{"content","她之前的回答"}});
    }
    const char* names[]={"白石 澪","橘 凪","月島 栞"};
    for(const char* name:names){
        const Json character={{"name",name},
          {"job","本作人物职业"},{"place","镰仓"},{"intro","原创角色设定"}};
        const Json payload=DeepSeekChat::makeRequest(character,scene,history,question);
        assert(payload.at("model")=="deepseek-flash");
        assert(payload.at("thinking").at("type")=="disabled");
        assert(payload.at("max_tokens").get<int>()<=200);
        assert(payload.at("messages").size()==15); // system x2, 12 recent, user x1
        assert(payload.at("messages")[0]["role"]=="system");
        assert(payload.at("messages")[0]["content"].get<std::string>().find(name)!=std::string::npos);
        assert(payload.at("messages")[1]["content"].get<std::string>().find("今天的海风")!=std::string::npos);
        assert(payload.at("messages").back()["content"]==question);
        assert(payload.dump().find("DEEPSEEK_API_KEY")==std::string::npos);
        for(const char* other:names)
            if(std::string(other)!=name)
                assert(payload.at("messages")[0]["content"].get<std::string>().find(other)==std::string::npos);
    }
    const Json character={{"name","橘 凪"},{"job","摄影师"},{"place","七里滨"},{"intro","风景摄影"}};
    const Json proactive=DeepSeekChat::makeRequest(character,scene,{}, "", "deepseek-flash",true);
    assert(proactive.at("messages").back()["content"].get<std::string>().find("主动开始")!=std::string::npos);
    assert(proactive.at("messages").back()["content"].get<std::string>().find("选项")!=std::string::npos);
    std::cout<<"AI request contracts passed: 3 heroine profiles, context limit, model and credential safety\n";
    return 0;
}
