import React from 'react'
import aiVideo from "../assets/videos/female-ai.mp4"
import Timer from './Timer'
import { motion } from "motion/react"
import { FaMicrophone, FaMicrophoneSlash } from "react-icons/fa";
import { useState, useRef, useEffect, useCallback } from 'react'
import axios from "axios"
import { ServerUrl } from '../App'
import { BsArrowRight } from 'react-icons/bs'
import { IoKeypad } from 'react-icons/io5'
import toast from 'react-hot-toast'

function Step2Interview({ interviewData, onFinish }) {
  const { interviewId, questions, userName } = interviewData;
  const [isIntroPhase, setIsIntroPhase] = useState(true);
  // isReadingQuestion blocks the timer while AI speaks the question
  const [isReadingQuestion, setIsReadingQuestion] = useState(false);

  const [isMicOn, setIsMicOn] = useState(true);
  // isMicOnRef mirrors isMicOn — avoids stale closure bug inside speakText callbacks
  const isMicOnRef = useRef(true);
  const recognitionRef = useRef(null);
  const [isAIPlaying, setIsAIPlaying] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitError, setSubmitError] = useState(false); // shows retry button
  const [timeLeft, setTimeLeft] = useState(
    questions[0]?.timeLimit || 60
  );
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTimeUp, setIsTimeUp] = useState(false);

  // Auto-save refs
  const autoSaveIntervalRef = useRef(null);
  const latestAnswerRef = useRef("");

  const videoRef = useRef(null);
  // Chrome TTS keepalive — Chrome silently kills utterances longer than ~15 seconds
  const ttsKeepAliveRef = useRef(null);

  // Groq Whisper audio recording refs
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const currentQuestion = questions[currentIndex];


  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;

      // Try known female voices first
      const femaleVoice =
        voices.find(v =>
          v.name.toLowerCase().includes("zira") ||
          v.name.toLowerCase().includes("samantha") ||
          v.name.toLowerCase().includes("female")
        );

      if (femaleVoice) {
        setSelectedVoice(femaleVoice);
        return;
      }

      // Fallback: first available voice
      setSelectedVoice(voices[0]);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

  }, [])


  /* ----------- BROWSER REFRESH WARNING ----------- */
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!isIntroPhase) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isIntroPhase]);


  /* ---------------- SPEAK FUNCTION ---------------- */
  const speakText = (text) => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis || !selectedVoice) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();
      clearInterval(ttsKeepAliveRef.current);

      const humanText = text
        .replace(/,/g, ", ... ")
        .replace(/\./g, ". ... ");

      const utterance = new SpeechSynthesisUtterance(humanText);
      utterance.voice = selectedVoice;
      utterance.rate = 0.92;
      utterance.pitch = 1.05;
      utterance.volume = 1;

      const cleanupAndResolve = () => {
        clearInterval(ttsKeepAliveRef.current);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        }
        setIsAIPlaying(false);
        // Use ref — not state — so we always have the current mic toggle value
        if (isMicOnRef.current) startMic();
        setTimeout(() => { setSubtitle(""); resolve(); }, 300);
      };

      utterance.onstart = () => {
        setIsAIPlaying(true);
        stopMic();
        videoRef.current?.play();
        // Chrome bug: utterances >~15s are silently killed. Pause/resume every 10s to reset the timer.
        ttsKeepAliveRef.current = setInterval(() => {
          if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        }, 10000);
      };

      utterance.onend = cleanupAndResolve;

      // BUG FIX: Without onerror, a TTS crash leaves the interview completely frozen.
      // This handler ensures we always resolve the promise and restore mic state.
      utterance.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') {
          // These are expected when cancel() is called; don't restore mic for these
          clearInterval(ttsKeepAliveRef.current);
          return;
        }
        console.warn('TTS error:', e.error);
        cleanupAndResolve();
      };

      setSubtitle(text);
      window.speechSynthesis.speak(utterance);
    });
  };


  useEffect(() => {
    if (!selectedVoice) {
      return;
    }
    const runIntro = async () => {
      if (isIntroPhase) {
        await speakText(
          `Hi ${userName}, it's great to meet you today. I hope you're feeling confident and ready.`
        );

        await speakText(
          "I'll ask you a few questions. Just answer naturally, and take your time. Let's begin."
        );

        setIsIntroPhase(false)
      } else if (currentQuestion) {
        await new Promise(r => setTimeout(r, 800));

        // Block timer while AI reads the question aloud
        setIsReadingQuestion(true);

        if (currentIndex === questions.length - 1) {
          await speakText("Alright, this one might be a bit more challenging.");
        }

        await speakText(currentQuestion.question);

        // Timer may now start — AI is done reading
        setIsReadingQuestion(false);

        // isMicOnRef is always fresh — no stale closure risk
        if (isMicOnRef.current) startMic();
      }

    }

    runIntro()

  }, [selectedVoice, isIntroPhase, currentIndex])



  // BUG FIX: Timer previously started between setCurrentIndex() and utterance.onstart,
  // silently eating 1-2 seconds before AI even began reading. isReadingQuestion blocks it.
  useEffect(() => {
    if (isIntroPhase) return;
    if (!currentQuestion) return;
    if (isAIPlaying || isReadingQuestion) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isIntroPhase, currentIndex, isAIPlaying, isReadingQuestion]);

  useEffect(() => {
    if (!isIntroPhase && currentQuestion) {
      setTimeLeft(currentQuestion.timeLimit || 60);
      setIsReadingQuestion(false);
    }
  }, [currentIndex, isIntroPhase]);


  // Browser speech recognition (live preview only — accumulates interim + final results)
  useEffect(() => {
    if (!("webkitSpeechRecognition" in window)) return;

    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true; // capture partial speech so nothing is missed

    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        }
      }

      if (finalTranscript.trim()) {
        setAnswer((prev) => {
          // Only append from browser STT when Groq hasn't taken over yet
          if (accumulatedGroqRef.current.trim()) return prev; // Groq is driving
          const updated = prev + " " + finalTranscript.trim();
          latestAnswerRef.current = updated;
          return updated;
        });
      }
    };

    recognitionRef.current = recognition;

  }, []);


  /* ----------- MEDIA RECORDER (Groq Whisper — single transcription call on submit) ----------- */
  const startRecording = async () => {
    try {
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      // Resume a paused recorder — preserves all existing audio chunks
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.resume();
        return;
      }

      // Already recording — nothing to do
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        return;
      }

      // Create a fresh recorder (chunks were cleared by the caller for a new question)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      // 250ms timeslice: frequent data events so no audio is lost even on abrupt stop
      recorder.start(250);
      mediaRecorderRef.current = recorder;
    } catch (err) {
      console.error('MediaRecorder start error:', err);
    }
  };

  // Pause recording — keeps all accumulated chunks intact
  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
  };

  // Fully stop recording (used only on submit or question transition)
  const stopRecording = () => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve();
        return;
      }
      mediaRecorderRef.current.onstop = () => resolve();
      mediaRecorderRef.current.stop();
    });
  };

  const getAudioBlob = () => {
    if (audioChunksRef.current.length === 0) return null;
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
    return new Blob(audioChunksRef.current, { type: mimeType });
  };

  const transcribeWithGroq = async (blob) => {
    const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
    const formData = new FormData();
    formData.append('audio', blob, `answer.${ext}`);

    const result = await axios.post(
      ServerUrl + '/api/interview/transcribe',
      formData,
      { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return result.data.transcript;
  };


  /* ----------- MIC CONTROLS ----------- */
  const startMic = async () => {
    // Start browser STT for live preview
    if (recognitionRef.current && !isAIPlaying) {
      try { recognitionRef.current.start(); } catch { }
    }
    // Resume paused recorder or start fresh — never clears existing chunks mid-question
    await startRecording();
  };

  const stopMic = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    // PAUSE (not stop) — all accumulated audio chunks are preserved
    pauseRecording();
  };

  const toggleMic = useCallback(() => {
    const next = !isMicOnRef.current;
    isMicOnRef.current = next;   // update ref first — callbacks read the ref, not state
    if (!next) {
      stopMic();
    } else {
      startMic();
    }
    setIsMicOn(next);
  }, [isMicOn]);


  const submitAnswer = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(false);

    // Fully stop recording to flush all buffered audio data
    if (recognitionRef.current) recognitionRef.current.stop();
    await stopRecording();

    try {
      let finalAnswer = answer; // browser STT text as fallback
      const audioBlob = getAudioBlob(); // full answer audio — entire question duration

      // Single Groq Whisper call with the complete answer audio
      if (audioBlob && audioBlob.size > 1000) {
        setIsTranscribing(true);
        try {
          const groqTranscript = await transcribeWithGroq(audioBlob);
          if (groqTranscript && groqTranscript.trim().length > 0) {
            finalAnswer = groqTranscript.trim();
          }
        } catch (err) {
          console.error('Groq transcription failed, using browser STT fallback:', err);
        }
        setIsTranscribing(false);
      }

      setAnswer(finalAnswer);

      const result = await axios.post(ServerUrl + "/api/interview/submit-answer", {
        interviewId,
        questionIndex: currentIndex,
        answer: finalAnswer,
        timeTaken: currentQuestion.timeLimit - timeLeft,
      }, { withCredentials: true });

      setFeedback(result.data.feedback);
      speakText(result.data.feedback);
      setIsSubmitting(false);
    } catch (error) {
      console.error(error);
      setSubmitError(true);    // show retry button instead of losing the answer
      setIsSubmitting(false);
      setIsTranscribing(false);
      toast.error("Submission failed. Your answer is saved — tap Retry.");
    }
  }

  const handleNext = async () => {
    setAnswer("");
    setFeedback("");
    setSubmitError(false);
    latestAnswerRef.current = "";

    // Fully stop recorder and clear chunks — fresh recording session for next question
    await stopRecording();
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;

    if (currentIndex + 1 >= questions.length) {
      finishInterview();
      return;
    }

    await speakText("Alright, let's move to the next question.");
    setCurrentIndex(prev => prev + 1);
  }

  const finishInterview = async () => {
    await stopMic();
    setIsMicOn(false)
    try {
      const result = await axios.post(ServerUrl+ "/api/interview/finish" , { interviewId} , {withCredentials:true})

      console.log(result.data)
      onFinish(result.data)
    } catch (error) {
      console.log(error)
      toast.error("Failed to finish interview. Please try again.");
    }
  }


  /* ----------- DRAFT SAVE (browser STT text only — no Groq call during the interview) ----------- */
  const saveDraftToServer = async (text) => {
    try {
      await axios.post(ServerUrl + "/api/interview/save-draft", {
        interviewId,
        questionIndex: currentIndex,
        answer: text,
      }, { withCredentials: true });
    } catch (err) {
      console.error("Draft save failed:", err);
    }
  };

  // Every 15 seconds, persist the browser STT preview text as a draft.
  // Groq is NOT called here — it runs exactly once on submit with the full audio blob.
  useEffect(() => {
    if (isIntroPhase || !currentQuestion || isTimeUp || feedback) {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
      return;
    }

    autoSaveIntervalRef.current = setInterval(() => {
      if (!isAIPlaying && !isSubmitting && latestAnswerRef.current.trim()) {
        saveDraftToServer(latestAnswerRef.current.trim());
      }
    }, 15000);

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
    };
  }, [isIntroPhase, currentIndex, isTimeUp, feedback]);


  /* ----------- TIMER EXPIRY: final transcribe + submit ----------- */
  useEffect(() => {
    if (isIntroPhase) return;
    if (!currentQuestion) return;

    if (timeLeft === 0 && !isSubmitting && !feedback) {
      setIsTimeUp(true);
      // Clear auto-save interval immediately
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
      submitAnswer();
    }
  }, [timeLeft]);

  // Reset per-question state when index changes
  useEffect(() => {
    setIsTimeUp(false);
    setSubmitError(false);
  }, [currentIndex]);

  /* ----------- KEYBOARD SHORTCUT: Space toggles mic when not typing ----------- */
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.code === 'Space' &&
        e.target.tagName !== 'TEXTAREA' &&
        e.target.tagName !== 'INPUT' &&
        !isIntroPhase && !feedback && !isSubmitting && !isTranscribing
      ) {
        e.preventDefault();
        toggleMic();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isIntroPhase, feedback, isSubmitting, isTranscribing, toggleMic]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
      window.speechSynthesis.cancel();
      clearInterval(ttsKeepAliveRef.current);
      clearInterval(autoSaveIntervalRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (mediaRecorderRef.current &&
          (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);







  // Word count derived from answer state
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  return (
    <div className='min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-100 flex items-center justify-center p-4 sm:p-6'>
      <div className='w-full max-w-7xl min-h-[80vh] bg-white rounded-3xl shadow-2xl border border-gray-200 flex flex-col lg:flex-row overflow-hidden'>

        {/* ── LEFT: Video + Status Panel ── */}
        <div className='w-full lg:w-[34%] bg-white flex flex-col items-center p-6 space-y-5 border-r border-gray-100'>

          {/* AI video */}
          <div className='w-full max-w-sm rounded-2xl overflow-hidden shadow-xl relative'>
            <video
              src={aiVideo}
              key="ai-video"
              ref={videoRef}
              muted
              playsInline
              preload="auto"
              className="w-full h-auto object-cover"
            />
            {/* AI speaking badge */}
            {isAIPlaying && (
              <div className='absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1 rounded-full flex items-center gap-1.5 backdrop-blur-sm'>
                <span className='w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse'></span>
                AI Speaking
              </div>
            )}
          </div>

          {/* Subtitle box */}
          {subtitle && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className='w-full max-w-sm bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-sm'
            >
              <p className='text-gray-700 text-sm font-medium text-center leading-relaxed italic'>"{subtitle}"</p>
            </motion.div>
          )}

          {/* Status / Timer card */}
          <div className='w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-md p-5 space-y-4'>

            {/* Question progress dots */}
            <div className='flex justify-center gap-2 flex-wrap'>
              {questions.map((_, i) => (
                <div
                  key={i}
                  title={`Question ${i + 1} — ${questions[i].difficulty}`}
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                    i < currentIndex
                      ? 'bg-emerald-500 scale-90'
                      : i === currentIndex
                      ? 'bg-emerald-600 scale-125 ring-2 ring-emerald-300'
                      : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>

            <div className='h-px bg-gray-100'></div>

            {/* Timer */}
            <div className='flex flex-col items-center gap-1'>
              <Timer timeLeft={timeLeft} totalTime={currentQuestion?.timeLimit} />
              {isReadingQuestion && (
                <p className='text-xs text-gray-400 animate-pulse'>Timer starts after question</p>
              )}
            </div>

            <div className='h-px bg-gray-100'></div>

            {/* Stats row */}
            <div className='grid grid-cols-2 gap-4 text-center'>
              <div>
                <p className='text-xl font-bold text-emerald-600'>{currentIndex + 1}</p>
                <p className='text-xs text-gray-400'>Current</p>
              </div>
              <div>
                <p className='text-xl font-bold text-gray-700'>{questions.length}</p>
                <p className='text-xs text-gray-400'>Total</p>
              </div>
            </div>

            {/* Difficulty badge */}
            {currentQuestion && (
              <div className='flex justify-center'>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                  currentQuestion.difficulty === 'hard'
                    ? 'bg-red-100 text-red-600'
                    : currentQuestion.difficulty === 'medium'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {currentQuestion.difficulty?.toUpperCase()} · {currentQuestion.timeLimit}s
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Interview Panel ── */}
        <div className='flex-1 flex flex-col p-4 sm:p-6 md:p-8'>

          {/* Header */}
          <div className='flex items-center justify-between mb-5'>
            <h2 className='text-xl sm:text-2xl font-bold text-emerald-600'>AI Smart Interview</h2>
            {!isIntroPhase && !feedback && (
              <span className='text-xs text-gray-400 hidden sm:block'>
                <kbd className='bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-gray-500 font-mono'>Space</kbd> to toggle mic
              </span>
            )}
          </div>

          {/* Question box */}
          {!isIntroPhase && (
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35 }}
              className='mb-5 bg-gray-50 p-4 sm:p-5 rounded-2xl border border-gray-200 shadow-sm'
            >
              <p className='text-xs text-gray-400 mb-1.5'>Question {currentIndex + 1} of {questions.length}</p>
              <p className='text-base sm:text-lg font-semibold text-gray-800 leading-relaxed'>
                {currentQuestion?.question}
              </p>
            </motion.div>
          )}

          {/* Recording indicator — animated bars */}
          {isMicOn && !isAIPlaying && !feedback && !isIntroPhase && (
            <div className='flex items-center gap-2.5 mb-3 px-1'>
              <div className='flex items-end gap-0.5 h-4'>
                {[1, 1.6, 0.8, 1.3, 0.6].map((h, i) => (
                  <span
                    key={i}
                    className='w-1 bg-red-500 rounded-full'
                    style={{
                      height: `${h * 8}px`,
                      animation: `pulse 0.8s ease-in-out ${i * 0.12}s infinite alternate`,
                      animationName: 'barBounce',
                    }}
                  />
                ))}
              </div>
              <span className='text-xs text-gray-500 font-medium'>Recording • Groq Whisper transcribes on submit</span>
            </div>
          )}

          {/* Answer textarea */}
          <textarea
            id="answer-textarea"
            placeholder={isIntroPhase
              ? "Interview will begin shortly..."
              : "Your speech will appear here as you speak..."
            }
            onChange={(e) => {
              setAnswer(e.target.value);
              latestAnswerRef.current = e.target.value;
            }}
            value={answer}
            disabled={(isTimeUp && !feedback) || isIntroPhase}
            className={`flex-1 min-h-[140px] bg-gray-50 p-4 sm:p-5 rounded-2xl resize-none outline-none border transition text-gray-800 text-sm leading-relaxed ${
              isTimeUp && !feedback
                ? 'opacity-50 cursor-not-allowed border-gray-200'
                : 'border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100'
            }`}
          />

          {/* Word count */}
          {!isIntroPhase && !feedback && (
            <p className='text-right text-xs text-gray-400 mt-1 pr-1'>
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </p>
          )}

          {/* Bottom action area */}
          <div className='mt-4'>
            {(isSubmitting || isTranscribing) && !feedback ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className='bg-amber-50 border border-amber-200 p-5 rounded-2xl shadow-sm'
              >
                <div className='flex items-center gap-3 mb-1.5'>
                  <div className='flex gap-1'>
                    {[0, 150, 300].map(d => (
                      <span key={d} className='w-2 h-2 bg-amber-500 rounded-full animate-bounce' style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                  <p className='text-amber-700 font-medium text-sm'>
                    {isTranscribing ? 'Transcribing your full answer with Groq Whisper…' : 'AI is evaluating your answer…'}
                  </p>
                </div>
                <p className='text-amber-500 text-xs pl-7'>This usually takes 3–8 seconds</p>
              </motion.div>

            ) : submitError ? (
              /* Retry button — answer is preserved, user doesn't lose their work */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className='bg-red-50 border border-red-200 p-5 rounded-2xl'
              >
                <p className='text-red-700 font-medium text-sm mb-3'>⚠️ Submission failed — your answer is safe. Try again.</p>
                <button
                  onClick={submitAnswer}
                  className='w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-semibold transition'
                >
                  Retry Submission
                </button>
              </motion.div>

            ) : feedback ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className='bg-emerald-50 border border-emerald-200 p-5 rounded-2xl shadow-sm'
              >
                <p className='text-emerald-700 font-semibold text-sm mb-1'>AI Feedback</p>
                <p className='text-gray-700 text-sm leading-relaxed mb-4'>{feedback}</p>
                <button
                  onClick={handleNext}
                  className='w-full bg-gradient-to-r from-emerald-600 to-teal-500 text-white py-3 rounded-xl shadow-md hover:opacity-90 transition flex items-center justify-center gap-2 font-semibold'
                >
                  {currentIndex + 1 >= questions.length ? 'View Report' : 'Next Question'}
                  <BsArrowRight size={18} />
                </button>
              </motion.div>

            ) : (
              <div className='flex items-center gap-3'>
                <motion.button
                  onClick={toggleMic}
                  whileTap={{ scale: 0.88 }}
                  title={isMicOn ? 'Mute mic (Space)' : 'Unmute mic (Space)'}
                  className={`w-13 h-13 sm:w-14 sm:h-14 flex-shrink-0 flex items-center justify-center rounded-full shadow-lg transition-colors ${
                    isMicOn ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isMicOn ? <FaMicrophone size={20} /> : <FaMicrophoneSlash size={20} />}
                </motion.button>

                <motion.button
                  onClick={submitAnswer}
                  disabled={isSubmitting || isTranscribing}
                  whileTap={{ scale: 0.96 }}
                  className='flex-1 bg-gradient-to-r from-emerald-600 to-teal-500 text-white py-3.5 rounded-2xl shadow-lg hover:opacity-90 active:scale-95 transition font-semibold disabled:opacity-60 disabled:cursor-not-allowed'
                >
                  Submit Answer
                </motion.button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Animated bars keyframes */}
      <style>{`
        @keyframes barBounce {
          from { transform: scaleY(0.4); opacity: 0.7; }
          to   { transform: scaleY(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default Step2Interview;
