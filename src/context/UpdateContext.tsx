import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Download, Sparkles, X } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";
import type { UpdateInfo } from "../types";
import { Modal } from "../components/Modal";

interface UpdateValue {
  info: UpdateInfo | null;
  loading: boolean;
  hasNotice: boolean;
  check: (force?: boolean) => Promise<UpdateInfo | null>;
  openModal: () => void;
  dismiss: () => void;
}

const UpdateContext = createContext<UpdateValue | null>(null);
const SIX_HOURS = 6 * 60 * 60 * 1000;
const DISMISS_KEY = "lingji-update-dismissed-version";

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) || "";
  } catch {
    return "";
  }
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);
  const lastCheckAt = useRef(0);
  const userIdRef = useRef("");

  const check = useCallback(
    async (force = false) => {
      if (!user) return null;
      setLoading(true);
      try {
        const result = await api.update(force);
        setInfo(result);
        lastCheckAt.current = Date.now();
        return result;
      } catch {
        // Update checks are optional and must never disturb normal use.
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (!user) {
      setInfo(null);
      return;
    }
    if (userIdRef.current !== user.id) {
      userIdRef.current = user.id;
      setDismissed(readDismissed());
    }
    void check(false);
    const interval = window.setInterval(() => {
      void check(false);
    }, SIX_HOURS);
    return () => window.clearInterval(interval);
  }, [check, user]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      if (Date.now() - lastCheckAt.current > 2 * 60 * 60 * 1000) {
        void check(false);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [check, user]);

  const dismiss = useCallback(() => {
    const version = info?.latestVersion || "";
    if (version) {
      try {
        localStorage.setItem(DISMISS_KEY, version);
      } catch {
        // ignore storage failures
      }
      setDismissed(version);
    }
    setModalOpen(false);
  }, [info?.latestVersion]);

  const hasNotice = Boolean(
    info?.updateAvailable &&
      info.latestVersion &&
      info.downloadUrl &&
      dismissed !== info.latestVersion,
  );

  const openModal = useCallback(() => {
    // The caller has already checked for an update. Opening unconditionally
    // also avoids reading a stale `info` immediately after an async check.
    setModalOpen(true);
  }, []);

  const value = useMemo(
    () => ({ info, loading, hasNotice, check, openModal, dismiss }),
    [info, loading, hasNotice, check, openModal, dismiss],
  );

  return (
    <UpdateContext.Provider value={value}>
      {children}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        className="update-modal"
        labelledBy="update-title"
      >
        {info?.latestVersion && (
          <>
            <div className="update-modal-icon">
              <Sparkles size={24} />
            </div>
            <span className="modal-eyebrow">A NEW VERSION</span>
            <h2 id="update-title">聆记 {info.latestVersion} 已发布</h2>
            <p className="update-modal-lead">
              你正在使用 {info.currentVersion}。更新不会删除现有课程、转写和 API
              设置；下载后关闭当前窗口并运行安装包即可。
            </p>
            {info.notes && info.notes.length > 0 && (
              <div className="update-notes">
                <span className="update-notes-label">本次更新</span>
                <ul>
                  {info.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="update-meta">
              {info.publishedAt && (
                <span>
                  发布于{" "}
                  {new Intl.DateTimeFormat("zh-CN", {
                    month: "long",
                    day: "numeric",
                  }).format(new Date(info.publishedAt))}
                </span>
              )}
              {info.size ? (
                <span>{(info.size / 1024 / 1024).toFixed(1)} MB</span>
              ) : null}
            </div>
            <div className="modal-actions update-actions">
              <button className="button ghost" onClick={dismiss}>
                稍后提醒
              </button>
              <a
                className="button primary"
                href={info.downloadUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => setModalOpen(false)}
              >
                <Download size={16} /> 下载更新
              </a>
            </div>
            <p className="update-safe-note">
              更新是可选操作；在你操作之前，当前版本会继续正常工作。
            </p>
          </>
        )}
      </Modal>
    </UpdateContext.Provider>
  );
}

export function useUpdate(): UpdateValue {
  const value = useContext(UpdateContext);
  if (!value) throw new Error("useUpdate must be used inside UpdateProvider");
  return value;
}

export function UpdateBanner() {
  const { info, hasNotice, openModal, dismiss } = useUpdate();
  if (!hasNotice || !info?.latestVersion) return null;
  return (
    <div className="update-banner" role="status">
      <span className="update-banner-icon">
        <Sparkles size={16} />
      </span>
      <div>
        <strong>发现新版本 {info.latestVersion}</strong>
        <span>包含新的功能和体验改进，不影响正在进行的课堂。</span>
      </div>
      <button className="update-banner-open" onClick={openModal}>
        查看更新
      </button>
      <button
        className="update-banner-close"
        onClick={dismiss}
        aria-label="暂时隐藏更新提示"
      >
        <X size={15} />
      </button>
    </div>
  );
}
