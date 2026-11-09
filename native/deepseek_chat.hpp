#pragma once

// DeepSeek optional, in-story improvisation mode. The original STORY and endings
// are never mutated. All HTTP credentials stay in the local process environment.
#include <curl/curl.h>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <cstdlib>
#include <deque>
#include <mutex>
#include <string>
#include <thread>
#include <utility>

class DeepSeekChat {
public:
    using Json = nlohmann::json;
    struct Status {
        bool busy = false;
        std::string answer;
        std::string error;
        int outputTokens = 0;
    };

    static Json makeRequest(const Json& character, const Json& scene,
                            const std::deque<Json>& prior,
                            const std::string& question,
                            const std::string& model = "deepseek-flash",
                            bool proactive = false) {
        const std::string name = character.value("name", std::string("女主角"));
        const std::string job = character.value("job", std::string(""));
        const std::string place = character.value("place", std::string(""));
        const std::string intro = character.value("intro", std::string(""));
        const std::string line = scene.value("text", std::string(""));
        const std::string speaker = scene.value("who", std::string("旁白"));
        // In-story character, not a real-world relationship or personal assistant.
        const std::string systemPrompt =
            "你正在参与原创小说《夏日未寄》的非正史、可选 AI 即兴场景。"
            "你只负责为故事人物「" + name + "」写一句自然中文对白，偶尔可以用少量日语口头语。"
            "角色背景：" + intro + "。职业：" + job + "。地点：" + place + "。"
            "故事中的主角26岁，所有恋爱角色都是成年虚构人物。"
            "保持原作温柔、含蓄、生活化的个性与当前情境；不要编造已经发生的重大剧情，"
            "不要替玩家发言，也不要改动正式主线、路线和结局。"
            "保持适合青少年阅读的全年龄内容，不写露骨性内容、亲密行为扮演或排他性依赖关系。"
            "不要自称真实人类，不要求玩家提供私人资料。"
            "每次尽量使用不同的措辞和细节，避免模板化、相同开头和重复上次原句。"
            "通常回复1到3句，不使用Markdown，不添加旁白标签、系统提示或角色姓名前缀。";

        Json messages = Json::array();
        messages.push_back({{"role", "system"}, {"content", systemPrompt}});
        messages.push_back({{"role", "system"},
            {"content", "当前原作剧情节点（仅作为人物和场景依据，不推动正式剧情）："
             + speaker + "：" + line}});
        // Limit both tokens and API cost. Prior messages are created only from
        // this process's local AI mode, never from original story text.
        size_t first = prior.size() > 12 ? prior.size() - 12 : 0;
        for (size_t i=first; i<prior.size(); ++i) {
            const auto& entry = prior[i];
            if (entry.is_object() && entry.contains("role") && entry.contains("content")
                && entry["role"].is_string() && entry["content"].is_string()) {
                std::string role = entry["role"].get<std::string>();
                if (role == "user" || role == "assistant")
                    messages.push_back({{"role", role}, {"content", entry["content"]}});
            }
        }
        messages.push_back({{"role", "user"}, {"content", proactive
            ? "请由这位虚构人物主动开始一轮自然的日常对话。禁止复述现成剧情句子；"
              "结合地点或人物生活发起新话题，可提出一个自然的问题。"
              "不要写玩家台词，也不要添加选项。"
            : question}});
        return {{"model", model},
                {"thinking", {{"type", "disabled"}}},
                {"temperature", 1.0},
                {"max_tokens", 180},
                {"stream", false},
                {"messages", std::move(messages)}};
    }

    DeepSeekChat() : initialized_(curl_global_init(CURL_GLOBAL_DEFAULT) == CURLE_OK) {}
    ~DeepSeekChat() {
        if (worker_.joinable()) worker_.join();
        if (initialized_) curl_global_cleanup();
    }

    DeepSeekChat(const DeepSeekChat&) = delete;
    DeepSeekChat& operator=(const DeepSeekChat&) = delete;

    bool send(const Json& character, const Json& scene,
              const std::string& question, const std::string& route,
              bool proactive = false) {
        if ((!proactive && question.empty()) || question.size() > 900) {
            setError("请输入不超过900字节的对话内容。");
            return false;
        }
        const char* value = std::getenv("DEEPSEEK_API_KEY");
        if (!value || !*value) {
            setError("未设置 DEEPSEEK_API_KEY。密钥只应配置在本机环境变量中。");
            return false;
        }
        if (!initialized_) {
            setError("网络接口初始化失败。");
            return false;
        }
        {
            std::lock_guard<std::mutex> lock(mutex_);
            if (busy_) return false;
        }
        if (worker_.joinable()) worker_.join();
        std::string key(value); // Never logged, saved, or passed to GitHub.
        Json payload;
        {
            std::lock_guard<std::mutex> lock(mutex_);
            if (route_ != route) {
                prior_.clear();
                route_ = route;
            }
            payload = makeRequest(character, scene, prior_, question, "deepseek-flash", proactive);
            busy_ = true;
            answer_.clear();
            error_.clear();
            outputTokens_ = 0;
        }
        worker_ = std::thread([this, payload = std::move(payload),
                               question, proactive, key = std::move(key)]() mutable {
            std::string answer, error;
            int tokens = 0;
            perform(payload, key, answer, error, tokens);
            {
                std::lock_guard<std::mutex> lock(mutex_);
                if (error.empty() && !answer.empty()) {
                    if (!proactive)
                        prior_.push_back({{"role", "user"}, {"content", question}});
                    prior_.push_back({{"role", "assistant"}, {"content", answer}});
                    while (prior_.size() > 12) prior_.pop_front();
                }
                answer_ = std::move(answer);
                error_ = std::move(error);
                outputTokens_ = tokens;
                busy_ = false;
            }
        });
        return true;
    }

    Status status() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return {busy_, answer_, error_, outputTokens_};
    }

    // Prevent a previous heroine's answer/history from appearing in a new route.
    bool selectRoute(const std::string& route) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (busy_) return false;
        if (route_ != route) {
            route_ = route;
            prior_.clear();
            answer_.clear();
            error_.clear();
            outputTokens_ = 0;
        }
        return true;
    }

    void clear() {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!busy_) {
            prior_.clear();
            answer_.clear();
            error_.clear();
            outputTokens_ = 0;
        }
    }

private:
    static size_t appendResponse(char* ptr, size_t size, size_t count, void* userdata) {
        auto* response = static_cast<std::string*>(userdata);
        const size_t bytes = size * count;
        if (bytes > 1024*1024 || response->size() > 1024*1024 - bytes) return 0;
        response->append(ptr, bytes);
        return bytes;
    }

    static void perform(const Json& payload, const std::string& key,
                        std::string& answer, std::string& error, int& tokens) {
        CURL* curl = curl_easy_init();
        if (!curl) { error = "无法初始化 HTTPS 请求。"; return; }
        curl_slist* headers = nullptr;
        const std::string authorization = "Authorization: Bearer " + key;
        headers = curl_slist_append(headers, "Content-Type: application/json");
        headers = curl_slist_append(headers, authorization.c_str());
        std::string body = payload.dump();
        std::string response;
        curl_easy_setopt(curl, CURLOPT_URL, "https://api.deepseek.com/chat/completions");
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl, CURLOPT_POST, 1L);
        curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
        curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, static_cast<long>(body.size()));
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, &appendResponse);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
        curl_easy_setopt(curl, CURLOPT_USERAGENT, "MayOS-SummerNative/0.1");
        curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 8L);
        curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);
        curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 0L);
        curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
        curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);
        curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1L);
        curl_easy_setopt(curl, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
        const CURLcode result = curl_easy_perform(curl);
        long code=0;
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &code);
        curl_slist_free_all(headers);
        curl_easy_cleanup(curl);

        if (result != CURLE_OK) {
            // Do not copy upstream diagnostics, which may contain request details.
            error = "DeepSeek 网络连接失败或响应超时，请检查网络。";
            return;
        }
        if (code == 401 || code == 403) {
            error = "API 密钥无效或无权限，请在本机更新环境变量。";
            return;
        }
        if (code == 402) {
            error = "DeepSeek API 额度不足。";
            return;
        }
        if (code == 429) {
            error = "DeepSeek 请求过于频繁，请稍后重试。";
            return;
        }
        if (code < 200 || code >= 300) {
            error = "DeepSeek 接口暂时不可用（HTTP " + std::to_string(code) + "）。";
            return;
        }
        try {
            Json data=Json::parse(response);
            answer = data.at("choices").at(0).at("message").at("content").get<std::string>();
            if (answer.size() > 2500) answer.resize(2500);
            if (data.contains("usage") && data["usage"].is_object())
                tokens = data["usage"].value("completion_tokens", 0);
            if (answer.empty()) error = "模型返回了空对白。";
        } catch (const std::exception&) {
            error = "DeepSeek 返回的数据格式不正确。";
        }
    }

    void setError(const std::string& message) {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!busy_) { error_ = message; answer_.clear(); }
    }

    bool initialized_ = false;
    mutable std::mutex mutex_;
    std::thread worker_;
    bool busy_ = false;
    std::string route_;
    std::deque<Json> prior_;
    std::string answer_, error_;
    int outputTokens_ = 0;
};
