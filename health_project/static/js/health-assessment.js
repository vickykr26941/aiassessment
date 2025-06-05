// # ===========================================
// # static/js/health-assessment.js
// # ===========================================
const { useState, useEffect, useRef } = React;

// Configuration
const API_BASE_URL = '/api';

// Main App Component
const HealthAssessmentApp = () => {
    const [currentStep, setCurrentStep] = useState('start');
    const [assessment, setAssessment] = useState(null);
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [currentAnswer, setCurrentAnswer] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [treatmentPlan, setTreatmentPlan] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [voiceFeedback, setVoiceFeedback] = useState('');

    const speechRecognition = useRef(null);
    const [concern, setConcern] = useState('');


    // text-to-speech setups
    const speechSynthesis = useRef(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const currentInputSetterRef = useRef(() => { });

    // Initialize speech recognition
    useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();

            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                setIsRecording(true);
                setVoiceFeedback('🎤 Listening... Please speak clearly');
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                // setCurrentAnswer(transcript);
                // currentInputSetterRef.current(transcript);
                currentInputSetterRef.current(prev => prev + ' ' + transcript);
                setVoiceFeedback(`✓ Heard: "${transcript}"`);
            };

            recognition.onerror = (event) => {
                setError(`Voice recognition error: ${event.error}`);
                setVoiceFeedback('❌ Voice recognition failed. Please try again.');
            };

            recognition.onend = () => {
                setIsRecording(false);
            };

            speechRecognition.current = recognition;
        }

        if ('speechSynthesis' in window) {
            speechSynthesis.current = window.speechSynthesis;
        }
    }, []);

    // Speec to text function
    const speak = (text, callback = null) => {
        if (!speechSynthesis.current) {
            console.warn('Speech synthesis not supported');
            return;
        }
        speechSynthesis.current.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
            setIsSpeaking(false);
            if (callback) callback();
        };
        utterance.onerror = () => setIsSpeaking(false);

        speechSynthesis.current.speak(utterance);
    };


    // API calls
    const apiCall = async (endpoint, options = {}) => {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]')?.value || '',
                    ...options.headers,
                },
                ...options,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    };

    const startAssessment = async (initialConcern) => {
        setLoading(true);
        setError('');

        try {
            const response = await apiCall('/assessment/start/', {
                method: 'POST',
                body: JSON.stringify({
                    initial_concern: initialConcern
                })
            });

            setAssessment({
                id: response.assessment_id,
                sessionId: response.session_id,
                initialConcern: initialConcern
            });

            setQuestions(response.questions);
            setCurrentQuestion(response.questions[0]);
            setCurrentStep('assessment');

            setTimeout(() => {
                speak(`Question 1: ${response.questions[0].question_text}`);
            }, 1000);
        } catch (error) {
            setError(`Failed to start assessment: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const submitAnswer = async () => {
        if (!currentAnswer.trim()) {
            setError('Please provide an answer before continuing');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await apiCall('/answer/submit/', {
                method: 'POST',
                body: JSON.stringify({
                    question_id: currentQuestion.id,
                    answer_text: currentAnswer
                })
            });

            setAnswers(prev => ({
                ...prev,
                [currentQuestion.id]: currentAnswer
            }));

            setQuestions(prev => prev.map(q =>
                q.id === currentQuestion.id
                    ? { ...q, is_answered: true, answer: currentAnswer }
                    : q
            ));

            if (response.next_question) {
                const newQuestion = {
                    id: response.next_question.id,
                    question_text: response.next_question.text,
                    question_order: questions.length + 1,
                    is_answered: false
                };

                setQuestions(prev => [...prev, newQuestion]);
                setCurrentQuestion(newQuestion);

                setTimeout(() => {
                    speak(`Question ${newQuestion.question_order}: ${newQuestion.question_text}`);
                }, 1500);
            } else {
                const nextUnanswered = questions.find(q => !q.is_answered && q.id !== currentQuestion.id);
                // setCurrentQuestion(nextUnanswered || null);
                if (nextUnanswered) {
                    setCurrentQuestion(nextUnanswered);
                    // Auto-speak next question
                    setTimeout(() => {
                        speak(`Question ${nextUnanswered.question_order}: ${nextUnanswered.question_text}`);
                    }, 1500);
                } else {
                    setCurrentQuestion(null);
                }
            }

            setCurrentAnswer('');
            setVoiceFeedback('');
        } catch (error) {
            setError(`Failed to submit answer: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const generateTreatmentPlan = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await apiCall(`/treatment-plan/${assessment.id}/`, {
                method: 'POST'
            });

            setTreatmentPlan(response.treatment_plan);
            setCurrentStep('treatment');
        } catch (error) {
            setError(`Failed to generate treatment plan: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const startVoiceRecognition = () => {
        if (!speechRecognition.current) {
            setError('Voice recognition is not supported in your browser');
            return;
        }

        if (isRecording) {
            speechRecognition.current.stop();
        } else {
            speechRecognition.current.start();
        }
    };

    // Components
    const StartScreen = () => {
        // FIXED: Set voice-to-text handler for initial concern
        useEffect(() => {
            currentInputSetterRef.current = setConcern;
        }, []);
        // useEffect(() => {
        //     const timer = setTimeout(() => {
        //         speak("Welcome to Health AI Assessment. How are you feeling today? Please tell us what's troubling you.");
        //     }, 800);
        //     return () => clearTimeout(timer); 
        // }, []);

        return (
            <div className="max-w-4xl mx-auto p-6 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 min-h-screen">
                {/* Header Section */}
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center mb-4">
                        <div className="p-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full shadow-lg">
                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                    </div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                        Health Assist
                    </h1>
                    <p className="text-gray-600 text-lg">
                        Tell us about your health concerns and let our AI guide you through a comprehensive evaluation
                    </p>
                </div>

                {/* Main Assessment Card */}
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
                    {/* Card Header */}
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6">
                        <h2 className="text-2xl font-bold text-white text-center">
                            Health Concern Assessment
                        </h2>
                        <p className="text-purple-100 text-center mt-2">
                            Share your symptoms and concerns with us
                        </p>
                    </div>

                    {/* Card Content */}
                    <div className="p-8">
                        {/* Input Section */}
                        <div className="mb-8">
                            <label className="block text-gray-800 font-semibold mb-4 text-lg flex items-center">
                                <div className="w-2 h-2 bg-purple-500 rounded-full mr-3"></div>
                                How are you feeling today? Please describe your health concerns.
                            </label>

                            <div className="relative">
                                <div className="flex gap-4">
                                    <div className="flex-1 relative">
                                        <textarea
                                            className="w-full p-5 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition-all duration-300 resize-none bg-gray-50/50 hover:bg-white focus:bg-white shadow-sm"
                                            value={concern}
                                            onChange={(e) => setConcern(e.target.value)}
                                            placeholder="Describe your symptoms, pain, or health concerns in detail. Be as specific as possible to help us provide better guidance..."
                                            rows="5"
                                        />
                                        <div className="absolute bottom-3 right-3 text-xs text-gray-400">
                                            {concern.length}/500
                                        </div>
                                    </div>

                                    {/* Voice Input Button */}
                                    <button
                                        className={`px-6 py-4 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center min-w-[120px] shadow-lg ${isRecording
                                            ? 'bg-gradient-to-r from-red-500 to-red-600 text-white animate-pulse shadow-red-200'
                                            : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 hover:scale-105 hover:shadow-xl'
                                            }`}
                                        onClick={startVoiceRecognition}
                                    >
                                        {isRecording ? (
                                            <>
                                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                                Stop
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                                </svg>
                                                Voice
                                            </>
                                        )}
                                    </button>
                                </div>

                                {/* Voice Feedback */}
                                {voiceFeedback && (
                                    <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
                                        <div className="flex items-center">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full mr-3 animate-pulse"></div>
                                            <span className="text-blue-700 font-medium">{voiceFeedback}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Quick Tips */}
                        <div className="mb-8 p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
                            <h3 className="font-semibold text-green-800 mb-3 flex items-center">
                                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                                Quick Tips for Better Assessment
                            </h3>
                            <div className="grid md:grid-cols-2 gap-3 text-sm text-green-700">
                                <div className="flex items-start">
                                    <div className="w-1 h-1 bg-green-400 rounded-full mr-2 mt-2"></div>
                                    <span>Include when symptoms started</span>
                                </div>
                                <div className="flex items-start">
                                    <div className="w-1 h-1 bg-green-400 rounded-full mr-2 mt-2"></div>
                                    <span>Describe pain level (1-10)</span>
                                </div>
                                <div className="flex items-start">
                                    <div className="w-1 h-1 bg-green-400 rounded-full mr-2 mt-2"></div>
                                    <span>Mention any triggers</span>
                                </div>
                                <div className="flex items-start">
                                    <div className="w-1 h-1 bg-green-400 rounded-full mr-2 mt-2"></div>
                                    <span>Note related symptoms</span>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-4">
                            <button
                                className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl"
                                onClick={() => startAssessment(concern)}
                                disabled={!concern.trim() || loading}
                            >
                                {loading ? (
                                    <div className="flex items-center justify-center gap-3">
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Starting Assessment...
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-3">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Start Health Assessment
                                    </div>
                                )}
                            </button>

                            <button
                                className="px-6 py-4 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:border-gray-400 hover:bg-gray-50 transition-all duration-300 flex items-center gap-2"
                                onClick={() => {
                                    setConcern('');
                                    setVoiceFeedback('');
                                    setIsRecording(false);
                                }}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Clear
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 text-center">
                    <p className="text-gray-500 text-sm">
                        🔒 Your health information is secure and confidential
                    </p>
                </div>
            </div>
        );
    };

    const AssessmentScreen = () => {
        const answeredCount = questions.filter(q => q.is_answered).length;
        const totalQuestions = questions.length;
        const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
        const canFinish = answeredCount >= 3;

        useEffect(() => {
            currentInputSetterRef.current = setCurrentAnswer;
        }, []);

        return (
            <div className="max-w-4xl mx-auto p-6 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 min-h-screen">
                <div className="space-y-6">
                    {/* Progress Bar */}
                    <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-white/20">
                        <div className="w-full bg-gray-200 rounded-full h-3 mb-4 overflow-hidden">
                            <div
                                className="bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600 h-3 rounded-full transition-all duration-500 shadow-sm"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        <p className="text-center text-gray-700 font-semibold">
                            Question {answeredCount + 1} of {totalQuestions}
                            {canFinish && (
                                <span className="text-green-600 ml-2">
                                    <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    You can finish anytime now
                                </span>
                            )}
                        </p>
                    </div>

                    {/* Current Question */}
                    {currentQuestion && (
                        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
                            {/* Question Header */}
                            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 bg-white/20 backdrop-blur-sm text-white rounded-full flex items-center justify-center font-bold text-lg border border-white/30 ${isSpeaking ? 'animate-pulse' : ''}`}>
                                        {isSpeaking ? (
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                            </svg>
                                        ) : (
                                            currentQuestion.question_order
                                        )}
                                    </div>
                                    <h3 className="text-xl font-semibold text-white flex-1">
                                        {currentQuestion.question_text}
                                    </h3>
                                    <button
                                        onClick={() => speak(`Question ${currentQuestion.question_order}: ${currentQuestion.question_text}`)}
                                        className="text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-all duration-300"
                                        title="Repeat question"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Question Content */}
                            <div className="p-8">
                                <div className="space-y-4">
                                    <div className="flex gap-4">
                                        <div className="flex-1 relative">
                                            <textarea
                                                className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition-all duration-300 resize-none bg-gray-50/50 hover:bg-white focus:bg-white shadow-sm"
                                                value={currentAnswer}
                                                onChange={(e) => setCurrentAnswer(e.target.value)}
                                                placeholder="Type your answer here or use voice input..."
                                                rows="3"
                                            />
                                        </div>
                                        <button
                                            className={`px-6 py-4 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 min-w-[120px] justify-center shadow-lg ${isRecording
                                                    ? 'bg-gradient-to-r from-red-500 to-red-600 text-white animate-pulse shadow-red-200'
                                                    : 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 hover:scale-105 hover:shadow-xl'
                                                }`}
                                            onClick={startVoiceRecognition}
                                        >
                                            {isRecording ? (
                                                <>
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" />
                                                    </svg>
                                                    Stop
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                                    </svg>
                                                    Voice
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {voiceFeedback && (
                                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4 rounded-lg">
                                            <div className="flex items-center">
                                                <div className="w-2 h-2 bg-blue-500 rounded-full mr-3 animate-pulse"></div>
                                                <span className="text-blue-700 font-medium text-sm italic">{voiceFeedback}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button
                                        className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-3 px-6 rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
                                        onClick={submitAnswer}
                                        disabled={!currentAnswer.trim() || loading}
                                    >
                                        {loading ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                Submitting...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                                </svg>
                                                Next Question
                                            </>
                                        )}
                                    </button>

                                    {canFinish && (
                                        <button
                                            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 px-6 rounded-xl font-semibold transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-60 flex items-center gap-2 shadow-lg hover:shadow-xl"
                                            onClick={generateTreatmentPlan}
                                            disabled={loading}
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            Finish
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Assessment Complete */}
                    {!currentQuestion && canFinish && (
                        <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-8 shadow-2xl text-center border border-white/20">
                            <div className="text-6xl mb-4">🎉</div>
                            <h3 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-4">
                                Assessment Complete!
                            </h3>
                            <p className="text-gray-600 mb-6 text-lg">
                                You've answered all the questions. Ready to get your personalized treatment plan?
                            </p>
                            <button
                                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-4 px-8 rounded-xl font-semibold transform hover:scale-105 transition-all duration-300 disabled:opacity-60 flex items-center gap-3 mx-auto shadow-lg hover:shadow-xl"
                                onClick={generateTreatmentPlan}
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Generating Treatment Plan...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Get Treatment Plan
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Previous Answers */}
                    {answeredCount > 0 && (
                        <div className="bg-gradient-to-br from-gray-50/90 to-white/90 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-gray-200/50">
                            <h3 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-3">
                                <div className="p-2 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                Your Previous Answers
                            </h3>
                            <div className="space-y-4">
                                {questions.filter(q => q.is_answered).map((question) => (
                                    <div key={question.id} className="bg-white/80 p-5 rounded-xl border-l-4 border-purple-500 shadow-sm hover:shadow-md transition-all duration-300">
                                        <div className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                            <div className="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">
                                                {question.question_order}
                                            </div>
                                            {question.question_text}
                                        </div>
                                        <div className="text-gray-600 italic pl-8 bg-gray-50/50 p-3 rounded-lg">
                                            <strong className="text-gray-700 not-italic">A:</strong> {answers[question.id]}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const TreatmentScreen = () => {
        if (!treatmentPlan) return null;

        return (
            <div className="bg-white/95 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/20">
                <div className="text-center mb-8">
                    <div className="text-6xl mb-4">📋</div>
                    <h2 className="text-3xl font-bold text-green-600 mb-2">
                        Your Treatment Plan
                    </h2>
                    <p className="text-gray-600">AI-powered personalized health recommendations</p>
                </div>

                <div className="space-y-8">
                    {/* Diagnosis */}
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-200">
                        <h3 className="text-xl font-semibold text-green-800 mb-3 flex items-center gap-2">
                            <i className="fas fa-stethoscope"></i>
                            Diagnosis
                        </h3>
                        <p className="text-gray-700 leading-relaxed bg-white p-4 rounded-xl">
                            {treatmentPlan.diagnosis}
                        </p>
                    </div>

                    {/* Recommendations */}
                    {treatmentPlan.recommendations && treatmentPlan.recommendations.length > 0 && (
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-200">
                            <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center gap-2">
                                <i className="fas fa-clipboard-list"></i>
                                Recommendations
                            </h3>
                            <div className="space-y-3">
                                {treatmentPlan.recommendations.map((rec, index) => (
                                    <div key={index} className="bg-white p-4 rounded-xl border-l-4 border-blue-500 flex items-start gap-3">
                                        <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-0.5">
                                            {index + 1}
                                        </div>
                                        <p className="text-gray-700 flex-1">{rec}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Medications */}
                    {treatmentPlan.medications && treatmentPlan.medications.length > 0 && (
                        <div className="bg-gradient-to-r from-purple-50 to-violet-50 p-6 rounded-2xl border border-purple-200">
                            <h3 className="text-xl font-semibold text-purple-800 mb-4 flex items-center gap-2">
                                <i className="fas fa-pills"></i>
                                Medications
                            </h3>
                            <div className="space-y-3">
                                {treatmentPlan.medications.map((med, index) => (
                                    <div key={index} className="bg-white p-4 rounded-xl border-l-4 border-purple-500">
                                        <p className="text-gray-700">{med}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Lifestyle Changes */}
                    {treatmentPlan.lifestyle_changes && treatmentPlan.lifestyle_changes.length > 0 && (
                        <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-6 rounded-2xl border border-orange-200">
                            <h3 className="text-xl font-semibold text-orange-800 mb-4 flex items-center gap-2">
                                <i className="fas fa-heart"></i>
                                Lifestyle Changes
                            </h3>
                            <div className="space-y-3">
                                {treatmentPlan.lifestyle_changes.map((change, index) => (
                                    <div key={index} className="bg-white p-4 rounded-xl border-l-4 border-orange-500">
                                        <p className="text-gray-700">{change}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Follow-up Instructions */}
                    <div className="bg-gradient-to-r from-red-50 to-pink-50 p-6 rounded-2xl border border-red-200">
                        <h3 className="text-xl font-semibold text-red-800 mb-3 flex items-center gap-2">
                            <i className="fas fa-calendar-check"></i>
                            Follow-up Instructions
                        </h3>
                        <p className="text-gray-700 leading-relaxed bg-white p-4 rounded-xl">
                            {treatmentPlan.followup_instructions}
                        </p>
                    </div>
                </div>

                <div className="text-center mt-8">
                    <button
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-8 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transform hover:scale-105 transition-all duration-300 flex items-center gap-3 mx-auto"
                        onClick={() => {
                            setCurrentStep('start');
                            setAssessment(null);
                            setQuestions([]);
                            setAnswers({});
                            setCurrentAnswer('');
                            setCurrentQuestion(null);
                            setTreatmentPlan(null);
                            setError('');
                            setConcern('');
                        }}
                    >
                        <i className="fas fa-plus"></i>
                        Start New Assessment
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                {/* <div className="text-center mb-8 bg-white/95 backdrop-blur-lg rounded-3xl p-8 shadow-2xl">
                    <div className="text-6xl mb-4">🏥</div>
                    <h1 className="text-4xl font-bold text-indigo-600 mb-2">
                        Health Assist
                    </h1>
                    <p className="text-gray-600 text-lg">
                        AI-powered health assessment with personalized treatment plans
                        powered by DocAssist & Claude
                    </p>
                </div> */}

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl mb-6 flex items-center gap-3">
                        <i className="fas fa-exclamation-triangle text-red-500"></i>
                        <span>{error}</span>
                        <button
                            onClick={() => setError('')}
                            className="ml-auto text-red-500 hover:text-red-700"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                )}

                {/* Main Content */}
                {currentStep === 'start' && <StartScreen />}
                {currentStep === 'assessment' && <AssessmentScreen />}
                {currentStep === 'treatment' && <TreatmentScreen />}
            </div>
        </div>
    );
};

ReactDOM.render(<HealthAssessmentApp />, document.getElementById('root'));

