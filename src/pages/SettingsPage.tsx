import { useEffect, useState } from "react";
import {
  AlertTriangle,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudOff,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Save,
  ServerCog,
  ShieldCheck,
  Sparkles,
  UserRound,
  WandSparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useUpdate } from "../context/UpdateContext";
import { api, errorMessage } from "../lib/api";
import type { AsrSettings, LlmSettings } from "../types";
import { formatDate } from "../lib/format";

const PRESETS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    letter: "D",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    note: "中文课堂场景性价比高",
  },
  {
    id: "openai",
    name: "OpenAI",
    letter: "O",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    note: "通用能力与稳定性好",
  },
  {
    id: "qwen",
    name: "通义千问",
    letter: "Q",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    note: "国内访问速度快",
  },
  {
    id: "moonshot",
    name: "Moonshot",
    letter: "K",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    note: "长上下文友好",
  },
  {
    id: "custom",
    name: "自定义",
    letter: "+",
    baseUrl: "",
    model: "",
    note: "任意 OpenAI 兼容接口",
  },
];

function matchPreset(baseUrl: string): string {
  const found = PRESETS.find(
    (preset) => preset.baseUrl && preset.baseUrl.replace(/\/+$/, "") === baseUrl.replace(/\/+$/, ""),
  );
  return found?.id || "custom";
}

export function SettingsPage() {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const {
    info: updateInfo,
    loading: updateLoading,
    check: checkUpdate,
    openModal: openUpdateModal,
  } = useUpdate();
  const [updateMessage, setUpdateMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [asr, setAsr] = useState<AsrSettings | null>(null);
  const [asrEnabled, setAsrEnabled] = useState(false);
  const [asrBaseUrl, setAsrBaseUrl] = useState("");
  const [asrModel, setAsrModel] = useState("");
  const [asrLanguage, setAsrLanguage] = useState("zh");
  const [asrApiKey, setAsrApiKey] = useState("");
  const [asrShowKey, setAsrShowKey] = useState(false);
  const [asrClearKey, setAsrClearKey] = useState(false);

  const [provider, setProvider] = useState("deepseek");
  const [selectedPreset, setSelectedPreset] = useState("deepseek");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [formError, setFormError] = useState("");

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    api
      .settings()
      .then((result) => {
        setSettings(result.llm);
        setAsr(result.asr);
        setAsrEnabled(Boolean(result.asr.enabled));
        setAsrBaseUrl(result.asr.baseUrl || "");
        setAsrModel(result.asr.model || "");
        setAsrLanguage(result.asr.language || "zh");
        setProvider(result.llm.provider || "custom");
        if (result.llm.baseUrl) {
          setBaseUrl(result.llm.baseUrl);
          setModel(result.llm.model || "");
          setSelectedPreset(matchPreset(result.llm.baseUrl));
        } else {
          // Offer a sensible first connection without marking it as configured.
          setSelectedPreset("deepseek");
          setProvider("deepseek");
          setBaseUrl(PRESETS[0].baseUrl);
          setModel(PRESETS[0].model);
        }
      })
      .catch((err) => setLoadError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const configured = settings?.configured;

  const handleCheckUpdate = async () => {
    setUpdateMessage("");
    const result = await checkUpdate(true);
    if (!result) {
      setUpdateMessage("暂时无法检查更新，请稍后再试。");
      return;
    }
    if (result.updateAvailable) {
      openUpdateModal();
      return;
    }
    if (result.error) {
      setUpdateMessage(result.error);
      return;
    }
    if (!result.configured) {
      setUpdateMessage("此安装包暂未配置更新通道。");
      return;
    }
    setUpdateMessage("已经是最新版本。");
  };

  const choosePreset = (id: string) => {
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setSelectedPreset(id);
    setProvider(preset.id === "custom" ? "custom" : preset.id);
    if (preset.baseUrl) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.model);
    }
    setTestResult(null);
    setFormError("");
  };

  const validate = (): string => {
    if (!baseUrl.trim()) return "请填写 API 地址。";
    if (!model.trim()) return "请填写模型名称。";
    try {
      const parsed = new URL(baseUrl.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) return "API 地址需以 http:// 或 https:// 开头。";
    } catch {
      return "API 地址格式不正确。";
    }
    if (asrEnabled) {
      if (!asrBaseUrl.trim()) return "请填写语音识别 API 地址。";
      if (!asrModel.trim()) return "请填写语音识别模型名称。";
      try {
        const parsed = new URL(asrBaseUrl.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return "语音识别 API 地址需以 http:// 或 https:// 开头。";
        }
      } catch {
        return "语音识别 API 地址格式不正确。";
      }
    }
    return "";
  };

  const save = async (silent = false) => {
    const issue = validate();
    if (issue) {
      setFormError(issue);
      return false;
    }
    setSaving(true);
    setFormError("");
    try {
      const result = await api.saveSettings({
        provider,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim() || undefined,
        clearApiKey: clearKey,
        asr: {
          enabled: asrEnabled,
          baseUrl: asrBaseUrl.trim(),
          model: asrModel.trim(),
          language: asrLanguage.trim() || "zh",
          apiKey: asrApiKey.trim() || undefined,
          clearApiKey: asrClearKey,
        },
      });
      setSettings(result.llm);
      setAsr(result.asr);
      setAsrEnabled(Boolean(result.asr.enabled));
      setAsrBaseUrl(result.asr.baseUrl || "");
      setAsrModel(result.asr.model || "");
      setAsrLanguage(result.asr.language || "zh");
      setAsrApiKey("");
      setAsrClearKey(false);
      setSelectedPreset(matchPreset(result.llm.baseUrl));
      setApiKey("");
      setClearKey(false);
      if (!silent) {
        showToast("设置已保存。", "success");
        if (result.llm.hasApiKey) setTestResult(null);
      }
      return true;
    } catch (err) {
      setFormError(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    const issue = validate();
    if (issue) {
      setFormError(issue);
      return;
    }
    setTesting(true);
    setTestResult(null);
    setFormError("");
    try {
      // The test endpoint reads persisted settings, so always save the form first.
      const saved = await save(true);
      if (!saved) return;
      const result = await api.testConnection();
      setTestResult(result);
      if (result.ok) showToast("模型连接成功。", "success");
    } catch (err) {
      setTestResult({ ok: false, message: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  };

  const switchToLocal = async () => {
    setSaving(true);
    setFormError("");
    try {
      const result = await api.saveSettings({
        provider: "custom",
        baseUrl: "",
        model: "",
        clearApiKey: true,
      });
      setSettings(result.llm);
      setProvider("custom");
      setSelectedPreset("custom");
      setBaseUrl("");
      setModel("");
      setApiKey("");
      setClearKey(false);
      setTestResult(null);
      showToast("已切换回本地纪要模式。", "success");
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!displayName.trim()) {
      showToast("昵称不能为空。", "error");
      return;
    }
    setSavingProfile(true);
    try {
      const result = await api.updateProfile(displayName.trim());
      updateUser(result.user);
      showToast("昵称已更新。", "success");
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-page settings-loading">
        <div className="skeleton-line w-40" />
        <div className="settings-loading-grid">
          <div className="skeleton-block" />
          <div className="skeleton-block" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="settings-page">
        <div className="fatal-card">
          <div className="fatal-icon">
            <ServerCog size={25} />
          </div>
          <h1>设置加载失败</h1>
          <p>{loadError}</p>
          <button className="button primary" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <header className="settings-header">
        <span className="page-eyebrow">
          <ServerCog size={14} />
          SETTINGS & CONNECTIONS
        </span>
        <h1>
          设置你的<span>课堂引擎</span>
        </h1>
        <p>聆记默认使用本地纪要，不联网也能用。接入自己的大模型后，可以获得更完整的归纳与随堂推理。</p>
      </header>

      <div className="settings-grid">
        <main className="settings-main">
          <section className="panel settings-card">
            <div className="settings-card-head">
              <div>
                <span className="settings-step">01</span>
                <h2>选择模型服务</h2>
                <p>所有服务都使用 OpenAI 兼容的 Chat Completions 格式。</p>
              </div>
              <span className={`connection-pill ${configured ? "connected" : ""}`}>
                <span />
                {configured ? "已配置模型" : "当前为本地模式"}
              </span>
            </div>

            <div className="provider-grid">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={`provider-card ${selectedPreset === preset.id ? "active" : ""}`}
                  onClick={() => choosePreset(preset.id)}
                >
                  <span className={`provider-letter provider-${preset.id}`}>{preset.letter}</span>
                  <span className="provider-copy">
                    <strong>{preset.name}</strong>
                    <span>{preset.note}</span>
                  </span>
                  <span className="provider-check">
                    {selectedPreset === preset.id && <Check size={13} />}
                  </span>
                </button>
              ))}
            </div>

            <div className="settings-fields">
              <label className="field">
                <span>API 地址</span>
                <input
                  value={baseUrl}
                  onChange={(event) => {
                    setBaseUrl(event.target.value);
                    setProvider("custom");
                    setSelectedPreset("custom");
                    setTestResult(null);
                  }}
                  placeholder="https://api.deepseek.com/v1"
                  spellCheck={false}
                />
                <small>填写到 /v1 即可，系统会自动拼接 /chat/completions。</small>
              </label>
              <label className="field">
                <span>模型名称</span>
                <input
                  value={model}
                  onChange={(event) => {
                    setModel(event.target.value);
                    setTestResult(null);
                  }}
                  placeholder="deepseek-chat"
                  spellCheck={false}
                />
                <small>填写服务商文档中的模型 ID。</small>
              </label>
            </div>

            <div className="settings-divider">
              <span>认证信息</span>
            </div>

            <label className="field">
              <span>API Key</span>
              <div className="input-icon-wrap api-key-input">
                <KeyRound size={17} />
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setClearKey(false);
                    setTestResult(null);
                  }}
                  placeholder={
                    settings?.hasApiKey
                      ? `已保存密钥（尾号 ${settings.apiKeyLast4}），留空则不修改`
                      : "sk-..."
                  }
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowKey((value) => !value)}
                  aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <small className="field-note">
                <LockKeyhole size={12} /> 密钥经 AES-256-GCM 加密后保存在本机，浏览器不会读取到明文。
              </small>
            </label>

            {settings?.hasApiKey && (
              <label className="clear-key">
                <input
                  type="checkbox"
                  checked={clearKey}
                  onChange={(event) => {
                    setClearKey(event.target.checked);
                    setTestResult(null);
                  }}
                />
                <span>清除已保存的 API Key，回到无密钥 / 本地模式</span>
              </label>
            )}

            {formError && <div className="inline-error">{formError}</div>}
            {testResult && (
              <div className={`connection-result ${testResult.ok ? "ok" : "bad"}`}>
                {testResult.ok ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                <span>{testResult.message}</span>
              </div>
            )}

            <div className="settings-actions">
              {configured && (
                <button
                  className="settings-local-button"
                  onClick={() => void switchToLocal()}
                  disabled={saving || testing}
                >
                  <CloudOff size={14} /> 切回本地模式
                </button>
              )}
              <button className="button ghost" onClick={test} disabled={testing || saving}>
                {testing ? <LoaderCircle size={16} className="spin" /> : <Zap size={16} />}
                {testing ? "正在测试…" : "测试连接"}
              </button>
              <button className="button primary" onClick={() => void save()} disabled={saving || testing}>
                {saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
                {saving ? "保存中…" : "保存设置"}
              </button>
            </div>
          </section>

          <section className="panel settings-card asr-card">
            <div className="settings-card-head">
              <div>
                <span className="settings-step">02</span>
                <h2>语音识别</h2>
                <p>浏览器识别不稳时，可以把音频分片交给自己的转写服务。</p>
              </div>
              <span className={`connection-pill ${asrEnabled ? "connected" : ""}`}>
                <span />
                {asrEnabled ? "服务端转写" : "浏览器识别"}
              </span>
            </div>

            <div className="asr-toggle-row">
              <div>
                <strong>启用服务端转写</strong>
                <span>
                  开启后浏览器 Web Speech 会关闭，由本地服务每 20 秒把音频分片发到你配置的
                  ASR 接口。
                </span>
              </div>
              <button
                type="button"
                className={`switch ${asrEnabled ? "on" : ""}`}
                role="switch"
                aria-checked={asrEnabled}
                onClick={() => setAsrEnabled((value) => !value)}
              >
                <span />
              </button>
            </div>

            {asrEnabled && (
              <div className="asr-fields">
                <div className="settings-fields">
                  <label className="field">
                    <span>转写 API 地址</span>
                    <input
                      value={asrBaseUrl}
                      onChange={(event) => setAsrBaseUrl(event.target.value)}
                      placeholder="https://api.siliconflow.cn/v1"
                      spellCheck={false}
                    />
                    <small>OpenAI 兼容地址，会拼接 /audio/transcriptions。</small>
                  </label>
                  <label className="field">
                    <span>转写模型</span>
                    <input
                      value={asrModel}
                      onChange={(event) => setAsrModel(event.target.value)}
                      placeholder="FunAudioLLM/SenseVoiceSmall"
                      spellCheck={false}
                    />
                    <small>例如 SenseVoiceSmall、whisper-1，按服务商文档填写。</small>
                  </label>
                </div>

                <div className="settings-fields">
                  <label className="field">
                    <span>语言</span>
                    <input
                      value={asrLanguage}
                      onChange={(event) => setAsrLanguage(event.target.value)}
                      placeholder="zh"
                      maxLength={20}
                    />
                    <small>中文课堂一般填 zh。</small>
                  </label>
                  <label className="field">
                    <span>转写 API Key</span>
                    <div className="input-icon-wrap api-key-input">
                      <KeyRound size={17} />
                      <input
                        type={asrShowKey ? "text" : "password"}
                        value={asrApiKey}
                        onChange={(event) => {
                          setAsrApiKey(event.target.value);
                          setAsrClearKey(false);
                        }}
                        placeholder={
                          asr?.hasApiKey
                            ? `已保存密钥（尾号 ${asr.apiKeyLast4}），留空则不修改`
                            : "sk-..."
                        }
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="input-action"
                        onClick={() => setAsrShowKey((value) => !value)}
                        aria-label={asrShowKey ? "隐藏转写密钥" : "显示转写密钥"}
                      >
                        {asrShowKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </label>
                </div>

                {asr?.hasApiKey && (
                  <label className="clear-key">
                    <input
                      type="checkbox"
                      checked={asrClearKey}
                      onChange={(event) => setAsrClearKey(event.target.checked)}
                    />
                    <span>清除已保存的转写 Key</span>
                  </label>
                )}
                <small className="field-note asr-field-note">
                  <LockKeyhole size={12} /> 音频只在本机内存中分片并转发，不保存在服务端；
                  转写服务可能按音频时长收费。
                </small>
              </div>
            )}

            {!asrEnabled && (
              <p className="asr-off-note">
                继续使用浏览器识别。网络中断时会显示状态并自动重连，但无法根治浏览器语音服务的网络问题。
              </p>
            )}

            <div className="asr-save-row">
              <span>音频不落盘，只转发到你配置的转写服务。</span>
              <button
                className="button ghost small"
                onClick={() => void save()}
                disabled={saving || testing}
              >
                {saving ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Save size={14} />
                )}
                {saving ? "保存中…" : "保存语音识别"}
              </button>
            </div>
          </section>

          <section className="panel settings-card profile-card">
            <div className="settings-card-head">
              <div>
                <span className="settings-step">03</span>
                <h2>个人资料</h2>
                <p>显示在首页问候和账号菜单里。</p>
              </div>
            </div>
            <div className="profile-row">
              <div className="profile-avatar">
                <UserRound size={23} />
              </div>
              <div className="profile-fields">
                <label className="field">
                  <span>昵称</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={24}
                  />
                </label>
                <div className="profile-account-meta">
                  <span>@{user?.username}</span>
                  <span>加入于 {formatDate(user?.createdAt)}</span>
                  {user?.isDemo && <em>演示账号</em>}
                </div>
              </div>
              <button
                className="button ghost small"
                onClick={saveProfile}
                disabled={savingProfile || displayName.trim() === user?.displayName}
              >
                {savingProfile ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}
                保存昵称
              </button>
            </div>
          </section>
        </main>

        <aside className="settings-side">
          <section className="settings-aside-card accent">
            <span className="aside-icon">
              <WandSparkles size={21} />
            </span>
            <h3>接入之后，会发生什么？</h3>
            <ul>
              <li>
                <span>01</span>
                纪要不再只是转写检索，而会提炼因果、对比和课堂结构。
              </li>
              <li>
                <span>02</span>
                随堂问答能理解上下文，对没听懂的部分做解释和举例。
              </li>
              <li>
                <span>03</span>
                只有点击「更新摘要」才会发送新增转写和已有摘要；板书图片只在新上传时发送一次，不发送录音。
              </li>
            </ul>
          </section>

          <section className="settings-aside-card">
            <span className="aside-icon soft">
              <ShieldCheck size={21} />
            </span>
            <h3>你的数据怎么流动</h3>
            <p>
              录音和板书图片保存在本机，课程数据保存在 <code>.data/db.json</code>。
              只有生成纪要或提问时，课堂文字和图片才会发送到你配置的模型服务。
            </p>
            <div className="privacy-flow">
              <span>麦克风</span>
              <ChevronRight size={13} />
              <span>本机转写</span>
              <ChevronRight size={13} />
              <span>你的 API</span>
            </div>
          </section>

          <section className="settings-aside-card tip">
            <span className="aside-icon warm">
              <AlertTriangle size={20} />
            </span>
            <h3>关于浏览器语音识别</h3>
            <p>
              浏览器识别依赖 Chrome / Edge 的语音云服务，网络不稳定时可能中断；可在上方启用服务端转写绕开它。
              无论识别是否可用，录音和课堂计时都会保留。图片分析需要模型支持视觉；不支持时会自动回退文字分析。
            </p>
          </section>

          <section className="settings-aside-card status-card">
            <div>
              <span className="aside-icon soft">
                <Sparkles size={20} />
              </span>
              <div>
                <strong>{configured ? "模型已就绪" : "本地模式运行中"}</strong>
                <span>{configured ? "纪要与问答将由你的模型处理" : "无需 API，也可以完整记录课堂"}</span>
              </div>
            </div>
          </section>

          <section className="settings-aside-card update-card">
            <span className="aside-icon soft">
              <RefreshCw size={20} />
            </span>
            <h3>关于与更新</h3>
            <p>
              当前版本 <strong>v{updateInfo?.currentVersion || "1.1.0"}</strong>
              。更新是可选操作，不会影响正在进行的课堂。
            </p>
            <button
              className="button ghost small"
              onClick={() => void handleCheckUpdate()}
              disabled={updateLoading}
            >
              {updateLoading ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {updateLoading ? "检查中…" : "检查更新"}
            </button>
            {updateMessage && <small className="update-check-message">{updateMessage}</small>}
          </section>
        </aside>
      </div>
    </div>
  );
}
