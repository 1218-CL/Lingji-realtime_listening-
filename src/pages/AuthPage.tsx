import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  MessageCircleQuestion,
  Mic2,
  Radio,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, errorMessage } from "../lib/api";
import { Logo } from "../components/Logo";

type Mode = "login" | "register";

export function AuthPage() {
  const { user, loading, login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .publicConfig()
      .then((config) => setDemoAvailable(Boolean(config.demoAvailable)))
      .catch(() => setDemoAvailable(false));
  }, []);

  if (!loading && user) return <Navigate to="/" replace />;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || demoLoading) return;
    setError("");
    if (!username.trim() || !password) {
      setError("请填写用户名和密码。");
      return;
    }
    if (mode === "register" && password.length < 6) {
      setError("密码至少需要 6 位。");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password, displayName.trim() || username.trim());
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemo = async () => {
    if (demoLoading || submitting) return;
    setError("");
    setDemoLoading(true);
    try {
      await login("demo", "demo1234");
    } catch (err) {
      setError(errorMessage(err));
      setDemoLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-showcase">
        <div className="auth-orb auth-orb-one" aria-hidden="true" />
        <div className="auth-orb auth-orb-two" aria-hidden="true" />
        <div className="auth-top">
          <Logo light />
          <span className="auth-beta">实时课堂 · Beta</span>
        </div>

        <div className="auth-copy">
          <span className="auth-eyebrow">
            <span className="live-dot light" />
            LISTEN · THINK · ASK
          </span>
          <h1>
            把课堂，
            <br />
            变成<span>可追问</span>的知识。
          </h1>
          <p className="auth-lead">
            一边听，一边把老师的话变成清晰纪要。
            <br />
            任何没听懂的瞬间，都能立刻追问。
          </p>

          <div className="auth-wave" aria-hidden="true">
            {Array.from({ length: 38 }).map((_, index) => (
              <i
                key={index}
                style={{
                  animationDelay: `${(index % 11) * 0.1}s`,
                  height: `${14 + ((index * 17) % 40)}px`,
                }}
              />
            ))}
          </div>

          <div className="auth-features">
            <div>
              <span className="auth-feature-icon">
                <Radio size={18} />
              </span>
              <strong>专注听讲</strong>
              <p>转写在后台安静进行，不占课堂视线</p>
            </div>
            <div>
              <span className="auth-feature-icon">
                <Sparkles size={18} />
              </span>
              <strong>课堂纪要</strong>
              <p>摘要、重点与概念，想整理时一键更新</p>
            </div>
            <div>
              <span className="auth-feature-icon">
                <MessageCircleQuestion size={18} />
              </span>
              <strong>随堂追问</strong>
              <p>基于当前课堂内容，随时得到回答</p>
            </div>
          </div>
        </div>

        <div className="auth-showcase-foot">
          <span>隐私优先</span>
          <p>课程与音频保存在你的实例，API 密钥服务端加密。</p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-mobile-logo">
            <Logo />
          </div>

          <div className="auth-form-head">
            <span className="auth-mini-label">
              <Sparkles size={13} />
              YOUR CLASSROOM, AMPLIFIED
            </span>
            <h2>{mode === "login" ? "回到你的课堂" : "创建你的聆记账户"}</h2>
            <p>
              {mode === "login"
                ? "继续上一次的听讲，或者开始一堂新课。"
                : "注册后即可录音、生成纪要，并保存所有课程。"}
            </p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="登录或注册">
            <button
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "active" : ""}
              onClick={() => switchMode("login")}
            >
              登录
            </button>
            <button
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "active" : ""}
              onClick={() => switchMode("register")}
            >
              注册
            </button>
            <span className={`auth-tab-slider ${mode === "register" ? "right" : ""}`} />
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "register" && (
              <label className="field auth-field">
                <span>怎么称呼你</span>
                <div className="input-icon-wrap">
                  <BadgeCheck size={17} />
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="例如：林知夏"
                    maxLength={24}
                    autoComplete="nickname"
                  />
                </div>
              </label>
            )}

            <label className="field auth-field">
              <span>用户名</span>
              <div className="input-icon-wrap">
                <UserRound size={17} />
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="输入用户名"
                  autoComplete="username"
                  maxLength={24}
                />
              </div>
            </label>

            <label className="field auth-field">
              <span>密码</span>
              <div className="input-icon-wrap">
                <LockKeyhole size={17} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "register" ? "至少 6 位字符" : "输入密码"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  maxLength={72}
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && (
              <div className="auth-error" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <button className="button primary auth-submit" type="submit" disabled={submitting || demoLoading}>
              {submitting ? (
                <>
                  <LoaderCircle size={18} className="spin" />
                  正在进入…
                </>
              ) : (
                <>
                  {mode === "login" ? "进入我的课堂" : "创建账户并开始"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {demoAvailable && (
            <>
              <div className="auth-divider">
                <span>或先看看它如何工作</span>
              </div>

              <button
                className="demo-login"
                onClick={handleDemo}
                disabled={demoLoading || submitting}
              >
                <span className="demo-login-icon">
                  {demoLoading ? <LoaderCircle size={18} className="spin" /> : <Mic2 size={18} />}
                </span>
                <span>
                  <strong>一键体验示例课堂</strong>
                  <small>内置 4 门课程，无需配置 API</small>
                </span>
                <ArrowRight size={17} />
              </button>
            </>
          )}

          <div className="auth-security">
            <KeyRound size={14} />
            <span>接入自己的大模型 API · 密钥加密存储 · 本地优先</span>
          </div>

          <p className="auth-fineprint">
            继续即表示你同意仅将课堂录音用于个人学习记录。请尊重老师的知识产权。
          </p>
        </div>
      </section>
    </div>
  );
}
