import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Leaf, AlertCircle, CheckCircle2, RefreshCw, ArrowRight, Mic, MicOff, Volume2, Store, MessageSquare, MapPin, Landmark, PiggyBank, HandCoins, Wallet, BarChart3, Cloud, Thermometer, Wind, Droplets } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { diagnoseCrop, askQuestion, recommendCrop, DiagnosisResult, QuestionResult, RecommendationResult } from './lib/gemini';
import { auth, db } from './lib/firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

type View = 'home' | 'diagnose' | 'ask' | 'market' | 'insights' | 'yield' | 'irrigation' | 'banking' | 'recommendation';

const LANGUAGES = [
  { code: 'en-US', name: 'English', label: 'English' },
  { code: 'hi-IN', name: 'Hindi', label: 'हिन्दी' },
  { code: 'es-ES', name: 'Spanish', label: 'Español' },
  { code: 'sw-KE', name: 'Swahili', label: 'Kiswahili' },
  { code: 'fr-FR', name: 'French', label: 'Français' },
  { code: 'ar-SA', name: 'Arabic', label: 'العربية' },
  { code: 'pt-BR', name: 'Portuguese', label: 'Português' },
  { code: 'bn-IN', name: 'Bengali', label: 'বাংলা' },
  { code: 'ru-RU', name: 'Russian', label: 'Русский' },
  { code: 'ja-JP', name: 'Japanese', label: '日本語' },
  { code: 'de-DE', name: 'German', label: 'Deutsch' },
  { code: 'te-IN', name: 'Telugu', label: 'తెలుగు' },
  { code: 'mr-IN', name: 'Marathi', label: 'మరాఠీ' },
  { code: 'ta-IN', name: 'Tamil', label: 'தமிழ்' },
  { code: 'ur-PK', name: 'Urdu', label: 'اردو' },
  { code: 'gu-IN', name: 'Gujarati', label: 'ગુજરાતી' },
  { code: 'kn-IN', name: 'Kannada', label: 'ಕನ್ನಡ' },
  { code: 'ml-IN', name: 'Malayalam', label: 'മലയാളം' },
  { code: 'pa-IN', name: 'Punjabi', label: 'ਪੰਜਾਬੀ' },
  { code: 'zh-CN', name: 'Chinese', label: '中文' },
  { code: 'id-ID', name: 'Indonesian', label: 'Bahasa Indonesia' },
  { code: 'tr-TR', name: 'Turkish', label: 'Türkçe' },
  { code: 'vi-VN', name: 'Vietnamese', label: 'Tiếng Việt' },
  { code: 'th-TH', name: 'Thai', label: 'ไทย' },
];

export default function App() {
  const [view, setView] = useState<View>('home');
  const [lang, setLang] = useState(LANGUAGES[0]);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isTrialActive, setIsTrialActive] = useState(false);
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [answer, setAnswer] = useState<QuestionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [yieldInputs, setYieldInputs] = useState({ rainfall: '', temp: '', soil: '' });
  const [recommendationInputs, setRecommendationInputs] = useState({
    nitrogen: '',
    phosphorus: '',
    potassium: '',
    soilType: '',
    moisture: '',
    rainfall: '',
    temp: ''
  });
  const [recommendationResult, setRecommendationResult] = useState<RecommendationResult | null>(null);
  const [weather, setWeather] = useState<{temp: number, condition: string, humidity: number, wind: number, city: string} | null>(null);
  const [withdrawInput, setWithdrawInput] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isBankLinked, setIsBankLinked] = useState(false);
  const [bankBalance, setBankBalance] = useState(420);
  const [transactions, setTransactions] = useState([
    { type: 'paid', amount: 300, date: '2026-03-15' },
    { type: 'paid', amount: 120, date: '2026-04-01' }
  ]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auth & Location
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });

    // Trial Logic
    const trialStart = localStorage.getItem('kisan_trial_start');
    if (trialStart) {
      const startDate = new Date(parseInt(trialStart));
      const now = new Date();
      const diffTime = now.getTime() - startDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays < 30) {
        setIsTrialActive(true);
        setTrialDaysLeft(30 - diffDays);
      } else {
        setIsTrialActive(false);
        localStorage.removeItem('kisan_trial_start'); // Trial expired
      }
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ lat: latitude, lng: longitude });
        
        // Fetch Weather
        const weatherKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
        if (weatherKey) {
          fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${weatherKey}&units=metric`)
            .then(res => res.json())
            .then(data => {
              if (data.main) {
                setWeather({
                  temp: data.main.temp,
                  condition: data.weather[0].main,
                  humidity: data.main.humidity,
                  wind: data.wind.speed,
                  city: data.name
                });
                setYieldInputs(prev => ({ ...prev, temp: Math.round(data.main.temp).toString() }));
                setRecommendationInputs(prev => ({ 
                  ...prev, 
                  temp: Math.round(data.main.temp).toString(),
                  moisture: data.main.humidity.toString()
                }));
              }
            })
            .catch(err => console.error("Weather fetch failed:", err));
        }
      });
    }

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed:", err);
      setError("Login failed. Please try again.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsTrialActive(false);
      setView('home');
      reset();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const startTrial = () => {
    const now = new Date().getTime();
    localStorage.setItem('kisan_trial_start', now.toString());
    setIsTrialActive(true);
    setTrialDaysLeft(30);
  };

  const handleBankAction = (type: 'paid' | 'withdrawal', amount: number) => {
    if (type === 'withdrawal' && amount > bankBalance) {
      setError("Insufficient balance for withdrawal.");
      return;
    }
    
    const newBalance = type === 'paid' ? bankBalance + amount : bankBalance - amount;
    setBankBalance(newBalance);
    setTransactions([{ type, amount, date: new Date().toISOString().split('T')[0] }, ...transactions]);
    setSuccessMessage(`₹${amount} ${type === 'paid' ? 'added to' : 'withdrawn from'} your account!`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Speech Recognition Setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = lang.code;
      recognitionRef.current.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
        setIsRecording(false);
      };
      recognitionRef.current.onerror = () => setIsRecording(false);
    }
  }, [lang]);

  const startRecording = () => {
    if (recognitionRef.current) {
      setTranscript('');
      setIsRecording(true);
      recognitionRef.current.start();
    } else {
      alert("Speech recognition not supported in this browser.");
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang.code;
    window.speechSynthesis.speak(utterance);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const logQuery = async (data: any) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'queries'), {
        userId: user.uid,
        timestamp: serverTimestamp(),
        location: location ? { latitude: location.lat, longitude: location.lng } : null,
        ...data
      });
    } catch (err) {
      console.error("Offline logging enabled. Data will sync later.", err);
    }
  };

  const handleDiagnose = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    try {
      const result = await diagnoseCrop(image, lang.name);
      setDiagnosis(result);
      speak(`I have identified ${result.cropName}. The condition is ${result.condition}. Here is your action plan.`);
      await logQuery({
        type: 'diagnosis',
        cropName: result.cropName,
        condition: result.condition,
        severity: result.severity,
        explanation: result.explanation,
        actionPlan: result.actionPlan
      });
    } catch (err) {
      setError('Could not diagnose. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAsk = async () => {
    const queryText = view === 'yield' 
      ? `Predict yield for: Rainfall ${yieldInputs.rainfall}mm, Temp ${yieldInputs.temp}°C, Soil Quality ${yieldInputs.soil}/10. ${transcript}`
      : transcript;

    if (!queryText && !image) return;
    setLoading(true);
    setError(null);
    try {
      const result = await askQuestion(queryText, lang.name, image || undefined);
      setAnswer(result);
      speak(result.answer);
      await logQuery({
        type: view === 'yield' ? 'yield_prediction' : 'question',
        queryText: queryText,
        answer: result.answer,
        actionPlan: result.actionPlan
      });
    } catch (err) {
      setError('Could not get an answer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecommend = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await recommendCrop(recommendationInputs, lang.name);
      setRecommendationResult(result);
      speak(`Based on our ML analysis, I recommend cultivating ${result.recommendedCrops[0]}. Accuracy is ${Math.round(result.modelMetrics.accuracy * 100)} percent.`);
      await logQuery({
        type: 'crop_recommendation',
        inputs: recommendationInputs,
        recommendations: result.recommendedCrops,
        confidence: result.confidenceScores,
        metrics: result.modelMetrics
      });
    } catch (err) {
      setError('Recommendation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImage(null);
    setDiagnosis(null);
    setAnswer(null);
    setRecommendationResult(null);
    setError(null);
    setTranscript('');
    setRecommendationInputs({
      nitrogen: '',
      phosphorus: '',
      potassium: '',
      soilType: '',
      moisture: '',
      rainfall: '',
      temp: ''
    });
  };

  const renderHome = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setView('diagnose')}
        className="bg-brand-600 text-white p-8 rounded-3xl shadow-xl flex flex-col items-center gap-4 text-center"
      >
        <div className="bg-white/20 p-4 rounded-2xl">
          <Camera className="w-10 h-10" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Take Photo</h2>
          <p className="opacity-80 text-sm">Diagnose crop diseases instantly</p>
        </div>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setView('ask')}
        className="bg-white text-brand-900 p-8 rounded-3xl shadow-lg border border-brand-100 flex flex-col items-center gap-4 text-center"
      >
        <div className="bg-brand-100 p-4 rounded-2xl">
          <MessageSquare className="w-10 h-10 text-brand-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-brand-900">Ask Expert</h2>
          <p className="text-brand-600 text-sm">Talk to our expert agronomist</p>
        </div>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setView('yield')}
        className="bg-brand-50 text-brand-900 p-8 rounded-3xl shadow-md border border-brand-200 flex flex-col items-center gap-4 text-center"
      >
        <div className="bg-white p-4 rounded-2xl shadow-sm">
          <RefreshCw className="w-10 h-10 text-brand-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Yield Predictor</h2>
          <p className="text-brand-600 text-sm">AI-driven harvest estimates</p>
        </div>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setView('recommendation')}
        className="bg-brand-900 text-white p-8 rounded-3xl shadow-xl flex flex-col items-center gap-4 text-center border-2 border-brand-700"
      >
        <div className="bg-brand-800 p-4 rounded-2xl">
          <BarChart3 className="w-10 h-10 text-brand-300" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Crop Recommender</h2>
          <p className="opacity-80 text-sm italic">ML-driven precision suggestions</p>
        </div>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setView('irrigation')}
        className="bg-brand-50 text-brand-900 p-8 rounded-3xl shadow-md border border-brand-200 flex flex-col items-center gap-4 text-center"
      >
        <div className="bg-white p-4 rounded-2xl shadow-sm">
          <MapPin className="w-10 h-10 text-brand-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Irrigation Advisor</h2>
          <p className="text-brand-600 text-sm">Smart watering schedules</p>
        </div>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setView('banking')}
        className="bg-brand-50 text-brand-900 p-8 rounded-3xl shadow-md border border-brand-200 flex flex-col items-center gap-4 text-center"
      >
        <div className="bg-white p-4 rounded-2xl shadow-sm">
          <Landmark className="w-10 h-10 text-brand-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Financial Support</h2>
          <p className="text-brand-600 text-sm">Govt schemes & micro-savings</p>
        </div>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setView('market')}
        className="bg-brand-100 text-brand-900 p-8 rounded-3xl shadow-md border border-brand-200 flex flex-col items-center gap-4 text-center"
      >
        <div className="bg-white p-4 rounded-2xl shadow-sm">
          <Store className="w-10 h-10 text-brand-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Market Prices</h2>
          <p className="text-brand-600 text-sm">Check daily rates & trends</p>
        </div>
      </motion.button>
    </div>
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-brand-50 flex items-center justify-center">
        <RefreshCw className="w-12 h-12 text-brand-600 animate-spin" />
      </div>
    );
  }

  if (!user && !isTrialActive) {
    return (
      <div className="min-h-screen bg-brand-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-12 rounded-[40px] shadow-2xl border border-brand-100 max-w-md w-full space-y-8"
        >
          <div className="bg-brand-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-lg">
            <Leaf className="w-10 h-10 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-brand-900">Kisan Sahayak</h1>
            <p className="text-brand-600">Your Personal AI Agronomist</p>
          </div>
          
          <div className="space-y-4">
            <button 
              onClick={handleLogin}
              className="w-full bg-brand-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg hover:bg-brand-700"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6 bg-white rounded-full p-1" alt="Google" />
              Sign in with Google
            </button>

            <div className="flex items-center gap-4 py-2">
              <div className="h-px bg-brand-100 flex-1" />
              <span className="text-xs text-brand-300 font-bold uppercase">OR</span>
              <div className="h-px bg-brand-100 flex-1" />
            </div>

            <button 
              onClick={startTrial}
              className="w-full bg-white border-2 border-brand-100 hover:border-brand-600 text-brand-600 py-4 rounded-2xl font-bold transition-all"
            >
              Start 30-Day Free Trial
            </button>
          </div>

          <p className="text-xs text-brand-400">Secure access to your farm data and expert advice.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-50 flex flex-col items-center p-4 md:p-8">
      {/* Header */}
      <header className="w-full max-w-4xl flex items-center justify-between mb-12">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setView('home'); reset(); }}>
          <div className="bg-brand-600 p-2 rounded-xl shadow-lg">
            <Leaf className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-brand-900">Kisan Sahayak</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <select 
            value={lang.code}
            onChange={(e) => setLang(LANGUAGES.find(l => l.code === e.target.value) || LANGUAGES[0])}
            className="bg-white border border-brand-100 rounded-full px-3 py-1 text-sm font-medium text-brand-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>

          <button 
            onClick={handleLogout}
            className="text-brand-400 hover:text-red-500 transition-colors flex items-center gap-2"
            title="Sign Out"
          >
            {isTrialActive && (
              <span className="text-[10px] font-bold bg-brand-100 text-brand-600 px-2 py-1 rounded-full">
                Trial: {trialDaysLeft}d left
              </span>
            )}
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      {weather && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-4xl bg-brand-900 text-white rounded-[40px] p-8 mb-8 shadow-2xl flex items-center justify-between relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Cloud className="w-32 h-32" />
          </div>
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-brand-300" />
              <span className="text-xs font-bold uppercase tracking-widest text-brand-300">{weather.city}</span>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-6xl font-black">{Math.round(weather.temp)}°</span>
              <div className="flex flex-col">
                <span className="text-xl font-bold text-brand-300">{weather.condition}</span>
                <span className="text-xs text-brand-400 font-medium">Local Live Conditions</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4 relative z-10 bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="bg-white/10 p-2 rounded-xl">
                <Droplets className="w-5 h-5 text-brand-300" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-brand-400 tracking-widest">Humidity</p>
                <p className="text-lg font-bold">{weather.humidity}%</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-white/10 p-2 rounded-xl">
                <Wind className="w-5 h-5 text-brand-300" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-brand-400 tracking-widest">Wind Speed</p>
                <p className="text-lg font-bold">{weather.wind} m/s</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <main className="w-full max-w-4xl flex flex-col items-center">
        <AnimatePresence mode="wait">
          {view === 'home' && renderHome()}

          {view === 'diagnose' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full space-y-6">
              <div className="flex items-center gap-4 mb-4">
                <button onClick={() => setView('home')} className="p-2 bg-white rounded-full shadow-sm"><ArrowRight className="w-5 h-5 rotate-180" /></button>
                <h2 className="text-2xl font-bold text-brand-900">Crop Diagnosis</h2>
              </div>

              {!image ? (
                <div onClick={() => fileInputRef.current?.click()} className="bg-white border-2 border-dashed border-brand-300 rounded-3xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-brand-500 transition-colors">
                  <Camera className="w-12 h-12 text-brand-600" />
                  <p className="text-brand-600 font-medium">Click to take a photo</p>
                  <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="relative rounded-3xl overflow-hidden shadow-xl aspect-video bg-brand-100">
                    <img src={image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <button onClick={() => setImage(null)} className="absolute top-4 right-4 bg-black/50 p-2 rounded-full text-white"><RefreshCw className="w-5 h-5" /></button>
                  </div>
                  {!diagnosis && !loading && (
                    <button onClick={handleDiagnose} className="w-full bg-brand-600 text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-6 h-6" /> Analyze Crop
                    </button>
                  )}
                </div>
              )}

              {loading && <div className="text-center p-12"><RefreshCw className="w-10 h-10 text-brand-600 animate-spin mx-auto mb-4" /><p className="text-brand-900 font-bold">Analyzing...</p></div>}
              
              {diagnosis && (
                <div className="bg-white rounded-3xl p-6 shadow-xl border border-brand-100 space-y-4">
                  <div className="flex justify-between items-start">
                    <div><h3 className="text-2xl font-bold text-brand-900">{diagnosis.cropName}</h3><p className="text-brand-600">{diagnosis.condition}</p></div>
                    <div className="bg-brand-100 text-brand-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Severity: {diagnosis.severity}</div>
                  </div>
                  <div className="bg-brand-50 p-4 rounded-2xl italic text-brand-800">"{diagnosis.explanation}"</div>
                  <div className="space-y-3">
                    <h4 className="font-bold text-brand-900 flex items-center gap-2"><ArrowRight className="w-4 h-4 text-brand-600" /> Action Plan</h4>
                    {diagnosis.actionPlan.map((step, i) => (
                      <div key={i} className="flex gap-3 items-start bg-white border border-brand-50 p-3 rounded-xl shadow-sm">
                        <span className="bg-brand-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{i+1}</span>
                        <p className="text-brand-900 text-sm">{step}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => speak(diagnosis.explanation)} className="w-full flex items-center justify-center gap-2 text-brand-600 font-bold py-2"><Volume2 className="w-5 h-5" /> Listen to Diagnosis</button>
                </div>
              )}
            </motion.div>
          )}

          {view === 'ask' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full space-y-6">
              <div className="flex items-center gap-4 mb-4">
                <button onClick={() => setView('home')} className="p-2 bg-white rounded-full shadow-sm"><ArrowRight className="w-5 h-5 rotate-180" /></button>
                <h2 className="text-2xl font-bold text-brand-900">Ask Expert</h2>
              </div>

              <div className="bg-white rounded-3xl p-8 shadow-xl border border-brand-100 flex flex-col items-center gap-6">
                <p className="text-brand-600 text-center">Hold the button and ask your question about farming.</p>
                
                <motion.button
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  animate={isRecording ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className={cn(
                    "w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-colors",
                    isRecording ? "bg-red-500 text-white" : "bg-brand-600 text-white"
                  )}
                >
                  {isRecording ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
                </motion.button>

                {transcript && (
                  <div className="w-full bg-brand-50 p-4 rounded-2xl border border-brand-100">
                    <p className="text-brand-900 font-medium">"{transcript}"</p>
                  </div>
                )}

                {transcript && !loading && !answer && (
                  <button onClick={handleAsk} className="w-full bg-brand-600 text-white py-4 rounded-2xl font-bold shadow-lg">Get Answer</button>
                )}
              </div>

              {loading && <div className="text-center p-12"><RefreshCw className="w-10 h-10 text-brand-600 animate-spin mx-auto mb-4" /><p className="text-brand-900 font-bold">Thinking...</p></div>}

              {answer && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 shadow-xl border border-brand-100 space-y-4">
                  <h3 className="text-xl font-bold text-brand-900">Expert Answer</h3>
                  <p className="text-brand-800 leading-relaxed">{answer.answer}</p>
                  <div className="space-y-3">
                    <h4 className="font-bold text-brand-900 flex items-center gap-2"><ArrowRight className="w-4 h-4 text-brand-600" /> Action Plan</h4>
                    {answer.actionPlan.map((step, i) => (
                      <div key={i} className="flex gap-3 items-start bg-white border border-brand-50 p-3 rounded-xl shadow-sm">
                        <span className="bg-brand-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{i+1}</span>
                        <p className="text-brand-900 text-sm">{step}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => speak(answer.answer)} className="w-full flex items-center justify-center gap-2 text-brand-600 font-bold py-2"><Volume2 className="w-5 h-5" /> Listen to Answer</button>
                </motion.div>
              )}
            </motion.div>
          )}

          {view === 'yield' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full space-y-6">
              <div className="flex items-center gap-4 mb-4">
                <button onClick={() => setView('home')} className="p-2 bg-white rounded-full shadow-sm"><ArrowRight className="w-5 h-5 rotate-180" /></button>
                <h2 className="text-2xl font-bold text-brand-900">Yield Predictor</h2>
              </div>
              
              {weather && (
                <div className="bg-brand-100 border border-brand-200 rounded-2xl p-4 flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-brand-600" />
                    <div>
                      <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Active Live Location</p>
                      <p className="text-sm font-bold text-brand-900">{weather.city}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Live Temp</p>
                    <p className="text-sm font-bold text-brand-600">{Math.round(weather.temp)}°C</p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-3xl p-8 shadow-xl border border-brand-100 space-y-6">
                <div className="space-y-4">
                  <p className="text-brand-600 text-sm italic">Enter your farm data for an AI-driven harvest estimate.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-brand-400 uppercase">Rainfall (mm)</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 120" 
                        value={yieldInputs.rainfall}
                        onChange={(e) => setYieldInputs({...yieldInputs, rainfall: e.target.value})}
                        className="w-full p-3 rounded-xl border border-brand-100 focus:ring-2 focus:ring-brand-500 outline-none" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-brand-400 uppercase">Temp (°C)</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 30" 
                        value={yieldInputs.temp}
                        onChange={(e) => setYieldInputs({...yieldInputs, temp: e.target.value})}
                        className="w-full p-3 rounded-xl border border-brand-100 focus:ring-2 focus:ring-brand-500 outline-none" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-brand-400 uppercase">Soil Quality (1-10)</label>
                      <input 
                        type="number" 
                        placeholder="e.g. 7" 
                        value={yieldInputs.soil}
                        onChange={(e) => setYieldInputs({...yieldInputs, soil: e.target.value})}
                        className="w-full p-3 rounded-xl border border-brand-100 focus:ring-2 focus:ring-brand-500 outline-none" 
                      />
                    </div>
                  </div>

                  <div className="relative">
                    <textarea 
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      placeholder="Additional details (optional)..."
                      className="w-full p-4 rounded-2xl border border-brand-100 focus:ring-2 focus:ring-brand-500 outline-none min-h-[100px]"
                    />
                    <button 
                      onClick={isRecording ? stopRecording : startRecording}
                      className={cn(
                        "absolute bottom-4 right-4 p-3 rounded-full shadow-lg transition-colors",
                        isRecording ? "bg-red-500 text-white" : "bg-brand-100 text-brand-600"
                      )}
                    >
                      {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                  </div>

                  <button 
                    onClick={handleAsk} 
                    disabled={loading}
                    className="w-full bg-brand-600 text-white py-4 rounded-2xl font-bold shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <BarChart3 className="w-5 h-5" />}
                    Predict Yield
                  </button>
                </div>
              </div>

              {answer && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-brand-900 text-white rounded-3xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-brand-300">Yield Forecast</h3>
                    <div className="bg-brand-800 px-3 py-1 rounded-full text-xs font-bold text-brand-300">ML Model v1.0</div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="bg-white/10 p-3 rounded-2xl">
                      <Leaf className="w-8 h-8 text-brand-300" />
                    </div>
                    <p className="text-brand-100 leading-relaxed flex-1">{answer.answer}</p>
                  </div>
                  <button onClick={() => speak(answer.answer)} className="w-full flex items-center justify-center gap-2 text-brand-300 font-bold py-2 hover:bg-white/5 rounded-xl transition-colors">
                    <Volume2 className="w-5 h-5" /> Listen to Forecast
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {view === 'irrigation' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full space-y-6">
              <div className="flex items-center gap-4 mb-4">
                <button onClick={() => setView('home')} className="p-2 bg-white rounded-full shadow-sm"><ArrowRight className="w-5 h-5 rotate-180" /></button>
                <h2 className="text-2xl font-bold text-brand-900">Irrigation Advisor</h2>
              </div>
              <div className="bg-white rounded-3xl p-8 shadow-xl border border-brand-100 flex flex-col items-center gap-6">
                <p className="text-brand-600 text-center">Tell us about your crop and current weather to get a watering schedule.</p>
                <div className="w-full space-y-4">
                  <textarea 
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="e.g., My corn leaves are curling slightly, it hasn't rained in 5 days..."
                    className="w-full p-4 rounded-2xl border border-brand-100 focus:ring-2 focus:ring-brand-500 outline-none min-h-[120px]"
                  />
                  <div className="flex gap-4">
                    <button onClick={startRecording} className={cn("flex-1 py-4 rounded-2xl font-bold flex items-center justify-center gap-2", isRecording ? "bg-red-500 text-white" : "bg-brand-100 text-brand-600")}>
                      <Mic className="w-5 h-5" /> {isRecording ? "Listening..." : "Speak"}
                    </button>
                    <button onClick={handleAsk} disabled={!transcript || loading} className="flex-[2] bg-brand-600 text-white py-4 rounded-2xl font-bold shadow-lg disabled:opacity-50">
                      Get Schedule
                    </button>
                  </div>
                </div>
              </div>
              {loading && <div className="text-center p-12"><RefreshCw className="w-10 h-10 text-brand-600 animate-spin mx-auto mb-4" /><p className="text-brand-900 font-bold">Analyzing Weather & Soil...</p></div>}
              {answer && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-blue-900 text-white rounded-3xl p-6 shadow-xl space-y-4">
                  <h3 className="text-xl font-bold text-blue-300">Watering Schedule</h3>
                  <p className="text-blue-100 leading-relaxed">{answer.answer}</p>
                  <button onClick={() => speak(answer.answer)} className="w-full flex items-center justify-center gap-2 text-blue-300 font-bold py-2"><Volume2 className="w-5 h-5" /> Listen to Schedule</button>
                </motion.div>
              )}
            </motion.div>
          )}
          {view === 'banking' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full space-y-6">
              <div className="flex items-center gap-4 mb-4">
                <button onClick={() => setView('home')} className="p-2 bg-white rounded-full shadow-sm"><ArrowRight className="w-5 h-5 rotate-180" /></button>
                <h2 className="text-2xl font-bold text-brand-900">Financial Support</h2>
              </div>

              {!isBankLinked ? (
                <div className="bg-white rounded-[40px] p-12 shadow-2xl border border-brand-100 text-center space-y-6">
                  <div className="bg-brand-100 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto">
                    <Landmark className="w-10 h-10 text-brand-600" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-brand-900">Link Govt Bank Account</h3>
                    <p className="text-brand-600">Connect your official bank account to manage subsidies and emergency funds.</p>
                  </div>
                  <button 
                    onClick={() => setIsBankLinked(true)}
                    className="w-full bg-brand-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-brand-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Landmark className="w-5 h-5" /> Link Account Now
                  </button>
                  <p className="text-xs text-brand-400">Supported: SBI, PNB, BOB, and other major govt banks.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {/* Emergency Fund Dashboard */}
                  <div className="bg-brand-900 text-white rounded-[40px] p-8 shadow-2xl space-y-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-brand-300">
                        <PiggyBank className="w-6 h-6" />
                        <h3 className="text-xl font-bold">Emergency Wallet</h3>
                      </div>
                      <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-bold border border-green-500/30">Bank Linked</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-white/5 p-6 rounded-3xl border border-white/10 text-center">
                        <p className="text-brand-400 text-xs uppercase tracking-widest mb-1">Total Balance</p>
                        <p className="text-3xl font-bold">₹{bankBalance.toFixed(2)}</p>
                      </div>
                      <div className="bg-white/5 p-6 rounded-3xl border border-white/10 text-center">
                        <p className="text-brand-400 text-xs uppercase tracking-widest mb-1">Total Paid</p>
                        <p className="text-3xl font-bold text-green-400">
                          ₹{transactions.filter(t => t.type === 'paid').reduce((acc, t) => acc + t.amount, 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="bg-white/5 p-6 rounded-3xl border border-white/10 text-center">
                        <p className="text-brand-400 text-xs uppercase tracking-widest mb-1">Total Withdrawn</p>
                        <p className="text-3xl font-bold text-red-400">
                          ₹{transactions.filter(t => t.type === 'withdrawal').reduce((acc, t) => acc + t.amount, 0).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <p className="text-brand-300 text-sm font-bold">Quick Save (Min ₹10)</p>
                      <div className="grid grid-cols-3 gap-4">
                        {[10, 50, 100].map((amount) => (
                          <button 
                            key={amount}
                            onClick={() => handleBankAction('paid', amount)}
                            className="bg-white/10 hover:bg-white/20 py-4 rounded-2xl font-bold transition-all border border-white/10"
                          >
                            +₹{amount}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <p className="text-brand-300 text-sm font-bold">Withdraw Emergency Funds</p>
                      <div className="flex gap-4">
                        <input 
                          type="number"
                          value={withdrawInput}
                          onChange={(e) => setWithdrawInput(e.target.value)}
                          placeholder="Amount in ₹"
                          className="flex-1 bg-white/10 border border-white/20 p-4 rounded-2xl text-white outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <button 
                          onClick={() => {
                            if (withdrawInput) {
                              handleBankAction('withdrawal', parseFloat(withdrawInput));
                              setWithdrawInput('');
                            }
                          }}
                          className="bg-red-500 hover:bg-red-600 text-white px-8 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
                        >
                          <HandCoins className="w-5 h-5" /> Withdraw
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {successMessage && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="bg-green-500 text-white p-4 rounded-2xl text-center font-bold text-sm shadow-lg"
                        >
                          {successMessage}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Transaction History */}
                  <div className="bg-white rounded-[40px] p-8 shadow-xl border border-brand-100 space-y-6">
                    <h3 className="text-xl font-bold text-brand-900 flex items-center gap-2">
                      <Wallet className="w-6 h-6 text-brand-600" />
                      Transaction History
                    </h3>
                    <div className="space-y-3">
                      {transactions.map((t, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-brand-50 rounded-2xl border border-brand-100">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-2 rounded-xl",
                              t.type === 'paid' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                            )}>
                              {t.type === 'paid' ? <PiggyBank className="w-5 h-5" /> : <HandCoins className="w-5 h-5" />}
                            </div>
                            <div>
                              <p className="font-bold text-brand-900 capitalize">{t.type}</p>
                              <p className="text-xs text-brand-500">{t.date}</p>
                            </div>
                          </div>
                          <p className={cn(
                            "font-bold text-lg",
                            t.type === 'paid' ? "text-green-600" : "text-red-600"
                          )}>
                            {t.type === 'paid' ? '+' : '-'}₹{t.amount}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Govt Schemes Section */}
                  <div className="bg-white rounded-[40px] p-8 shadow-xl border border-brand-100 space-y-4">
                    <div className="flex items-center gap-3 text-brand-600">
                      <Landmark className="w-6 h-6" />
                      <h3 className="text-xl font-bold">Govt Schemes Advisor</h3>
                    </div>
                    <p className="text-brand-600 text-sm">Ask about PM-Kisan, Fasal Bima Yojana, and other regional benefits.</p>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        placeholder="e.g., Schemes for small wheat farmers..."
                        className="flex-1 p-3 rounded-xl border border-brand-100 outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <button onClick={handleAsk} className="bg-brand-600 text-white px-6 rounded-xl font-bold">Find</button>
                    </div>
                    {loading && <div className="animate-pulse text-brand-600 text-sm">Searching schemes...</div>}
                    {answer && (
                      <div className="bg-brand-50 p-4 rounded-2xl border border-brand-100">
                        <p className="text-brand-900 text-sm leading-relaxed">{answer.answer}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
          {view === 'recommendation' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full space-y-6">
              <div className="flex items-center gap-4 mb-4">
                <button onClick={() => setView('home')} className="p-2 bg-white rounded-full shadow-sm"><ArrowRight className="w-5 h-5 rotate-180" /></button>
                <h2 className="text-2xl font-bold text-brand-900">Crop Recommender</h2>
              </div>

              {weather && (
                <div className="bg-brand-900 text-white rounded-3xl p-6 shadow-xl flex items-center justify-between mb-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <MapPin className="w-16 h-16" />
                  </div>
                  <div className="relative z-10 flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-2xl">
                      <MapPin className="w-6 h-6 text-brand-300" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-brand-300 uppercase tracking-widest">Live Precision Data</p>
                      <p className="text-xl font-bold">{weather.city}</p>
                    </div>
                  </div>
                  <div className="relative z-10 text-right">
                    <p className="text-3xl font-black">{Math.round(weather.temp)}°C</p>
                    <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest">GPS Linked</p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-[40px] p-8 shadow-xl border border-brand-100 space-y-8">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-brand-900">Enter Environmental Data</h3>
                  <p className="text-brand-600">Provide soil and climate details for precision ML recommendations.</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { id: 'nitrogen', label: 'Nitrogen (N)' },
                    { id: 'phosphorus', label: 'Phosphorus (P)' },
                    { id: 'potassium', label: 'Potassium (K)' },
                    { id: 'moisture', label: 'Soil Moisture %' },
                    { id: 'rainfall', label: 'Rainfall (mm)' },
                    { id: 'temp', label: 'Temp (°C)' }
                  ].map((field) => (
                    <div key={field.id} className="space-y-1">
                      <label className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">{field.label}</label>
                      <input 
                        type="number"
                        placeholder="0"
                        value={(recommendationInputs as any)[field.id]}
                        onChange={(e) => setRecommendationInputs({...recommendationInputs, [field.id]: e.target.value})}
                        className="w-full p-4 rounded-2xl bg-brand-50 border border-brand-100 focus:ring-2 focus:ring-brand-500 outline-none font-bold"
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Soil Type</label>
                  <select 
                    value={recommendationInputs.soilType}
                    onChange={(e) => setRecommendationInputs({...recommendationInputs, soilType: e.target.value})}
                    className="w-full p-4 rounded-2xl bg-brand-50 border border-brand-100 outline-none font-bold appearance-none"
                  >
                    <option value="">Select Soil...</option>
                    <option value="Alluvial">Alluvial</option>
                    <option value="Black">Black (Regur)</option>
                    <option value="Red">Red</option>
                    <option value="Laterite">Laterite</option>
                    <option value="Sandy">Sandy</option>
                  </select>
                </div>

                <button 
                  onClick={handleRecommend}
                  disabled={loading}
                  className="w-full bg-brand-900 text-white py-5 rounded-3xl font-bold shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all"
                >
                  {loading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <CheckCircle2 className="w-6 h-6 text-brand-300" />}
                  Get ML Recommendation
                </button>
              </div>

              {recommendationResult && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <div className="bg-brand-600 text-white rounded-[40px] p-8 shadow-2xl space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                      <BarChart3 className="w-32 h-32" />
                    </div>
                    <h3 className="text-2xl font-bold flex items-center gap-2">
                       <CheckCircle2 className="w-6 h-6" /> Recommended Crops
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                      {recommendationResult.recommendedCrops.map((crop, i) => (
                        <div key={i} className="bg-white/10 p-5 rounded-3xl border border-white/10 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-xl font-bold">
                               {i + 1}
                             </div>
                             <p className="text-xl font-bold">{crop}</p>
                          </div>
                          <div className="text-right">
                             <p className="text-xs text-brand-300 uppercase font-bold tracking-widest">Confidence</p>
                             <p className="text-2xl font-bold">{Math.round(recommendationResult.confidenceScores[i] * 100)}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
                       <p className="text-brand-200 text-sm italic leading-relaxed">
                         <span className="font-bold text-white uppercase text-xs block mb-2 tracking-widest">ML Analysis Notes</span>
                         {recommendationResult.reasons}
                       </p>
                    </div>
                  </div>

                  <div className="bg-brand-50 border border-brand-100 rounded-[40px] p-8 grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                        <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Model Accuracy</p>
                        <p className="text-3xl font-bold text-brand-900">{(recommendationResult.modelMetrics.accuracy * 100).toFixed(1)}%</p>
                     </div>
                     <div className="space-y-1">
                        <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Model Precision</p>
                        <p className="text-3xl font-bold text-brand-900">{(recommendationResult.modelMetrics.precision * 100).toFixed(1)}%</p>
                     </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {view === 'market' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full space-y-6">
               <div className="flex items-center gap-4 mb-4">
                <button onClick={() => setView('home')} className="p-2 bg-white rounded-full shadow-sm"><ArrowRight className="w-5 h-5 rotate-180" /></button>
                <h2 className="text-2xl font-bold text-brand-900">Market Prices</h2>
              </div>
              <div className="bg-white rounded-3xl p-6 shadow-xl border border-brand-100">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-brand-600 italic">Live rates for your region</p>
                  <span className="text-xs font-bold text-brand-400 uppercase tracking-widest">Updated 2m ago</span>
                </div>
                <div className="space-y-4">
                  {[
                    { crop: 'Wheat (Gehu)', price: '₹2,125', unit: 'per Quintal', trend: 'up', change: '+₹15', image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&q=80&w=400&h=400' },
                    { crop: 'Rice (Paddy)', price: '₹2,040', unit: 'per Quintal', trend: 'stable', change: '0', image: 'https://images.unsplash.com/photo-1586201375761-83865001eca8?auto=format&fit=crop&q=80&w=400&h=400' },
                    { crop: 'Maize (Corn)', price: '₹1,962', unit: 'per Quintal', trend: 'down', change: '-₹8', image: 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&q=80&w=400&h=400' },
                    { crop: 'Cotton (Kapaas)', price: '₹6,420', unit: 'per Quintal', trend: 'up', change: '+₹45', image: 'https://images.unsplash.com/photo-1594904351111-a072f80b1a71?auto=format&fit=crop&q=80&w=400&h=400' },
                    { crop: 'Sugarcane', price: '₹315', unit: 'per Quintal', trend: 'stable', change: '0', image: 'https://images.unsplash.com/photo-1622353326161-00ea35c8296a?auto=format&fit=crop&q=80&w=400&h=400' }
                  ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center p-5 bg-brand-50 rounded-2xl border border-brand-100 hover:border-brand-300 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="bg-white rounded-2xl shadow-sm overflow-hidden w-24 h-24 flex-shrink-0 border-2 border-white">
                          <img 
                            src={item.image} 
                            alt={item.crop} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div>
                          <h4 className="font-bold text-brand-900 text-lg tracking-tight">{item.crop}</h4>
                          <p className="text-xs text-brand-600 font-bold uppercase tracking-wider bg-white/50 px-2 py-0.5 rounded-md inline-block">
                            ₹{item.price} / qtl
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={cn(
                          "px-3 py-1.5 rounded-xl font-bold text-sm inline-flex items-center gap-1",
                          item.trend === 'up' ? 'bg-green-100 text-green-700' : item.trend === 'down' ? 'bg-red-100 text-red-700' : 'bg-brand-100 text-brand-700'
                        )}>
                          {item.trend === 'up' && '▲'}
                          {item.trend === 'down' && '▼'}
                          {item.trend === 'stable' && '●'}
                          {item.change}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button 
                onClick={() => setView('insights')}
                className="w-full py-4 text-brand-500 text-sm font-medium hover:text-brand-700 transition-colors"
              >
                View Policy Insights (Admin)
              </button>
            </motion.div>
          )}

          {view === 'insights' && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full space-y-6">
              <div className="flex items-center gap-4 mb-4">
                <button onClick={() => setView('home')} className="p-2 bg-white rounded-full shadow-sm"><ArrowRight className="w-5 h-5 rotate-180" /></button>
                <h2 className="text-2xl font-bold text-brand-900">Policy Insights</h2>
              </div>
              <div className="bg-brand-900 text-white rounded-3xl p-8 shadow-2xl space-y-8">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-brand-300 uppercase tracking-widest text-sm">The "Hook" for Cooperatives</h3>
                  <p className="text-brand-100">This dashboard simulates what you sell to government agencies using the data logged from farmers.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 p-4 rounded-2xl border border-white/10">
                    <p className="text-brand-300 text-xs uppercase font-bold">Total Queries</p>
                    <p className="text-3xl font-bold">1,284</p>
                  </div>
                  <div className="bg-white/10 p-4 rounded-2xl border border-white/10">
                    <p className="text-brand-300 text-xs uppercase font-bold">Disease Alerts</p>
                    <p className="text-3xl font-bold text-red-400">42</p>
                  </div>
                  <div className="bg-white/10 p-4 rounded-2xl border border-white/10 col-span-2">
                    <p className="text-brand-300 text-xs uppercase font-bold mb-2">Global ML Pipeline Performance</p>
                    <div className="flex justify-between items-end">
                       <div>
                         <p className="text-xs text-brand-400">Avg. Crop Recommendation Accuracy</p>
                         <p className="text-4xl font-bold text-green-400">94.2%</p>
                       </div>
                       <div className="text-right">
                         <p className="text-[10px] text-brand-400">Precision: 91.8%</p>
                         <p className="text-[10px] text-brand-400">F1-Score: 92.9%</p>
                       </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-brand-200">
                    <MapPin className="w-5 h-5" />
                    Disease Heat Map (Simulated)
                  </h4>
                  <div className="aspect-video bg-brand-800 rounded-2xl border border-white/5 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 opacity-20 bg-[url('https://picsum.photos/seed/map/800/400')] bg-cover grayscale" />
                    <div className="relative z-10 flex flex-col items-center gap-2">
                      <div className="w-12 h-12 bg-red-500/50 rounded-full animate-ping" />
                      <div className="w-4 h-4 bg-red-500 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      <p className="text-xs font-bold bg-black/50 px-2 py-1 rounded">Rust Outbreak: Zone 4B</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold flex items-center gap-2 text-brand-200">
                    <Landmark className="w-5 h-5" />
                    Power BI Integration (Step 7)
                  </h4>
                  <div className="bg-black/30 p-4 rounded-2xl font-mono text-[10px] text-brand-300 overflow-x-auto">
                    <p className="text-brand-500 mb-2">// M Script for Power BI Connector</p>
                    <pre>
{`let
    url = "${window.location.origin}/api/predict",
    body = "{""rainfall"":120,""temperature"":30,""soil_quality"":7}",
    headers = [
        #"Content-Type"="application/json",
        #"x-api-key"="my-secret-key"
    ],
    response = Web.Contents(url, [Content=Text.ToBinary(body), Headers=headers]),
    json = Json.Document(response)
in
    json`}
                    </pre>
                  </div>
                </div>

                <p className="text-xs text-brand-400 italic">Data automatically synced from Firestore for real-time policy intelligence.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-auto py-8 text-center text-brand-400 text-xs">
        <p>© 2026 Kisan Sahayak • Offline-First Expert Agronomist</p>
      </footer>
    </div>
  );
}


