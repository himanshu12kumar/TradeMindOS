/**
 * TradeMind OS — Voice Alert Service
 * Uses browser-native Web Speech API to provide authoritative,
 * real-time voice interventions when trading rules or limits are at risk.
 * Supports English ('en') and Hindi ('hi').
 *
 * Includes built-in phonetic Devanagari transliteration fallback so that
 * systems without installed Hindi (hi-IN) voice packs speak complete,
 * audible Hindi/Hinglish sentences rather than skipping text or speaking only numbers.
 */

// Production-grade Devanagari phonetic transliterator for speech engines
function transliterateDevanagari(text) {
  if (!text) return '';

  let cleaned = text
    .replace(/[🛑⚠️📊🔥⚡🛡️🚨📈📉💡🌅👋🇬🇧🇮🇳]/gu, '')
    .replace(/₹/g, ' Rupees ')
    .replace(/।/g, '. ')
    .replace(/[*#_`~•]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // High-frequency trading and conversational words
  const wordMap = {
    'ट्रेडिंग': 'trading',
    'ट्रेड्स': 'trades',
    'ट्रेडर': 'trader',
    'ट्रेड': 'trade',
    'स्टॉप लॉस': 'stop loss',
    'स्टॉपलॉस': 'stop loss',
    'नियमों': 'niyamon',
    'नियम': 'niyam',
    'प्लान': 'plan',
    'मार्केट': 'market',
    'स्क्रीन': 'screen',
    'कैपिटल': 'capital',
    'सेटअप': 'setup',
    'रिस्क': 'risk',
    'फोमो': 'FOMO',
    'इम्पल्स': 'impulse',
    'रिवेंज': 'revenge',
    'चार्ट्स': 'charts',
    'चार्ट': 'chart',
    'ब्रोकर': 'broker',
    'प्रॉफिट': 'profit',
    'लॉस': 'loss',
    'रुपये': 'rupees',
    'रुपया': 'rupee',
    'रोकिए': 'rokiye',
    'रोकें': 'rokiye',
    'सावधान': 'saavdhan',
    'चेतावनी': 'chetavani',
    'सुप्रभात': 'suprabhat',
    'बिल्कुल': 'bilkul',
    'नहीं': 'nahi',
    'हैं': 'hain',
    'है': 'hai',
    'हो': 'ho',
    'गया': 'gaya',
    'गई': 'gayi',
    'कॉल': 'call',
    'पुट': 'put',
    'बंद': 'band',
    'करें': 'karein',
    'कीजिए': 'kijiye',
    'ली': 'lee',
    'ले': 'le',
    'आज': 'aaj',
    'आपकी': 'aapki',
    'आपके': 'aapke',
    'आपने': 'aapne',
    'तय': 'tay',
    'सीमा': 'seema',
    'पूरी': 'poori',
    'चुकी': 'chuki',
    'तुरंत': 'turant',
    'सांस': 'saans',
    'गहरी': 'gehri',
    'मिनट': 'minute',
    'ब्रेक': 'break',
    'नुकसान': 'nuksaan',
    'घाटा': 'ghata',
    'अधिकतम': 'adhikatam',
    'अत्यधिक': 'atyadhik',
    'इमरजेंसी': 'emergency',
    'स्टॉप': 'stop',
    'बचाइए': 'bachaiye',
    'हटिए': 'hatiye',
    'हट': 'hat',
    'जाएँ': 'jaayein',
    'जाएं': 'jaayein',
    'जाइए': 'jaiye',
    'सम्मान': 'sammaan',
    'शान्त': 'shaant',
    'शांत': 'shaant',
    'दिमाग': 'dimaag',
    'तनाव': 'tanaav',
    'गुस्सा': 'gussa',
    'हताशा': 'hataasha',
    'स्कोर': 'score',
    'मौके': 'mauke',
    'पीछा': 'peecha',
    'बाज़ार': 'bazaar',
    'बाजार': 'bazaar',
    'अलर्ट': 'alert',
    'चेक': 'check',
    'संकेत': 'sanket',
    'पिछले': 'pichhle',
    'दो': 'do',
    'तीन': 'teen',
    'चार': 'chaar',
    'पाँच': 'paanch',
    'पांच': 'paanch'
  };

  const sortedWords = Object.keys(wordMap).sort((a, b) => b.length - a.length);
  for (const w of sortedWords) {
    cleaned = cleaned.split(w).join(wordMap[w]);
  }

  const consonants = {
    'क': 'ka', 'ख': 'kha', 'ग': 'ga', 'घ': 'gha', 'ङ': 'nga',
    'च': 'cha', 'छ': 'chha', 'ज': 'ja', 'झ': 'jha', 'ञ': 'nya',
    'ट': 'ta', 'ठ': 'tha', 'ड': 'da', 'ढ': 'dha', 'ण': 'na',
    'त': 'ta', 'थ': 'tha', 'द': 'da', 'ध': 'dha', 'न': 'na',
    'प': 'pa', 'फ': 'pha', 'ब': 'ba', 'भ': 'bha', 'म': 'ma',
    'य': 'ya', 'र': 'ra', 'ल': 'la', 'व': 'va', 'श': 'sha',
    'ष': 'sha', 'स': 'sa', 'ह': 'ha', 'क्ष': 'ksha', 'त्र': 'tra', 'ज्ञ': 'gya'
  };

  const vowels = {
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri',
    'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au'
  };

  const matras = {
    'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
    'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ँ': 'n', 'ः': 'h'
  };

  let out = '';
  const len = cleaned.length;

  for (let i = 0; i < len; i++) {
    const ch = cleaned[i];
    const next = i + 1 < len ? cleaned[i + 1] : '';

    if (consonants[ch]) {
      let base = consonants[ch];
      if (next === '्') {
        out += base.slice(0, -1);
        i++;
      } else if (matras[next]) {
        out += base.slice(0, -1) + matras[next];
        i++;
      } else if (consonants[next] || vowels[next] || next === ' ' || !next || /[.,!?]/.test(next)) {
        if (!next || next === ' ' || /[.,!?]/.test(next)) {
          out += base.slice(0, -1);
        } else {
          out += base;
        }
      } else {
        out += base;
      }
    } else if (vowels[ch]) {
      out += vowels[ch];
    } else if (matras[ch]) {
      out += matras[ch];
    } else {
      out += ch;
    }
  }

  return out.replace(/\s+/g, ' ').trim();
}

class VoiceAlertService {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.voices = [];
    this.isEnabled = true;
    this.language = 'en'; // 'en' | 'hi'
    this.englishVoice = null;
    this.indianVoice = null;
    this.hindiVoice = null;
    this.audioCtx = null;

    if (typeof window !== 'undefined') {
      const savedEnabled = localStorage.getItem('tm_voice_enabled');
      this.isEnabled = savedEnabled !== null ? savedEnabled === 'true' : true;

      const savedLang = localStorage.getItem('tm_bot_lang');
      this.language = savedLang === 'hi' ? 'hi' : 'en';

      if (this.synth) {
        this.loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
          this.synth.onvoiceschanged = () => this.loadVoices();
        }
      }
    }
  }

  loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();

    // 1. English voice selection
    const preferredEnglish = [
      'Google US English',
      'Samantha',
      'Daniel',
      'Microsoft David',
      'Microsoft Zira',
      'Alex',
      'en-US',
      'en-GB',
    ];
    for (const name of preferredEnglish) {
      const match = this.voices.find(
        (v) => v.name.includes(name) || v.lang.startsWith(name)
      );
      if (match) {
        this.englishVoice = match;
        break;
      }
    }
    if (!this.englishVoice && this.voices.length > 0) {
      this.englishVoice = this.voices.find((v) => v.lang.startsWith('en')) || this.voices[0];
    }

    // 2. Indian English voice (ideal for phonetic Hinglish pronunciation)
    this.indianVoice = this.voices.find(
      (v) =>
        v.lang === 'en-IN' ||
        v.lang.startsWith('en-IN') ||
        v.name.toLowerCase().includes('india')
    ) || null;

    // 3. Native Hindi voice selection (hi-IN)
    const preferredHindi = [
      'hi-IN',
      'hi_IN',
      'Hindi',
      'हिन्दी',
      'Google हिन्दी',
      'Lekha',
      'Neerja',
      'Kalpana',
      'Hemant'
    ];
    for (const name of preferredHindi) {
      const match = this.voices.find(
        (v) =>
          v.lang.includes('hi') ||
          v.name.includes(name) ||
          v.lang.startsWith('hi-IN')
      );
      if (match) {
        this.hindiVoice = match;
        break;
      }
    }
  }

  isSupported() {
    return Boolean(this.synth);
  }

  setEnabled(val) {
    this.isEnabled = Boolean(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tm_voice_enabled', this.isEnabled ? 'true' : 'false');
    }
    if (!this.isEnabled) {
      this.stop();
    }
  }

  getEnabled() {
    return this.isEnabled;
  }

  setLanguage(lang) {
    this.language = lang === 'hi' ? 'hi' : 'en';
    if (typeof window !== 'undefined') {
      localStorage.setItem('tm_bot_lang', this.language);
    }
  }

  getLanguage() {
    return this.language;
  }

  stop() {
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
    }
  }

  /**
   * Plays a subtle frequency tone using Web Audio API for background alert chime
   */
  playAlertChime(frequency = 440, duration = 0.25, type = 'sine') {
    try {
      if (!this.isEnabled) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      // Audio context might be blocked until user gesture, ignore safely
    }
  }

  /**
   * Speak a voice message with specified urgency and language.
   * urgency: 'urgent' | 'warning' | 'normal'
   * langOverride: 'en' | 'hi' | null
   */
  speak(text, urgency = 'normal', langOverride = null) {
    if (!this.isEnabled || !this.synth || !text) return;

    const lang = (langOverride || this.language || 'en').toLowerCase();
    const isHindi = lang.startsWith('hi');

    // Play alert chime first for warnings/urgent
    if (urgency === 'urgent') {
      this.playAlertChime(880, 0.35, 'sawtooth');
    } else if (urgency === 'warning') {
      this.playAlertChime(587.33, 0.2, 'triangle');
    }

    // Cancel any current utterance for urgent message
    if (urgency === 'urgent') {
      this.synth.cancel();
    }

    // Clean formatting and emojis from speech text
    let cleanText = String(text)
      .replace(/[*#_`~•]/g, ' ')
      .replace(/[🛑⚠️📊🔥⚡🛡️🚨📈📉💡🌅👋🇬🇧🇮🇳]/gu, '')
      .replace(/₹/g, ' Rupees ')
      .replace(/।/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();

    const hasDevanagari = /[\u0900-\u097F]/.test(cleanText);

    let utterance;

    if (isHindi && this.hindiVoice && !hasDevanagari) {
      // Hindi mode with native voice
      utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'hi-IN';
      utterance.voice = this.hindiVoice;
    } else if (isHindi && this.hindiVoice && hasDevanagari) {
      // Native Hindi voice is present and text is in Devanagari
      utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'hi-IN';
      utterance.voice = this.hindiVoice;
    } else if ((isHindi || hasDevanagari) && !this.hindiVoice) {
      // Browser lacks native Hindi TTS voice. Transliterate to phonetic Hinglish
      // so English/Indian TTS voice speaks every word clearly instead of skipping Devanagari!
      const transliterated = transliterateDevanagari(cleanText);
      utterance = new SpeechSynthesisUtterance(transliterated);
      utterance.voice = this.indianVoice || this.englishVoice || this.voices[0];
      utterance.lang = this.indianVoice ? this.indianVoice.lang : 'en-US';
    } else {
      // Standard English speech
      utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'en-US';
      if (this.englishVoice) {
        utterance.voice = this.englishVoice;
      }
    }

    // Urgency modulation
    if (urgency === 'urgent') {
      utterance.rate = 1.05;
      utterance.pitch = 1.1;
      utterance.volume = 1.0;
    } else if (urgency === 'warning') {
      utterance.rate = 1.0;
      utterance.pitch = 1.05;
      utterance.volume = 1.0;
    } else {
      utterance.rate = 0.96;
      utterance.pitch = 1.0;
      utterance.volume = 0.95;
    }

    this.synth.speak(utterance);
  }
}

export const voiceAlert = new VoiceAlertService();
export default voiceAlert;
