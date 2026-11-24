export {};

declare global {
  interface SpeechAlternativeLike {
    transcript: string;
    confidence: number;
  }

  interface SpeechResultLike {
    readonly isFinal: boolean;
    readonly length: number;
    [index: number]: SpeechAlternativeLike;
  }

  interface SpeechResultListLike {
    readonly length: number;
    [index: number]: SpeechResultLike;
  }

  interface SpeechRecognitionEventLike extends Event {
    readonly resultIndex: number;
    readonly results: SpeechResultListLike;
  }

  interface SpeechRecognitionErrorEventLike extends Event {
    readonly error: string;
    readonly message?: string;
  }

  interface SpeechRecognitionLike {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
    start: () => void;
    stop: () => void;
    abort: () => void;
  }

  interface SpeechRecognitionConstructor {
    new (): SpeechRecognitionLike;
  }

  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    webkitAudioContext?: typeof AudioContext;
  }
}
