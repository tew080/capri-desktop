# Watches the top-level windows so Capri can sit on them.
# Prints one JSON line whenever something changes: the foreground window and the visible
# windows in z-order (front first), as physical-pixel frame bounds. No contents, and no titles:
# the title of the window in front is only checked against a short list of AI names (ChatGPT,
# Gemini...) for her jealousy, and all that goes out is which of them matched ("ai").
#
#   powershell -File windows.ps1 <capri hwnd> <capri pid>

param([long]$Self = 0, [int]$ParentPid = 0)
$ErrorActionPreference = 'Stop'

Add-Type -ReferencedAssemblies System.Management -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

public static class CapriWindows {
  delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd, int index);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT value, int size);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out int value, int size);

  const int GWL_EXSTYLE = -20;
  const int WS_EX_TOOLWINDOW = 0x80;
  const int WS_EX_NOACTIVATE = 0x08000000;
  const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
  const int DWMWA_CLOAKED = 14;

  // Other AIs: a key, what gives them away in the title of the window in front, and the name of
  // their own app's program, if they have one.
  static readonly string[][] AIS = {
    new[] { "chatgpt", @"\bChatGPT\b", "chatgpt" },
    new[] { "claude", @"\bClaude\b", "claude" },
    new[] { "codex", @"\bCodex\b", "codex" },
    new[] { "gemini", @"\bGemini\b", "" },
    new[] { "copilot", @"\bCopilot\b", "copilot" },
    new[] { "perplexity", @"\bPerplexity\b", "perplexity" },
    new[] { "deepseek", @"\bDeepSeek\b", "" },
    new[] { "grok", @"\bGrok\b", "" },
    new[] { "lechat", @"\bLe Chat\b|\bMistral AI\b", "" },
    new[] { "characterai", @"character\.ai", "" },
    new[] { "metaai", @"\bMeta AI\b", "" },
  };
  static IntPtr procOf = IntPtr.Zero;
  static string proc = "";
  static string game = "";

  // A game: its program sits in a launcher's library (Steam, Epic, Riot, Xbox, GOG). The game is the
  // name of its folder there (the launchers themselves aren't games).
  static readonly Regex GAME = new Regex(@"\\(?:steamapps\\common|Epic Games|Riot Games|XboxGames|GOG Galaxy\\Games)\\([^\\]+)\\", RegexOptions.IgnoreCase);
  static readonly Regex NOT_GAME = new Regex(@"launcher|client|redistributable|steamworks", RegexOptions.IgnoreCase);

  // The program behind the window in front, when it changes: its name, and the game it is, if one.
  static void Program(IntPtr fg) {
    if (fg == procOf) return;
    procOf = fg;
    proc = "";
    game = "";
    uint pid;
    GetWindowThreadProcessId(fg, out pid);
    try { proc = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); } catch {}
    IntPtr h = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
    if (h == IntPtr.Zero) return;
    var path = new StringBuilder(1024);
    int size = path.Capacity;
    if (QueryFullProcessImageName(h, 0, path, ref size)) {
      var m = GAME.Match(path.ToString());
      if (m.Success && !NOT_GAME.IsMatch(m.Groups[1].Value)) game = m.Groups[1].Value;
    }
    CloseHandle(h);
  }

  static string Json(string s) {
    return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
  }

  // USB sticks (and SD cards) plugged in, by drive letter, looked at every couple of seconds.
  static string usb = "[]";
  static DateTime usbAt = DateTime.MinValue;
  static string Usb() {
    if ((DateTime.Now - usbAt).TotalMilliseconds < 2000) return usb;
    usbAt = DateTime.Now;
    var letters = new StringBuilder();
    try {
      foreach (var d in System.IO.DriveInfo.GetDrives()) {
        if (d.DriveType != System.IO.DriveType.Removable || !d.IsReady) continue;
        if (letters.Length > 0) letters.Append(',');
        letters.Append(Json(d.Name.Substring(0, 1)));
      }
    } catch {}
    usb = "[" + letters.ToString() + "]";
    return usb;
  }

  // The programs that are web browsers: an AI in one of them is the website, not an app of its own.
  static readonly Regex BROWSER_PROC = new Regex(@"^(?:chrome|msedge|firefox|brave|opera|opera_gx|vivaldi|arc|chromium|duckduckgo|zen|waterfox|librewolf|floorp)$", RegexOptions.IgnoreCase);

  // The browser's own name at the end of a window title (Chrome, Edge, Firefox, Brave...): not part
  // of the page. Edge adds a profile too (" - Personal - Microsoft Edge").
  static readonly Regex BROWSER_TAIL = new Regex(@"\s+[-\u2013\u2014]\s+(?:Google Chrome|Microsoft.{0,3}Edge|Mozilla Firefox|Brave|Opera(?: GX)?|Vivaldi|Arc|Chromium|DuckDuckGo|Zen Browser|Waterfox|LibreWolf|Floorp)\s*$", RegexOptions.IgnoreCase);
  static readonly Regex TITLE_SPLIT = new Regex(@"\s+[-\u2013\u2014|]\s+");
  static readonly Regex VENDOR = new Regex(@"^(?:Microsoft|Google|GitHub|Meta)\s+", RegexOptions.IgnoreCase);

  // The AI a title is about, or null. A page only mentioning an AI ("Claude vs ChatGPT - YouTube")
  // is not that AI: the name has to be the site / app name, which is the last part of the title
  // ("Some chat - Claude", "Gemini", "Microsoft Copilot"), or the whole title.
  static string AiByTitle(string title) {
    if (string.IsNullOrEmpty(title)) return null;
    string t = BROWSER_TAIL.Replace(title.Trim(), "");
    var parts = TITLE_SPLIT.Split(t);
    string last = VENDOR.Replace(parts[parts.Length - 1].Trim(), "");
    // (the browser's profile name left at the end, "Personal": the site is the part before it)
    string before = (parts.Length >= 2 && last.Length <= 14) ? VENDOR.Replace(parts[parts.Length - 2].Trim(), "") : "";
    foreach (var ai in AIS) {
      string name = ai[1].Replace(@"\b", "");
      var strict = new Regex("^(?:" + name + ")(?:\\s+\\S+){0,2}$", RegexOptions.IgnoreCase);
      var whole = new Regex("^(?:" + name + ")$", RegexOptions.IgnoreCase);
      // ("DeepSeek - Into the Unknown": the name first, then a slogan)
      if (strict.IsMatch(last) || (before != "" && whole.IsMatch(before)) || (parts.Length == 2 && whole.IsMatch(VENDOR.Replace(parts[0].Trim(), "")))) return ai[0];
    }
    return null;
  }

  // Which of them the window in front is, as a JSON list of keys (at most one: it can't be two).
  static string Ai(IntPtr fg) {
    var title = new StringBuilder(512);
    GetWindowText(fg, title, 512);
    Program(fg);
    string key = AiByTitle(title.ToString());
    if (key == null) {
      // their own app (the program's name), when the title doesn't say
      foreach (var ai in AIS) {
        if (ai[2] != "" && proc == ai[2]) { key = ai[0]; break; }
      }
    }
    return key == null ? "[]" : "[\"" + key + "\"]";
  }

  public static void Init() {
    SetProcessDpiAwarenessContext(new IntPtr(-4)); // per-monitor v2: real pixels everywhere
    try { WatchDevices(); } catch {}
  }

  // Devices plugged in or out (a phone, a controller, a headset...). Windows says something
  // changed; we list the devices again and see what's new or gone.
  static Dictionary<string, string[]> devices;
  static int plugs = 0;
  static string plug = "null";
  static readonly object gate = new object();

  static Dictionary<string, string[]> Devices() {
    var all = new Dictionary<string, string[]>();
    using (var q = new ManagementObjectSearcher("SELECT DeviceID, Name, PNPClass FROM Win32_PnPEntity")) {
      foreach (ManagementBaseObject d in q.Get()) {
        var id = d["DeviceID"] as string;
        if (id != null) all[id] = new[] { (d["Name"] as string) ?? "", (d["PNPClass"] as string) ?? "" };
      }
    }
    return all;
  }

  static void WatchDevices() {
    devices = Devices();
    var watcher = new ManagementEventWatcher(new WqlEventQuery("SELECT * FROM Win32_DeviceChangeEvent WHERE EventType = 2 OR EventType = 3"));
    watcher.EventArrived += (s, e) => {
      try { Changed(); } catch {} // never take the whole helper down over a device
    };
    watcher.Start();
  }

  static void Changed() {
    System.Threading.Thread.Sleep(1200); // a phone shows up as several devices, one after the other
    lock (gate) {
      var now = Devices();
      var added = new List<string[]>();
      var removed = new List<string[]>();
      foreach (var d in now) if (!devices.ContainsKey(d.Key)) added.Add(d.Value);
      foreach (var d in devices) if (!now.ContainsKey(d.Key)) removed.Add(d.Value);
      devices = now;
      bool plugged = added.Count > 0;
      var best = Best(plugged ? added : removed);
      if (best == null) return;
      plugs++;
      string kind = KindOf(best[1], best[0]);
      plug = "{\"n\":" + plugs + ",\"in\":" + (plugged ? "true" : "false") + ",\"name\":" + Json(best[0]) + ",\"class\":" + Json(best[1]) + ",\"kind\":" + Json(kind) + "}";
    }
  }

  // The device that says the most about what was plugged: "Galaxy S21" rather than "USB Composite Device".
  static readonly Regex VAGUE = new Regex(@"composite|hub|concentrateur|input device|hid|mass storage|stockage|g.n.ri|virtu|num.rat|interface|host|h.te|bus|port|endpoint|service|profil|protocol|p.riph.rique|dispositivo", RegexOptions.IgnoreCase); // ASCII only: PowerShell reads this file as ANSI
  public static string KindOf(string cls, string name) {
    string c = cls ?? "";
    string n = name ?? "";
    string both = (c + " " + n);

    if (c == "Bluetooth" || both.IndexOf("Bluetooth", System.StringComparison.OrdinalIgnoreCase) >= 0) return "bluetooth";

    // Storage first — flash drives, disks, mass storage (before WPD→phone)
    if (c == "DiskDrive" || c == "CDROM" || c == "SCSIAdapter"
        || both.IndexOf("Mass Storage", System.StringComparison.OrdinalIgnoreCase) >= 0
        || both.IndexOf("USB Drive", System.StringComparison.OrdinalIgnoreCase) >= 0
        || both.IndexOf("Flash", System.StringComparison.OrdinalIgnoreCase) >= 0
        || both.IndexOf("Thumb", System.StringComparison.OrdinalIgnoreCase) >= 0
        || both.IndexOf("Sandisk", System.StringComparison.OrdinalIgnoreCase) >= 0
        || both.IndexOf("Kingston", System.StringComparison.OrdinalIgnoreCase) >= 0
        || both.IndexOf("Transcend", System.StringComparison.OrdinalIgnoreCase) >= 0
        || both.IndexOf("USB Disk", System.StringComparison.OrdinalIgnoreCase) >= 0
        || both.IndexOf("Removable Disk", System.StringComparison.OrdinalIgnoreCase) >= 0) return "storage";

    // Phones / tablets only when name/class clearly says so. Not by the letters "phone" inside a
    // word: "Headphones" / "Earphone" / "Microphone" are not phones (a 3.5 mm jack plugged in).
    bool phoneHint =
      c == "AndroidUsbDeviceClass"
      || Regex.IsMatch(both, @"Android|iPhone|iPad|Galaxy|Pixel|OnePlus|Xiaomi|Huawei|Apple Mobile|\bOPPO\b|\bvivo\b|\bMTP\b|(?<![A-Za-z])Phone(?![A-Za-z])", RegexOptions.IgnoreCase);

    // Sound devices (headphones, speakers, mics, the 3.5 mm jack) before phones, unless it says
    // plainly that it is a phone
    bool audioHint =
      c == "AudioEndpoint" || c == "MEDIA"
      || Regex.IsMatch(both, @"Head(?:set|phone)|Ear(?:phone|bud|pod)|Speaker|Microphone|\bMic\b|Line[- ]?(?:In|Out)|\bJack\b|\bAudio\b", RegexOptions.IgnoreCase);
    bool strongPhone = c == "AndroidUsbDeviceClass"
      || Regex.IsMatch(both, @"Android|iPhone|iPad|Galaxy|OnePlus|Xiaomi|Huawei|Apple Mobile|\bMTP\b", RegexOptions.IgnoreCase);
    if (audioHint && !strongPhone) return "audio";

    if (phoneHint) return "phone";
    // Generic WPD without phone hint → portable device, not phone
    if (c == "WPD") return "storage";

    if (c == "AudioEndpoint" || c == "MEDIA"
        || both.IndexOf("Headset", System.StringComparison.OrdinalIgnoreCase) >= 0
        || both.IndexOf("Headphone", System.StringComparison.OrdinalIgnoreCase) >= 0
        || both.IndexOf("Earphone", System.StringComparison.OrdinalIgnoreCase) >= 0
        || both.IndexOf("Speaker", System.StringComparison.OrdinalIgnoreCase) >= 0) return "audio";
    if (c == "Camera" || c == "Image") return "camera";
    if (c == "Keyboard" || (c == "HIDClass" && both.IndexOf("Keyboard", System.StringComparison.OrdinalIgnoreCase) >= 0)) return "keyboard";
    if (c == "Mouse" || (c == "HIDClass" && both.IndexOf("Mouse", System.StringComparison.OrdinalIgnoreCase) >= 0)) return "mouse";
    if (c == "HIDClass" || c == "USB") {
      if (both.IndexOf("Controller", System.StringComparison.OrdinalIgnoreCase) >= 0
          || both.IndexOf("Gamepad", System.StringComparison.OrdinalIgnoreCase) >= 0
          || both.IndexOf("Joystick", System.StringComparison.OrdinalIgnoreCase) >= 0) return "gamepad";
    }
    if (c.IndexOf("USB", System.StringComparison.OrdinalIgnoreCase) >= 0
        || n.IndexOf("USB", System.StringComparison.OrdinalIgnoreCase) >= 0) return "usb";
    return "device";
  }

  static string[] Best(List<string[]> list) {
    string[] best = null;
    int top = int.MinValue;
    foreach (var d in list) {
      if (d[0] == "") continue;
      string c = d[1];
      int score = c == "WPD" ? 7
        : c == "DiskDrive" ? 6
        : c == "AudioEndpoint" || c == "MEDIA" ? 6
        : c == "Bluetooth" ? 6
        : c == "Camera" || c == "Image" ? 5
        : c == "HIDClass" || c == "Keyboard" || c == "Mouse" ? 4
        : c == "USB" ? 3
        : 1;
      if (VAGUE.IsMatch(d[0])) score -= 4;
      if (score > top) { top = score; best = d; }
    }
    return best;
  }

  public static string Snapshot(long self) {
    var sb = new StringBuilder();
    IntPtr fg = GetForegroundWindow();
    var fgClass = new StringBuilder(64);
    GetClassName(fg, fgClass, 64);
    // the taskbar clicked: it comes up over her (Windows has no levels among windows on top)
    bool taskbar = fgClass.ToString() == "Shell_TrayWnd" || fgClass.ToString() == "Shell_SecondaryTrayWnd";
    Program(fg);
    sb.Append("{\"fg\":").Append(fg.ToInt64()).Append(",\"taskbar\":").Append(taskbar ? "true" : "false")
      .Append(",\"ai\":").Append(Ai(fg))
      .Append(",\"aiweb\":").Append(BROWSER_PROC.IsMatch(proc) ? "true" : "false")
      .Append(",\"game\":").Append(game == "" ? "null" : Json(game))
      .Append(",\"proc\":").Append(proc == "" ? "null" : Json(proc))
      .Append(",\"usb\":").Append(Usb());
    lock (gate) sb.Append(",\"plug\":").Append(plug);
    sb.Append(",\"wins\":[");
    int count = 0;
    var procCache = new Dictionary<uint, string>();
    EnumWindows((h, l) => {
      if (count >= 40) return false;
      if (h.ToInt64() == self || !IsWindowVisible(h) || IsIconic(h)) return true;
      int ex = GetWindowLong(h, GWL_EXSTYLE);
      if ((ex & WS_EX_TOOLWINDOW) != 0 || (ex & WS_EX_NOACTIVATE) != 0) return true;
      int cloaked;
      if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) return true;
      var cls = new StringBuilder(64);
      GetClassName(h, cls, 64);
      string c = cls.ToString();
      if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd") return true;
      RECT r;
      if (DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, out r, 16) != 0) return true;
      if (r.Right - r.Left < 200 || r.Bottom - r.Top < 120) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      string pname = "";
      if (!procCache.TryGetValue(pid, out pname)) {
        try { pname = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant(); }
        catch { pname = ""; }
        procCache[pid] = pname;
      }
      if (count > 0) sb.Append(',');
      count++;
      sb.Append("{\"id\":").Append(h.ToInt64())
        .Append(",\"x\":").Append(r.Left).Append(",\"y\":").Append(r.Top)
        .Append(",\"w\":").Append(r.Right - r.Left).Append(",\"h\":").Append(r.Bottom - r.Top)
        .Append(",\"max\":").Append(IsZoomed(h) ? "true" : "false")
        .Append(",\"proc\":").Append(pname == "" ? "null" : Json(pname)).Append('}');
      return true;
    }, IntPtr.Zero);
    sb.Append("]}");
    return sb.ToString();
  }
}
"@

[CapriWindows]::Init()

# Browsers: a page's title only sometimes says which AI it is (a ChatGPT or Grok conversation is
# titled by its subject; NotebookLM is not Gemini). The address bar says for sure: its host is read
# here (Windows UI Automation), matched against the AI list, and only the match goes out in "ai":
# never the address. Without UI Automation, the title decides, as before.
$script:uiaOk = $false
try {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes -ErrorAction Stop
  $script:uiaOk = $true
} catch {}
$script:urlAi = @(
  @('chatgpt', '^(chatgpt\.com|chat\.openai\.com)(/|$)'),
  @('claude', '^claude\.ai(/|$)'),
  @('gemini', '^(gemini\.google\.com|aistudio\.google\.com|bard\.google\.com)(/|$)'),
  @('copilot', '^copilot\.microsoft\.com(/|$)'),
  @('perplexity', '^perplexity\.ai(/|$)'),
  @('deepseek', '^(chat\.)?deepseek\.com(/|$)'),
  @('grok', '^(grok\.com|x\.com/i/grok)(/|$|\?)'),
  @('lechat', '^chat\.mistral\.ai(/|$)'),
  @('characterai', '^(character\.ai|c\.ai)(/|$)'),
  @('metaai', '^meta\.ai(/|$)')
)
$script:urlSeen = @{ fg = 0; titleAi = ''; at = 0; key = $null }

# The text of the browser's address bar, or $null if it can't be read.
function Get-UrlText([long]$hwnd) {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$hwnd)
  if ($null -eq $root) { return $null }
  $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
  # the first text box of the window is the address bar (FindFirst stops there: it doesn't walk the page)
  $edit = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
  if ($null -eq $edit) { return $null }
  $pattern = $null
  if (-not $edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) { return $null }
  $v = ([string]$pattern.Current.Value).Trim()
  if ($v -and $v -notmatch '\s' -and ($v -match '\.' -or $v -match '^[a-z][a-z0-9+.-]*:')) { return $v }
  return $null
}

# Which AI an address is ('' when it is none), or $null when it can't tell.
function Get-AiByUrl($text) {
  if ($null -eq $text) { return $null }
  $u = ([string]$text).ToLowerInvariant()
  $u = $u -replace '^[a-z][a-z0-9+.-]*://', ''
  $u = $u -replace '^www\.', ''
  foreach ($e in $script:urlAi) {
    if ($u -match $e[1]) { return $e[0] }
  }
  return ''
}

# The snapshot, with "ai" set by the address bar when the window in front is a browser.
function Add-BrowserAi([string]$snap) {
  if (-not $script:uiaOk) { return $snap }
  try {
    $m = [regex]::Match($snap, '"fg":(\d+),.*?"ai":(\[[^\]]*\]),"aiweb":true')
    if (-not $m.Success) { return $snap }
    $fg = [long]$m.Groups[1].Value
    $titleAi = $m.Groups[2].Value
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $s = $script:urlSeen
    if ($s.fg -ne $fg -or $s.titleAi -ne $titleAi -or ($now - $s.at) -gt 2000) {
      $s.fg = $fg
      $s.titleAi = $titleAi
      $s.at = $now
      $s.key = Get-AiByUrl (Get-UrlText $fg)
    }
    if ($null -eq $s.key) { return $snap }
    $newAi = if ($s.key -eq '') { '[]' } else { '["' + $s.key + '"]' }
    return $snap.Replace('"ai":' + $titleAi + ',"aiweb"', '"ai":' + $newAi + ',"aiweb"')
  } catch {
    return $snap
  }
}

$script:mediaJson = '{"on":false,"app":"","running":false}'
$script:mediaAt = 0
$script:mediaLastLog = ''
function Update-CapriMedia {
  $now = [Environment]::TickCount
  if ($script:mediaAt -ne 0 -and (($now - $script:mediaAt) -band 0x7fffffff) -lt 1000) { return }
  $script:mediaAt = $now

  # 1) Media apps by process name OR window title (minimized OK)
  $running = $false
  $runningApp = ''
  # process-name patterns (lowercase)
  $procPat = 'spotify|spotifywebhelper|vlc|foobar|itunes|applemusic|apple.?music|potplayer|wmplayer|aimp|tidal|deezer|musicbee|winamp|clementine|mediamonkey|groove|music\.ui|youtubemusic|youtube.?music|qqmusic|netease|soundcloud|bandcamp|pandora|amazon.?music|amazonmusic|dopamine|quodlibet|rhythmbox|elisa|lollypop|strawberry|resonic|jetAudio|kmplayer|mpc-hc|mpc-be|mpv|gom|splayer|potplayermini|musicplayer|jukebox|zune|media.?player|filmora|premiere|audacity|obs|discord|chrome|msedge|brave|firefox|opera|vivaldi'
  # window-title patterns — only used when process is a known browser OR title clearly media
  $titlePat = '(?i)youtube\s*music|youtube|spotify|vlc media|foobar2000|groove music|apple music|itunes|tidal|deezer|soundcloud|bandcamp|netflix|disney\+|disney plus|prime video|twitch|bilibili|niconico|joox|kkbox|line.?music|melon|genie|bugs|amazon music|pandora|mixcloud|hearthis|audius|yt.?music'
  try {
    foreach ($p in (Get-Process -ErrorAction SilentlyContinue)) {
      $low = ([string]$p.ProcessName).ToLower()
      $title = [string]$p.MainWindowTitle
      $hit = $false
      # dedicated media player process
      if ($low -match 'spotify|spotifywebhelper|vlc|foobar|itunes|applemusic|potplayer|wmplayer|aimp|tidal|deezer|musicbee|winamp|clementine|mediamonkey|groove|music\.ui|youtubemusic|youtube.?music|qqmusic|netease|soundcloud|bandcamp|pandora|amazonmusic|dopamine|mpv|gom|kmplayer|mpc-hc|mpc-be|jetAudio|resonic|zune|joox|kkbox') {
        $hit = $true
        $runningApp = $low
      }
      # browser / electron shell only counts when title looks like media
      elseif ($title -and ($low -match 'chrome|msedge|brave|firefox|opera|vivaldi|electron') -and ($title -match $titlePat)) {
        $hit = $true
        $runningApp = $low
      }
      # any process whose title is clearly a media app (PWA etc.)
      elseif ($title -and ($title -match '(?i)youtube\s*music|spotify|vlc media|foobar2000|groove music|apple music|tidal|deezer|joox|kkbox|line.?music|netflix|prime video')) {
        $hit = $true
        $runningApp = if ($low) { $low } else { 'media' }
      }
      if ($hit) { $running = $true; break }
    }
  } catch {}

  # 2) SMTC (optional — on this machine it may throw; that's ok)
  $playing = $null
  $app = $runningApp
  $smtcStatus = -1
  $smtcSessions = 0
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction SilentlyContinue | Out-Null
    $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1
    } | Select-Object -First 1
    $req = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
    if ($asTask) {
      $generic = $asTask.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
      $task = $generic.Invoke($null, @($req))
      $mgr = $task.GetAwaiter().GetResult()
    } else {
      $mgr = $req.GetAwaiter().GetResult()
    }
    if ($null -ne $mgr) {
      $list = @()
      try { $list = @($mgr.GetSessions()) } catch {}
      if ($list.Count -eq 0) {
        try {
          $cur = $mgr.GetCurrentSession()
          if ($null -ne $cur) { $list = @($cur) }
        } catch {}
      }
      $smtcSessions = @($list).Count
      $anyPlaying = $false
      $anyPaused = $false
      foreach ($session in $list) {
        if ($null -eq $session) { continue }
        try {
          $status = [int]$session.GetPlaybackInfo().PlaybackStatus
          $smtcStatus = $status
          if ($status -eq 4) {
            $anyPlaying = $true
            try {
              $id = [string]$session.SourceAppUserModelId
              if ($id) {
                if ($id.Length -gt 60) { $id = $id.Substring(0, 60) }
                $app = $id.Replace('\', '\\').Replace('"', '\"')
              }
            } catch {}
          } elseif ($status -eq 5 -or $status -eq 3) {
            $anyPaused = $true
          }
        } catch {}
      }
      if ($anyPlaying) { $playing = $true }
      elseif ($anyPaused -and $smtcSessions -gt 0) { $playing = $false }
    }
  } catch {
    $smtcStatus = -2
  }

  # 3) Decide — prefer SMTC when it works; otherwise process/title detection
  if ($playing -eq $true) { $on = $true }
  elseif ($playing -eq $false) { $on = $false }
  else { $on = $running }

  $onStr = if ($on) { 'true' } else { 'false' }
  $runStr = if ($running) { 'true' } else { 'false' }
  if (-not $app) { $app = '' }
  $script:mediaJson = "{`"on`":$onStr,`"app`":`"$app`",`"running`":$runStr,`"smtc`":$smtcStatus,`"sessions`":$smtcSessions}"

  if ($script:mediaJson -ne $script:mediaLastLog) {
    $script:mediaLastLog = $script:mediaJson
    [Console]::Error.WriteLine("media $script:mediaJson")
  }
}

$last = ''
$tick = 0
Update-CapriMedia
while ($true) {
  if ($tick % 6 -eq 0) { Update-CapriMedia }
  $snap = Add-BrowserAi ([CapriWindows]::Snapshot($Self))
  if ($snap.EndsWith('}')) {
    $snap = $snap.Substring(0, $snap.Length - 1) + ',"media":' + $script:mediaJson + '}'
  }
  if ($snap -ne $last) {
    [Console]::Out.WriteLine($snap)
    [Console]::Out.Flush()
    $last = $snap
  }
  $tick++
  if ($ParentPid -and ($tick % 20 -eq 0) -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 150
}