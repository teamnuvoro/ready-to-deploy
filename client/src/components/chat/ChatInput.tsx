import { useState, useEffect, useRef } from "react";
import { Send, Mic, MicOff, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { type FormEvent } from "react";

// TypeScript declarations for Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  isMobile?: boolean;
  quickReplies?: string[];
  onQuickReply?: (reply: string) => void;
  onAnalyzeClick?: () => void;
  failedMessage?: string;
}

const defaultQuickReplies = [
  "Mera current relationship confusing hai",
  "Kaise pata chalega koi mujhe pasand karta hai?",
  "Main kya dhundh raha hoon samajhna chahta hoon",
  "Mujhe dating advice chahiye",
  "Mujhe trust issues ho rahe hain",
  "Kaise pata chalega main relationship ready hoon?"
];

export function ChatInput({ 
  onSendMessage, 
  isLoading, 
  disabled, 
  isMobile,
  quickReplies = defaultQuickReplies,
  onQuickReply,
  onAnalyzeClick,
  failedMessage
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (failedMessage) {
      setMessage(failedMessage);
    }
  }, [failedMessage]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US'; // Can be changed to 'hi-IN' for Hindi

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            setMessage(prev => {
              // Remove any previous interim text and add final transcript
              const baseText = prev.replace(/\s*\[listening\.\.\.\]\s*$/, '');
              return (baseText + finalTranscript).trim();
            });
          } else if (interimTranscript) {
            setMessage(prev => {
              // Remove previous interim text and add new one
              const baseText = prev.replace(/\s*\[listening\.\.\.\]\s*$/, '');
              return baseText + (baseText ? ' ' : '') + interimTranscript + ' [listening...]';
            });
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          setIsRecording(false);
          
          if (event.error === 'no-speech') {
            // User didn't speak, just stop recording
            stopRecording();
          } else if (event.error === 'not-allowed') {
            alert('Microphone permission denied. Please enable microphone access in your browser settings.');
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          // If still in recording state, restart (continuous mode)
          if (isRecording && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (error) {
              // Recognition already started or stopped
              setIsRecording(false);
            }
          }
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  // Update recognition state when isRecording changes
  useEffect(() => {
    if (!recognitionRef.current) return;

    if (isRecording && !isListening) {
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error('Failed to start recognition:', error);
        setIsRecording(false);
      }
    } else if (!isRecording && isListening) {
      recognitionRef.current.stop();
    }
  }, [isRecording, isListening]);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    setIsRecording(true);
    setMessage(prev => prev.replace(/\s*\[listening\.\.\.\]\s*$/, ''));
  };

  const stopRecording = () => {
    setIsRecording(false);
    setMessage(prev => prev.replace(/\s*\[listening\.\.\.\]\s*$/, '').trim());
  };

  const getCleanMessage = () => {
    return message.replace(/\s*\[listening\.\.\.\]\s*$/, '').trim();
  };

  const handleSend = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    const messageToSend = getCleanMessage();
    
    if (messageToSend && !isLoading && !disabled) {
      if (isRecording) {
        stopRecording();
      }
      onSendMessage(messageToSend);
      setMessage("");
    }
  };

  const handleQuickReply = (reply: string) => {
    if (onQuickReply) {
      onQuickReply(reply);
    } else {
      onSendMessage(reply);
    }
  };

  return (
    <div className="bg-white border-t border-gray-100 px-4 py-3 space-y-3">
      {/* Analyze My Type Button */}
      <Link href="/analytics">
        <button
          className="w-full py-3 px-4 gradient-primary-button text-white rounded-full font-medium flex items-center justify-center gap-2 shadow-lg shadow-purple-300/30 hover:shadow-xl transition-shadow"
          data-testid="button-analyze-type"
        >
          <Sparkles className="w-5 h-5" />
          Analyze My Type
        </button>
      </Link>

      {/* Quick Replies */}
      {quickReplies && quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickReplies.slice(0, 6).map((reply, index) => (
            <button
              key={index}
              onClick={() => handleQuickReply(reply)}
              disabled={isLoading || disabled}
              className="quick-reply-chip text-sm disabled:opacity-50"
              data-testid={`button-quickreply-${index}`}
            >
              {reply}
            </button>
          ))}
        </div>
      )}
      
      {/* Input Row */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleRecording}
          disabled={isLoading || disabled}
          className={`p-3 rounded-full transition-all ${
            isRecording
              ? "bg-red-500 text-white animate-pulse"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
          data-testid="button-voice-record"
          title={isRecording ? "Stop recording" : "Start voice input"}
        >
          {isRecording ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </button>
        
        <div className="flex-1 relative">
          <Input
            type="text"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              // Stop recording if user starts typing manually
              if (isRecording) {
                stopRecording();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder={isLoading ? "Sending..." : isRecording ? "Listening..." : "Type your message..."}
            disabled={isLoading || disabled}
            className="w-full h-12 px-4 bg-gray-100 rounded-full text-foreground placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:opacity-50"
            data-testid="input-chat-message"
          />
        </div>
        
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSend(e);
          }}
          disabled={isLoading || disabled || !getCleanMessage()}
          className="w-12 h-12 gradient-primary-button text-white rounded-full flex items-center justify-center disabled:opacity-50 shadow-lg shadow-purple-300/30 disabled:cursor-not-allowed"
          data-testid="button-send-message"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
