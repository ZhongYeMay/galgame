using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace MayosSummer.Win;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new SummerWindow());
    }
}

internal sealed class SummerWindow : Form
{
    private const string Host = "mayos-game.invalid";
    private readonly WebView2 browser;
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(35) };
    private readonly Dictionary<string, List<ChatTurn>> histories = new();
    private string? sessionKey;
    private bool busy;
    private bool fullscreen = true;

    private static readonly Dictionary<string, (string Name, string Place, string Character)> Roles = new()
    {
        ["mio"] = ("白石 澪", "镰仓海边电台", "25岁，温柔认真、偶尔有一点别扭的节目制作人"),
        ["nagi"] = ("橘 凪", "七里滨海边", "26岁，爽朗好奇、喜欢旅行与摄影的自由摄影师"),
        ["shiori"] = ("月島 栞", "长谷的月灯旧书店", "27岁，沉静细腻、热爱书籍与日常故事的书店主理人")
    };

    internal SummerWindow()
    {
        Text = "夏日未寄 — 夏の便り";
        MinimumSize = new Size(1024, 576);
        ClientSize = new Size(1600, 900);
        BackColor = Color.FromArgb(16, 16, 31);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Maximized;
        browser = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(16, 16, 31)
        };
        Controls.Add(browser);
        Shown += async (_, _) => await InitializeBrowserAsync();
        FormClosed += (_, _) => { sessionKey = null; http.Dispose(); };
    }

    private async Task InitializeBrowserAsync()
    {
        try
        {
            string localSite = Path.Combine(AppContext.BaseDirectory, "www");
            string index = Path.Combine(localSite, "index.html");
            string script = Path.Combine(AppContext.BaseDirectory, "desktop-ai.js");
            if (!File.Exists(index) || !File.Exists(script))
                throw new FileNotFoundException("游戏包不完整：缺少原版页面或桌面对话脚本。");

            string stateDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MayOS", "Summer", "WebView2");
            Directory.CreateDirectory(stateDir);
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: stateDir);
            await browser.EnsureCoreWebView2Async(environment);
            var core = browser.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.SetVirtualHostNameToFolderMapping(
                Host, localSite, CoreWebView2HostResourceAccessKind.DenyCors);
            core.NavigationStarting += (_, args) =>
            {
                if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out var target) ||
                    target.Scheme != Uri.UriSchemeHttps ||
                    !string.Equals(target.Host, Host, StringComparison.OrdinalIgnoreCase))
                    args.Cancel = true;
            };
            core.NewWindowRequested += (_, args) => args.Handled = true;
            core.WebMessageReceived += async (_, args) => await ReceiveAsync(args);
            await core.AddScriptToExecuteOnDocumentCreatedAsync(
                await File.ReadAllTextAsync(script, Encoding.UTF8));
            core.Navigate($"https://{Host}/index.html");
        }
        catch (Exception ex)
        {
            MessageBox.Show(this,
                "Windows 游戏初始化失败。\n\n" +
                "请检查 WebView2 Runtime 是否已经安装，以及压缩包是否完整。\n\n" +
                ex.GetType().Name,
                "夏日未寄 — 无法启动", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private void Post(object response)
    {
        if (browser.CoreWebView2 is not null && !IsDisposed)
            browser.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(response));
    }

    private async Task ReceiveAsync(CoreWebView2WebMessageReceivedEventArgs args)
    {
        // Only the bundled, private virtual host is allowed to ask the native
        // process to use a credential. Nothing can execute arbitrary URLs.
        if (!Uri.TryCreate(args.Source, UriKind.Absolute, out var source) ||
            source.Scheme != "https" || source.Host != Host)
            return;
        try
        {
            using var document = JsonDocument.Parse(args.WebMessageAsJson);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return;
            string type = GetString(root, "type", 40);
            string route = GetString(root, "route", 20);
            int id = root.TryGetProperty("id", out var number) &&
                     number.TryGetInt32(out int parsed) ? parsed : 0;
            if (type == "fullscreen")
            {
                fullscreen = !fullscreen;
                WindowState = fullscreen ? FormWindowState.Maximized : FormWindowState.Normal;
                if (!fullscreen) ClientSize = new Size(1440, 810);
                Post(new { type = "fullscreen", maximized = fullscreen });
                return;
            }
            if (type == "set-key")
            {
                using var dialog = new ApiKeyDialog();
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    sessionKey = dialog.Secret;
                    Post(new { type = "key-status", ready = true });
                }
                return;
            }
            if (type == "key-status")
            {
                Post(new { type = "key-status", ready = HasKey() });
                return;
            }
            if (type == "reset")
            {
                if (busy) { Post(new { type = "error", id, message = "当前对话仍在生成，请完成后再切换。" }); return; }
                if (!Roles.ContainsKey(route)) return;
                histories[route] = new List<ChatTurn>();
                Post(new { type = "reset-ok", id, route });
                return;
            }
            if (type != "chat" && type != "proactive" && type != "test-key")
                return;
            if (busy)
            {
                Post(new { type = "error", id, message = "上一轮仍在生成，请稍后。" });
                return;
            }
            if (!HasKey())
            {
                Post(new { type = "error", id, message = "尚未配置 DeepSeek API Key。请在游戏内点击「API 设置」。" });
                return;
            }
            if (type != "test-key" && !Roles.ContainsKey(route)) return;
            string input = type == "chat" ? GetString(root, "text", 800) : "";
            if (type == "chat" && string.IsNullOrWhiteSpace(input))
            {
                Post(new { type = "error", id, message = "请先填写你的回答。" });
                return;
            }
            busy = true;
            try
            {
                string reply = await CallDeepSeekAsync(route, input, type);
                if (type == "test-key")
                {
                    Post(new { type = "test-ok", id });
                }
                else
                {
                    var messages = histories.TryGetValue(route, out var existing)
                        ? existing : (histories[route] = new List<ChatTurn>());
                    if (type == "chat") messages.Add(new ChatTurn("user", input));
                    messages.Add(new ChatTurn("assistant", reply));
                    if (messages.Count > 12) messages.RemoveRange(0, messages.Count - 12);
                    Post(new { type = "reply", id, route, text = reply });
                }
            }
            catch (HttpRequestException)
            {
                Post(new { type = "error", id, message = "网络连接失败，请检查 DeepSeek 服务与 HTTPS 网络。" });
            }
            catch (TaskCanceledException)
            {
                Post(new { type = "error", id, message = "DeepSeek 请求超时，请稍后重试。" });
            }
            catch (Exception)
            {
                // Never write exception bodies or request headers to disk/logs:
                // API credentials must remain private to this process.
                Post(new { type = "error", id, message = "模型返回格式异常，或当前请求未能完成。" });
            }
            finally
            {
                busy = false;
            }
        }
        catch (JsonException) { /* Reject malformed web messages. */ }
    }

    private static string GetString(JsonElement value, string key, int maxLength)
    {
        return value.TryGetProperty(key, out var field) &&
               field.ValueKind == JsonValueKind.String
            ? (field.GetString() ?? "")[..Math.Min(field.GetString()?.Length ?? 0, maxLength)]
            : "";
    }

    private bool HasKey() =>
        !string.IsNullOrWhiteSpace(sessionKey) ||
        !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("DEEPSEEK_API_KEY"));

    private async Task<string> CallDeepSeekAsync(string route, string input, string type)
    {
        string secret = sessionKey ??
            Environment.GetEnvironmentVariable("DEEPSEEK_API_KEY") ?? "";
        if (string.IsNullOrWhiteSpace(secret))
            throw new InvalidOperationException("Missing local API credential.");

        var conversation = new List<ChatTurn>();
        if (type == "test-key")
        {
            conversation.Add(new ChatTurn("system", "只回复 OK。"));
            conversation.Add(new ChatTurn("user", "OK"));
        }
        else
        {
            var persona = Roles[route];
            conversation.Add(new ChatTurn("system",
                "你在原创、全年龄视觉小说《夏日未寄》的镰仓故事里，" +
                "为虚构成年人「" + persona.Name + "」生成自然台词。" +
                "她是" + persona.Character + "，当前地点：" + persona.Place + "。" +
                "保持角色设定与原版日系复古文艺风格，使用自然中文，必要时少量日语口头语。" +
                "一次只写女主本人说的1到3句对白，不写玩家的台词，不提供选择题，" +
                "不自行宣布结局或篡改原版已有剧情，不要重复此前回复。" +
                "全程保持适合青少年的内容，避免露骨内容、亲密关系扮演和排他性依赖。" +
                "角色是虚构人物，不索取玩家隐私。"));
            if (histories.TryGetValue(route, out var previous))
                conversation.AddRange(previous.TakeLast(12));
            conversation.Add(new ChatTurn("user", type == "proactive"
                ? "请结合当前场景，主动发起一个自然的新话题，可以问玩家一个生活化的问题。"
                : input));
        }
        var payload = new
        {
            model = "deepseek-flash",
            thinking = new { type = "disabled" },
            max_tokens = type == "test-key" ? 8 : 200,
            temperature = 1.0,
            stream = false,
            messages = conversation.Select(x => new { role = x.Role, content = x.Content }).ToArray()
        };
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.deepseek.com/chat/completions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", secret);
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        using var response = await http.SendAsync(request);
        if (response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == HttpStatusCode.Forbidden)
            throw new InvalidOperationException("Invalid DeepSeek API key.");
        if (!response.IsSuccessStatusCode)
        {
            // Do not include the provider's raw response: it can contain echoed input.
            throw new HttpRequestException("DeepSeek request was not successful.");
        }
        string raw = await response.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(raw);
        string reply = json.RootElement.GetProperty("choices")[0]
            .GetProperty("message").GetProperty("content").GetString()?.Trim() ?? "";
        if (string.IsNullOrEmpty(reply)) throw new InvalidDataException("Empty response.");
        return reply.Length > 1500 ? reply[..1500] : reply;
    }

    private sealed record ChatTurn(string Role, string Content);
}

internal sealed class ApiKeyDialog : Form
{
    private readonly TextBox input;
    internal string Secret => input.Text.Trim();

    internal ApiKeyDialog()
    {
        Text = "DeepSeek API Key — 仅本次运行";
        ClientSize = new Size(510, 165);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        var instructions = new Label
        {
            Left = 22, Top = 17, Width = 465, Height = 40,
            Text = "请输入测试 Key。仅保留在本次运行内存中；\n不会写入网页、存档、安装包或 GitHub。"
        };
        input = new TextBox
        {
            Left = 22, Top = 66, Width = 465,
            UseSystemPasswordChar = true,
            MaxLength = 400
        };
        var submit = new Button
        {
            Text = "使用此 Key", Left = 373, Top = 110, Width = 114,
            DialogResult = DialogResult.OK
        };
        var cancel = new Button
        {
            Text = "取消", Left = 270, Top = 110, Width = 90,
            DialogResult = DialogResult.Cancel
        };
        Controls.AddRange(new Control[] { instructions, input, submit, cancel });
        AcceptButton = submit;
        CancelButton = cancel;
        submit.Click += (_, args) =>
        {
            if (Secret.Length >= 18) return;
            MessageBox.Show(this, "请输入有效的 DeepSeek API Key。", "密钥格式不正确");
            DialogResult = DialogResult.None;
        };
    }
}
