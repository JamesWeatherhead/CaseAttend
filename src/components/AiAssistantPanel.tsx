
import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Globe, BrainCircuit, X, Camera, ImageIcon, Trash2, CheckCircle2, AlertTriangle, RotateCcw, ArrowDown, HelpCircle, KeyRound } from 'lucide-react';
import { streamChatResponse, preAnalyzeSlice, AiMode, AIProvider } from '../services/aiClient';
import { hasKey, getModel, modelLabel, BYOK_CHANGED_EVENT } from '../services/byokStore';
import ConnectKeyModal from './ConnectKeyModal';
import { ChatMessage, CursorContext, AiPointer } from '../types';
import { MarkdownText } from '../utils/markdownUtils';
import { LearnerLevel } from '../constants';
import { getDomain } from '../lib/domains';
import type { DomainKey } from '../lib/domains';

interface AiAssistantPanelProps {
  // Capture props lifted to parent
  capturedImage: string | null;
  capturedSliceMetadata: { slice: number; total?: number; label?: string } | null;
  onCaptureTrigger: () => void;
  onClearCapture: () => void;
  showCaptureToast: boolean;

  studyMetadata?: {
    studyId: string;
    patientName: string;
    description: string;
    modality: string;
    domain: DomainKey;
  };
  cursor?: CursorContext;
  onJumpToSlice?: (index: number) => void;
  activeSeriesInfo?: {
    description: string;
    instanceCount: number;
  };
  onStartTour?: () => void;
  onPointers?: (pointers: AiPointer[]) => void;
}

const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  capturedImage,
  capturedSliceMetadata,
  onCaptureTrigger,
  onClearCapture,
  showCaptureToast,
  studyMetadata, 
  cursor, 
  onJumpToSlice, 
  activeSeriesInfo,
  onStartTour,
  onPointers
}) => {
  // Learner Level State (must be before messages so welcome adapts)
  const [learnerLevel, setLearnerLevel] = useState<LearnerLevel>(() => {
    const stored = localStorage.getItem('caseattend_learner_level') as string;
    // Migrate old 'medstudent' value to new default
    if (stored === 'medstudent') return 'ms_preclinical';
    return (stored as LearnerLevel) || 'ms_preclinical';
  });

  const domain = getDomain(studyMetadata?.domain ?? 'radiology');

  const initMsg: ChatMessage[] = [
    { id: 'welcome', role: 'model', text: domain.welcomeMessage(learnerLevel, studyMetadata?.studyId) }
  ];
  const [messages, setMessages] = useState(initMsg);

  // Update welcome message when domain, study, or learner level changes
  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 1 && prev[0].id === 'welcome') {
        return [{ id: 'welcome', role: 'model', text: domain.welcomeMessage(learnerLevel, studyMetadata?.studyId) }];
      }
      return prev;
    });
  }, [studyMetadata?.domain, studyMetadata?.studyId, learnerLevel]);

  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [showMedPicker, setShowMedPicker] = useState(false);
  const [mode, setMode] = useState<AiMode>('chat');
  // BYOK is the launch model: every visitor uses their own OpenRouter balance, so
  // no inference is billed to a shared developer key. (setProvider retained for a
  // possible future owner-funded tier.)
  const [provider, setProvider] = useState<AIProvider>('openrouter');

  // BYOK connection state, kept in sync via BYOK_CHANGED_EVENT so the status bar
  // and model label update the instant the user connects or switches model.
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [byokConnected, setByokConnected] = useState<boolean>(() => hasKey());
  const [byokModelLabel, setByokModelLabel] = useState<string>(() => modelLabel(getModel()));

  useEffect(() => {
    const sync = () => {
      setByokConnected(hasKey());
      setByokModelLabel(modelLabel(getModel()));
    };
    window.addEventListener(BYOK_CHANGED_EVENT, sync);
    return () => window.removeEventListener(BYOK_CHANGED_EVENT, sync);
  }, []);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const activeRequestRef = useRef(false);

  // Aliases for lifted state
  const attachedScreenshot = capturedImage;
  const capturedSliceInfo = capturedSliceMetadata;

  // Scroll State
  const [isUserNearBottom, setIsUserNearBottom] = useState(true);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  
  // Dynamic suggestions cache (pre-fetched for all levels)
  const [dynamicSuggestionsMap, setDynamicSuggestionsMap] = useState<Record<LearnerLevel, string[]> | null>(null);

  // Pre-analysis context: grounding description generated when a slice is first captured.
  // Prepended to every user prompt so the AI stays grounded in the actual image content.
  const [sliceAnalysis, setSliceAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    localStorage.setItem('caseattend_learner_level', learnerLevel);
  }, [learnerLevel]);

  useEffect(() => {
    localStorage.setItem('caseattend_provider', provider);
  }, [provider]);

  // Clear dynamic suggestions when capture changes
  useEffect(() => {
    if (capturedImage) {
       setDynamicSuggestionsMap(null);
    }
  }, [capturedImage]);

  // Run whole-slide pre-analysis once when the study loads.
  // Uses the first image of the first series as the overview.
  // This grounds ALL subsequent AI responses in the actual slide content,
  // preventing jailbreaking regardless of what the user captures or segments.
  useEffect(() => {
    if (!studyMetadata) return;
    // BYOK: hold off on grounding until the visitor connects their key.
    // Re-runs automatically when byokConnected flips true (see deps).
    if (provider === 'openrouter' && !byokConnected) {
      setSliceAnalysis(null);
      setIsAnalyzing(false);
      return;
    }
    setSliceAnalysis(null);
    setIsAnalyzing(true);

    // Load the overview image for pre-analysis (each domain knows its own image paths)
    const overviewUrl = domain.overviewImage(studyMetadata.studyId);

    fetch(overviewUrl)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          preAnalyzeSlice(
            base64,
            provider,
            domain.key,
            'Whole slide overview',
            studyMetadata.description || ''
          ).then(analysis => {
            if (analysis) {
              setSliceAnalysis(analysis);
              console.log('[Slide Pre-analysis] Grounding context cached:', analysis.substring(0, 120) + '...');
            }
          }).finally(() => setIsAnalyzing(false));
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => setIsAnalyzing(false));
  }, [studyMetadata?.studyId, provider, byokConnected]);

  // Scroll welcome message to top on first render
  const hasScrolledWelcome = useRef(false);
  useEffect(() => {
    if (!hasScrolledWelcome.current && chatContainerRef.current && messages.length === 1 && messages[0].id === 'welcome') {
      chatContainerRef.current.scrollTop = 0;
      hasScrolledWelcome.current = true;
    }
  }, [messages]);

  // Track whether user has interacted during streaming
  const userInteractedRef = useRef(false);

  // Any user interaction inside the chat kills auto-scroll
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const stopAutoScroll = () => {
      userInteractedRef.current = true;
      setIsPinnedToBottom(false);
    };
    el.addEventListener('wheel', stopAutoScroll, { passive: true });
    el.addEventListener('touchstart', stopAutoScroll, { passive: true });
    el.addEventListener('pointerdown', stopAutoScroll);
    return () => {
      el.removeEventListener('wheel', stopAutoScroll);
      el.removeEventListener('touchstart', stopAutoScroll);
      el.removeEventListener('pointerdown', stopAutoScroll);
    };
  }, []);

  // Re-enable auto-scroll when a NEW message starts streaming (user sends a message)
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current && isThinking) {
      userInteractedRef.current = false;
      setIsPinnedToBottom(true);
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, isThinking]);

  // Smart Auto-Scroll Effect
  useEffect(() => {
    if (chatContainerRef.current && isPinnedToBottom && !userInteractedRef.current && messages.length > 1) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isThinking, isPinnedToBottom]);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setIsUserNearBottom(distanceFromBottom < 80);
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
    setIsPinnedToBottom(true);
  };

  // Derived suggestions: Use Dynamic if available, else Static Initial
  const currentSuggestions = dynamicSuggestionsMap
      ? dynamicSuggestionsMap[learnerLevel]
      : domain.getInitialSuggestions(learnerLevel, !!attachedScreenshot, studyMetadata?.studyId);

  const handleCapture = () => {
      onCaptureTrigger();
  };

  const handleClearChat = () => {
    // Abort active request if clearing
    if (activeRequestRef.current) {
      activeRequestRef.current = false;
      setIsThinking(false);
    }

    setMessages([{
      id: 'welcome',
      role: 'model',
      text: domain.welcomeMessage(learnerLevel, studyMetadata?.studyId)
    }]);
    
    onClearCapture();
    setInput('');
    setDynamicSuggestionsMap(null);
    setIsPinnedToBottom(true);
  };

  const handleCancel = () => {
    activeRequestRef.current = false;
    setIsThinking(false);
    
    // Remove the placeholder message (the one with empty text)
    setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'model' && !last.text) {
            return prev.slice(0, -1);
        }
        return prev;
    });
  };

  const handleSendMessage = async (text: string = input, promptOverride?: string) => {
    const finalText = promptOverride || text;
    if ((!finalText.trim() && !attachedScreenshot) || isThinking) return;

    // BYOK gate: if the visitor hasn't connected OpenRouter yet, open the Connect
    // modal instead of erroring — they've already seen the case; this is the ask.
    if (provider === 'openrouter' && !hasKey()) {
      setShowConnectModal(true);
      return;
    }

    // 1. Optimistically Add User Message
    const userMsg: ChatMessage = { 
        id: Date.now().toString(), role: 'user', text: finalText, hasAttachment: !!attachedScreenshot
    };
    setMessages(prev => [...prev, userMsg]);
    setIsPinnedToBottom(true); // Force scroll on new message
    
    // Save current input to restore on error if needed
    const textToRestore = input;
    
    // Clear Input immediately for responsiveness, but we might restore it on error.
    if (!promptOverride) setInput('');
    setIsThinking(true);
    activeRequestRef.current = true;
    // Clear previous AI pointers when starting a new request
    if (onPointers) onPointers([]);
    
    const imageToSend = attachedScreenshot;

    // Build conversation history as context (include welcome message + prior exchanges)
    const historyLines = messages
      .filter(m => m.text) // skip empty thinking placeholders
      .slice(-10) // last 10 messages max to avoid token bloat
      .map(m => m.role === 'user' ? `Student: ${m.text}` : `Tutor: ${m.text}`)
      .join('\n\n');

    let promptToSend = `[CONVERSATION HISTORY]\n${historyLines}\n\n[CURRENT MESSAGE]\nStudent: ${finalText}`;

    // Only mention image context if the student references the image or tries to discuss a specific finding
    if (!imageToSend) {
      promptToSend += '\n\n[NOTE: No image is currently captured. Only ask the student to capture an image if they specifically reference something they see in the viewer. If they are answering a general question or discussing concepts, respond normally without mentioning image capture.]';
    }
    
    // Inject study/series metadata as context for all modes
    if (studyMetadata) {
        const modalityLabel = domain.contextLabel(studyMetadata.modality);
        promptToSend += `\n\n[Study Context: ${modalityLabel}, ${studyMetadata.description}`;
        if (activeSeriesInfo) promptToSend += `, Series: ${activeSeriesInfo.description}`;
        if (capturedSliceInfo) promptToSend += `, Captured: ${capturedSliceInfo.label || 'slice'} ${capturedSliceInfo.slice}/${capturedSliceInfo.total || '?'}`;
        else if (cursor) promptToSend += `, Current frame: ${cursor.frameIndex + 1}`;
        promptToSend += ']';
    }

    // Inject pre-analysis grounding context (prevents hallucination and jailbreaking)
    if (sliceAnalysis) {
        promptToSend += `\n\n[IMAGE PRE-ANALYSIS (ground truth - base your answers on this factual description of what is actually in the image):\n${sliceAnalysis}]`;
    }

    const botMsgId = (Date.now() + 1).toString();
    
    let botMessageExtras = {};
    if (imageToSend) {
       let label = capturedSliceInfo?.label || studyMetadata?.description;
       if (!label || label === "No Description" || label === "OT") {
         label = domain.captureLabel(studyMetadata?.modality || '');
       }

       botMessageExtras = {
          attachedSliceThumbnailDataUrl: imageToSend,
          attachedSliceIndex: capturedSliceInfo?.slice,
          attachedSequenceLabel: label
       };
    }

    // 2. Add "Thinking" Placeholder (Initially empty text triggers thinking bubble)
    setMessages(prev => [...prev, { 
        id: botMsgId, 
        role: 'model', 
        text: '', 
        isThinking: mode === 'deep_think',
        ...botMessageExtras
    }]);

    try {
        let fullText = '';
        await streamChatResponse(
            promptToSend,
            mode,
            learnerLevel,
            imageToSend,
            (chunk, sources, toolCalls, suggestionsPayload, fullTextReplace, pointersPayload) => {
                // Cancellation Check
                if (!activeRequestRef.current) return;

                if (toolCalls && onJumpToSlice) {
                    toolCalls.forEach(call => {
                        if (call.name === 'set_cursor_frame') {
                            const idx = Math.round(call.args.index);
                            if (!isNaN(idx)) onJumpToSlice(idx);
                        }
                    });
                }

                // Handle Inline Suggestions from Stream
                if (suggestionsPayload) {
                    setDynamicSuggestionsMap(suggestionsPayload);
                }

                // Handle AI Pointers (visual indicators on the image)
                if (pointersPayload && onPointers) {
                    onPointers(pointersPayload);
                }

                if (fullTextReplace !== undefined) {
                    fullText = fullTextReplace;
                } else {
                    fullText += chunk;
                }

                setMessages(prev => prev.map(m => m.id === botMsgId ? {
                    ...m,
                    text: fullText,
                    sources: sources || m.sources
                } : m));
            },
            provider,
            domain.key,
            studyMetadata?.studyId
        );
    } catch (error: any) {
        // If cancelled, do not render error
        if (!activeRequestRef.current) return;

        // ERROR HANDLING
        console.error("Chat Error Caught in Component:", error);

        // 1. Remove the placeholder bot message
        setMessages(prev => prev.filter(m => m.id !== botMsgId));
        
        // 2. Restore input if it was typed by user (not a suggestion click)
        if (!promptOverride) {
            setInput(textToRestore);
        }

        // 3. Add Error Message Card
        const errorMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'error',
            text: error.message || "An unexpected error occurred.",
            originalPrompt: finalText // Save for retry
        };
        setMessages(prev => [...prev, errorMessage]);
        setIsPinnedToBottom(true);
    } finally {
        if (activeRequestRef.current) {
            setIsThinking(false);
            activeRequestRef.current = false;
        }
    }
  };

  const getProviderLabel = () => {
      switch(provider) {
          case 'openrouter': return byokModelLabel;
          case 'claude': return 'Claude Opus';
          case 'openai': return 'GPT-5.4 Pro';
          case 'gemini': return 'Gemini Pro';
          default: return provider;
      }
  };

  const getLearnerLevelShortLabel = (id: string) => {
      switch(id) {
          case 'highschool': return "HS";
          case 'undergrad': return "Undergrad";
          case 'ms_preclinical': return "Pre-Step 1";
          case 'ms_clinical': return "Post-Step 1";
          case 'resident': return "Resident";
          default: return "Gen";
      }
  };

  const getLearnerLevelTooltip = (id: string) => {
      switch(id) {
          case 'highschool': return "High school level explanation";
          case 'undergrad': return "Undergraduate biology/pre-med";
          case 'ms_preclinical': return "Pre-clinical medical student (MS1-MS2, Step 1 focus)";
          case 'ms_clinical': return "Clinical medical student (MS3-MS4, Step 2 focus)";
          case 'resident': return "Resident level explanation";
          default: return "";
      }
  };

  const hasCapturedImage = !!attachedScreenshot;

  return (
    <div data-tour-id="ai-panel" className="flex flex-col h-full bg-[#0f1011]">
      {/* Main Header */}
      <div className="h-14 bg-[#161718] border-b border-white/[0.06] px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-[#f7f8f8] font-bold">
          <Sparkles className="w-4 h-4 text-blue-400" /> <span>AI Tutor</span>
          {onStartTour && (
              <button
                  onClick={onStartTour}
                  className="ml-2 text-[10px] text-blue-300 hover:text-white flex items-center gap-1 transition-colors"
                  title="Tour the AI tutor"
              >
                  <HelpCircle className="w-3.5 h-3.5" />
              </button>
          )}
        </div>
        <button
            data-tour-id="ai-trash"
            onClick={handleClearChat}
            className="p-1.5 rounded-lg bg-[#1e1f21] border border-white/[0.08] text-[#8a8f98] hover:text-red-400 hover:border-red-500/50 transition-colors"
            title="Clear Chat / New Conversation"
        >
            <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      {/* Status Bar */}
      <div className="bg-[#161718]/50 border-b border-white/[0.06] p-2 flex items-center justify-between text-[10px] flex-shrink-0">
          <div className="flex items-center gap-2">
              <span data-tour-id="ai-provider" className="text-[10px] text-blue-300/70 font-medium">
                {byokConnected ? `Powered by ${byokModelLabel}` : 'Bring your own AI'}
              </span>
              <button
                onClick={() => setShowConnectModal(true)}
                className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30 hover:border-blue-400/50 bg-blue-500/5 transition-colors"
                title={byokConnected ? 'Change model or disconnect' : 'Connect your OpenRouter account'}
              >
                <KeyRound className="w-2.5 h-2.5" />
                {byokConnected ? 'Change' : 'Connect'}
              </button>
          </div>
          <div className="flex items-center gap-1">
               {attachedScreenshot ? (
                   <span className="flex items-center gap-1 text-emerald-400 font-medium">
                       <ImageIcon className="w-3 h-3" />
                       Active {capturedSliceInfo && `(Slice ${capturedSliceInfo.slice})`}
                       {isAnalyzing && <span className="text-yellow-400 ml-1 animate-pulse">analyzing...</span>}
                       {sliceAnalysis && !isAnalyzing && <span className="text-emerald-500 ml-1">grounded</span>}
                   </span>
               ) : (
                   <span className="flex items-center gap-1 text-[#62666d]">
                       <ImageIcon className="w-3 h-3" />
                       No image context
                   </span>
               )}
          </div>
      </div>

      {/* Messages Container with Independent Scrolling Context */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        <div className="flex-1 relative min-h-0">
            <div 
                className="absolute inset-0 overflow-y-auto p-4 space-y-5 no-scrollbar" 
                ref={chatContainerRef}
                onScroll={handleScroll}
            >
                {messages.map((m) => {
                    if (m.role === 'error') {
                        return (
                            <div key={m.id} className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2">
                                <div className="max-w-[90%] w-full bg-red-950/40 border border-red-500/30 rounded-xl p-3 flex items-start gap-3 shadow-lg">
                                    <div className="mt-0.5 p-1 bg-red-500/10 rounded-full">
                                        <AlertTriangle className="w-4 h-4 text-red-400" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-red-300 mb-1">AI Request Failed</div>
                                        <div className="text-xs text-red-200/80 leading-relaxed mb-2">
                                            {m.text}
                                        </div>
                                        <div className="text-[10px] text-red-400/60 mb-2">
                                            Your question has been preserved above.
                                        </div>
                                        {m.originalPrompt && (
                                            <button 
                                                onClick={() => handleSendMessage(m.originalPrompt)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs rounded-md border border-red-500/20 transition-colors"
                                            >
                                                <RotateCcw className="w-3 h-3" /> Retry Request
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // THINKING BUBBLE (Render if role=model and text is empty)
                    if (m.role === 'model' && !m.text) {
                        let subtitleText = "";
                        const pLabel = getProviderLabel();
                        if (mode === 'deep_think') {
                            subtitleText = `${pLabel} is reasoning step by step before answering.`;
                        } else if (mode === 'search') {
                            subtitleText = `${pLabel} is searching and synthesizing key findings.`;
                        } else {
                            const levelLabels: Record<string, string> = {
                                highschool: "High school",
                                undergrad: "Undergrad",
                                ms_preclinical: "Pre-Step 1",
                                ms_clinical: "Post-Step 1",
                                resident: "Resident"
                            };
                            const label = levelLabels[learnerLevel] || "Med";
                            subtitleText = `${pLabel} is preparing a ${label}-level explanation.`;
                        }

                        return (
                            <div key={m.id} className="flex flex-col items-start animate-in fade-in slide-in-from-bottom-2 duration-300 w-full">
                                <div className="max-w-[95%] rounded-xl p-4 shadow-sm bg-[#161718] border border-white/[0.06]">

                                   {/* Title Row */}
                                   <div className="flex items-center gap-2 mb-2">
                                       <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
                                       <span className="text-blue-100 font-bold text-sm">Teaching in progress</span>
                                   </div>

                                   {/* Subtitle */}
                                   <div className="text-xs text-[#d0d6e0] mb-3 leading-relaxed font-medium">
                                       {subtitleText}
                                   </div>

                                   {/* Status Row */}
                                   <div className="flex items-center gap-2 text-xs text-[#8a8f98]">
                                       <div className="flex space-x-1">
                                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-[bounce_1s_infinite_-0.3s]"></div>
                                            <div className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-[bounce_1s_infinite_-0.15s]"></div>
                                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-[bounce_1s_infinite]"></div>
                                       </div>
                                       <span className="text-blue-200/60">Generating your answer...</span>
                                   </div>
                                </div>
                            </div>
                        );
                    }

                    return (
                    <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[95%] rounded-xl p-3 shadow-sm ${m.role === 'user' ? 'bg-[#1e1f21] text-[#d0d6e0] border-l-2 border-blue-500/30' : 'bg-[#161718] text-[#d0d6e0] border border-white/[0.06]'}`}>
                            
                            {/* New Thumbnail Header for Model */}
                            {m.role === 'model' && m.attachedSliceThumbnailDataUrl && (
                                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/10">
                                    <img 
                                        src={m.attachedSliceThumbnailDataUrl} 
                                        className="w-16 h-16 rounded object-cover border border-white/10 bg-black/50"
                                        alt="Analyzed Slice"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Teaching context</span>
                                        <span className="text-[11px] text-slate-300 font-medium">
                                        Slice {m.attachedSliceIndex ?? '?'} • {m.attachedSequenceLabel || 'Brain MRI series'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {m.hasAttachment && m.role === 'user' && (
                                <div
                                    className="mb-2 text-xs text-blue-300 bg-blue-950/50 px-2 py-1 rounded w-fit flex gap-1 cursor-help"
                                    title="The AI is using the slice you captured for this question."
                                >
                                    <ImageIcon className="w-3 h-3"/> Using captured slice
                                </div>
                            )}
                            
                            <MarkdownText content={m.text} />
                            {m.sources && m.sources.length > 0 && (
                                <div className="mt-3 pt-2 border-t border-white/10">
                                    <div className="text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><Globe className="w-3 h-3"/> Sources</div>
                                    {m.sources.map((src, i) => <a key={i} href={src.uri} target="_blank" className="block text-xs text-blue-400 truncate hover:underline">{src.title || src.uri}</a>)}
                                </div>
                            )}
                        </div>
                    </div>
                )})}

                {!isThinking && currentSuggestions.length > 0 && (
                    <div data-tour-id="ai-suggestions" className="mt-3 animate-in fade-in duration-300">
                        <div className="mb-2 text-[10px] text-slate-500 uppercase font-bold ml-1">
                            Suggested Follow-ups
                        </div>
                        {/* Dynamic Suggestion Chips */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            {currentSuggestions.map((sugg, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleSendMessage(sugg)}
                                    className="text-left text-xs bg-[#1e1f21] hover:bg-[#28282c] text-blue-200 px-3 py-1.5 rounded-full border border-white/[0.08] transition-all active:scale-95"
                                >
                                    {sugg}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Jump To Latest Pill */}
            {!isPinnedToBottom && (
                <button
                    onClick={scrollToBottom}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#1e1f21]/90 hover:bg-[#28282c] text-blue-300 border border-blue-500/30 shadow-lg rounded-full px-4 py-1.5 text-xs font-bold flex items-center gap-2 transition-all animate-in fade-in slide-in-from-bottom-2 z-10 backdrop-blur-sm"
                >
                    <ArrowDown className="w-3.5 h-3.5" />
                    Jump to latest
                </button>
            )}
        </div>

        {/* Capture Toast */}
        {showCaptureToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-900/90 text-emerald-100 px-4 py-2 rounded-full shadow-xl border border-emerald-500/50 flex items-center gap-2 text-xs z-20 animate-in slide-in-from-top-4 fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Captured slice. All AI modes will now see this image.</span>
            </div>
        )}

        <div className="p-4 bg-[#161718] border-t border-white/[0.06] flex-shrink-0">
            {/* Attached Image Preview */}
            {attachedScreenshot && (
                <div className="relative inline-block border border-blue-500 rounded overflow-hidden shadow-lg group mb-3">
                    <img src={attachedScreenshot} alt="Snapshot" className="h-16 w-auto opacity-80 group-hover:opacity-100 transition-opacity" />
                    <button onClick={() => { onClearCapture(); setDynamicSuggestionsMap(null); }} className="absolute top-0 right-0 bg-black/50 hover:bg-red-500 text-white p-0.5"><X className="w-3 h-3" /></button>
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white px-1 text-center truncate">
                        {capturedSliceInfo ? `Slice ${capturedSliceInfo.slice}` : 'Captured'}
                    </div>
                </div>
            )}
            
            {/* Compact Learner Level Row */}
            <div data-tour-id="teaching-levels" className="flex items-center justify-end mb-2 gap-2 text-[11px] text-[#8a8f98]">
                <div className="inline-flex items-center rounded-lg bg-[#0f1011]/50 border border-white/[0.08] p-0.5 gap-0.5">
                    <button type="button" onClick={() => { setLearnerLevel('highschool'); setShowMedPicker(false); }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'highschool' ? 'bg-blue-600 text-white shadow-sm' : 'text-[#8a8f98] hover:bg-[#1e1f21] hover:text-[#d0d6e0]'}`}>
                      HS
                    </button>
                    <button type="button" onClick={() => { setLearnerLevel('undergrad'); setShowMedPicker(false); }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'undergrad' ? 'bg-blue-600 text-white shadow-sm' : 'text-[#8a8f98] hover:bg-[#1e1f21] hover:text-[#d0d6e0]'}`}>
                      Undergrad
                    </button>
                    {/* Med button with popover */}
                    <div className="relative">
                      <button type="button" onClick={() => setShowMedPicker(prev => !prev)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${(learnerLevel === 'ms_preclinical' || learnerLevel === 'ms_clinical') ? 'bg-blue-600 text-white shadow-sm' : 'text-[#8a8f98] hover:bg-[#1e1f21] hover:text-[#d0d6e0]'}`}>
                        Med{(learnerLevel === 'ms_preclinical' || learnerLevel === 'ms_clinical') ? (learnerLevel === 'ms_preclinical' ? ' (Pre)' : ' (Post)') : ''}
                      </button>
                      {showMedPicker && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex gap-1 bg-[#1e1f21] border border-white/[0.12] rounded-lg p-1 shadow-xl z-30 whitespace-nowrap">
                          <button type="button" onClick={() => { setLearnerLevel('ms_preclinical'); setShowMedPicker(false); }}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'ms_preclinical' ? 'bg-blue-600 text-white' : 'text-[#8a8f98] hover:bg-[#2a2d35] hover:text-white'}`}>
                            Pre-Step 1
                          </button>
                          <button type="button" onClick={() => { setLearnerLevel('ms_clinical'); setShowMedPicker(false); }}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'ms_clinical' ? 'bg-blue-600 text-white' : 'text-[#8a8f98] hover:bg-[#2a2d35] hover:text-white'}`}>
                            Post-Step 1
                          </button>
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[#1e1f21]" />
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => { setLearnerLevel('resident'); setShowMedPicker(false); }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${learnerLevel === 'resident' ? 'bg-blue-600 text-white shadow-sm' : 'text-[#8a8f98] hover:bg-[#1e1f21] hover:text-[#d0d6e0]'}`}>
                      Resident
                    </button>
                </div>
            </div>

            {/* Input Area */}
            <div className="relative flex gap-3 items-center">
                <div className="relative group">
                    <button
                        onClick={handleCapture}
                        title="Capture the current slice so the AI can see it."
                        aria-label="Capture current slice as context"
                        className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${
                            attachedScreenshot
                            ? 'bg-blue-900/60 border-blue-500/50 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                            : 'bg-blue-900/40 border-blue-700/50 text-blue-200 hover:bg-blue-800'
                        }`}
                    >
                        <Camera className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="relative flex-1">
                    <input
                        className="w-full bg-[#0f1011] border border-white/[0.08] rounded-lg pr-10 pl-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none text-[#d0d6e0] placeholder:text-[#62666d] shadow-inner" 
                        placeholder={mode === 'deep_think' ? "Ask complex question..." : "Ask a question..."} 
                        value={input} 
                        onChange={(e) => setInput(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} 
                        disabled={isThinking}
                    />
                    <button 
                        onClick={() => handleSendMessage()} 
                        disabled={(!input.trim() && !attachedScreenshot) || isThinking} 
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-500 hover:text-blue-400 disabled:opacity-50 transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Dynamic Status / Hint Footer */}
            <div data-tour-id="image-status" className="mt-2 text-[11px] text-[#8a8f98] leading-tight min-h-[20px] flex items-center justify-between">
                {isThinking ? (
                    <div className="w-full flex items-center justify-between bg-blue-900/10 border border-blue-500/20 rounded-lg px-3 py-2 animate-in fade-in">
                        <div className="flex items-center gap-2.5">
                            <div className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                            </div>
                            <span className="text-blue-200 font-medium">{getProviderLabel()} is thinking... <span className="text-blue-400/70 text-[10px] ml-1">(~10s)</span></span>
                        </div>
                        <button
                            onClick={handleCancel}
                            className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/5 rounded text-[#8a8f98] hover:text-white transition-colors"
                        >
                            <span className="text-[10px] font-bold uppercase tracking-wider">Cancel</span>
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <div className="w-full">
                         {!hasCapturedImage ? (
                            <span>No image attached. Click the camera to capture the current slice before asking image questions.</span>
                        ) : (
                            <span>
                                Using last captured slice: <span className="text-slate-200 font-mono">{capturedSliceInfo?.slice}</span>
                                {capturedSliceInfo?.total && <span className="text-slate-500"> / {capturedSliceInfo.total}</span>}
                                {<span className="text-slate-400"> ({capturedSliceInfo?.label || "MRI series"})</span>}
                                . Click the camera again to update.
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>

      {showConnectModal && <ConnectKeyModal onClose={() => setShowConnectModal(false)} />}
    </div>
  );
};

export default AiAssistantPanel;
