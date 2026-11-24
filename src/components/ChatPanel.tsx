import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, MessageCircleQuestion, Square, Sparkles } from "lucide-react";
import type { ChatMessage } from "../types";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  streaming: boolean;
  streamingText: string;
  onStop?: () => void;
  suggestions?: string[];
  disabled?: boolean;
  modeLabel?: string;
  emptyTitle?: string;
  emptyText?: string;
  startAtTop?: boolean;
}

export function ChatPanel({
  messages,
  onSend,
  streaming,
  streamingText,
  onStop,
  suggestions = [],
  disabled,
  modeLabel = "AI 助教",
  emptyTitle = "有不懂的，随时打断",
  emptyText = "我会结合正在进行的课堂内容回答，不会打断录音。",
  startAtTop = false,
}: ChatPanelProps) {
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      node.scrollTop = startAtTop ? 0 : node.scrollHeight;
      return;
    }
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages.length, streamingText, streaming, startAtTop]);

  const submit = (content?: string) => {
    const text = (content ?? value).trim();
    if (!text || disabled || streaming) return;
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    onSend(text);
  };

  const autoGrow = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 110)}px`;
  };

  return (
    <section className="panel chat-panel" aria-label="随堂问答">
      <div className="panel-head chat-head">
        <div className="panel-title">
          <span className="icon-badge icon-badge-warm">
            <MessageCircleQuestion size={17} />
          </span>
          <div>
            <h2>随堂问答</h2>
            <p>边听边问，回答会参考当前转写</p>
          </div>
        </div>
        <span className="chat-mode">
          <Sparkles size={12} />
          {modeLabel}
        </span>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && !streaming && (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <Bot size={24} />
            </div>
            <strong>{emptyTitle}</strong>
            <p>{emptyText}</p>
            {suggestions.length > 0 && (
              <div className="chat-suggestions">
                {suggestions.slice(0, 3).map((suggestion) => (
                  <button key={suggestion} onClick={() => submit(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((message) => (
          <div className={`chat-message ${message.role}`} key={message.id}>
            {message.role === "assistant" && (
              <span className="chat-avatar">
                <Sparkles size={13} />
              </span>
            )}
            <div className="chat-bubble">
              <div className="chat-content">{message.content}</div>
              {message.role === "assistant" && message.source === "local" && (
                <span className="chat-source">本地转写检索</span>
              )}
            </div>
          </div>
        ))}

        {streaming && (
          <div className="chat-message assistant">
            <span className="chat-avatar streaming">
              <Sparkles size={13} />
            </span>
            <div className="chat-bubble">
              <div className="chat-content">
                {streamingText || (
                  <span className="typing-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
                {streamingText && <span className="stream-caret" />}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-composer">
        <div className={`chat-input-wrap ${streaming ? "is-streaming" : ""}`}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              autoGrow();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={disabled ? "录音结束后仍可继续提问" : "问点什么，比如：这里的关键区别是什么？"}
            rows={1}
            disabled={disabled}
            aria-label="输入问题"
          />
          {streaming ? (
            <button className="chat-send stop" onClick={onStop} title="停止回答" aria-label="停止回答">
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              className="chat-send"
              onClick={() => submit()}
              disabled={!value.trim() || disabled}
              aria-label="发送问题"
            >
              <ArrowUp size={17} />
            </button>
          )}
        </div>
        <div className="composer-hint">
          <span>Enter 发送 · Shift + Enter 换行</span>
          <span>回答仅供参考</span>
        </div>
      </div>
    </section>
  );
}
