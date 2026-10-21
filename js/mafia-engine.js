// ==============================================================================
// MAFIA SYNDICATE VOTING ENGINE (SUPABASE + FALLBACK MOCK DATA ENGINE)
// ==============================================================================

// Baca kredensial dari js/config.js (browser-readable) atau fallback ke localStorage
const _cfg = window.APP_CONFIG || {};
const SUPABASE_CONFIG = {
  url: _cfg.SUPABASE_URL || localStorage.getItem('MAFIA_SUPABASE_URL') || '',
  anonKey: _cfg.SUPABASE_ANON_KEY || localStorage.getItem('MAFIA_SUPABASE_ANON') || ''
};

let supabaseClient = null;
if (window.supabase && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    console.log("Connected to Supabase Syndicate Database.");
  } catch (err) {
    console.error("Supabase connection error:", err);
  }
}

// Default Seed Data untuk offline / instant showcase & prototype
const DEFAULT_STATE = {
  show: {
    id: 'show-mafia-01',
    title: 'THE WEAKLING: SYNDICATE JUDGMENT'
  },
  polls: [
    {
      id: 'poll-scene-2',
      scene: 2,
      title: 'SCENE 2 — UNDERBOSS DILEMMA',
      question: 'Jika kalian berada di posisi Radit saat berhadapan dengan tekanan sindikat, apa yang akan kalian lakukan?',
      status: 'closed', // draft, open, closed
      options: [
        {
          id: 'opt-2-a',
          code: 'A',
          label: 'Membantu Sultan',
          desc: 'Tunjukkan loyalitas darah dan hadapi konfrontasi langsung dengan geng saingan.',
          votesCount: 0
        },
        {
          id: 'opt-2-b',
          code: 'B',
          label: 'Tidak Membantu Sultan',
          desc: 'Amankan posisi sendiri dalam bayang-bayang mafia dan susun rencana senyap.',
          votesCount: 0
        }
      ]
    },
    {
      id: 'poll-scene-3',
      scene: 3,
      title: 'SCENE 3 — BLOOD & BETRAYAL',
      question: 'Apa langkah strategis Radit ketika intimidasi dan perundungan kian tak terkendali?',
      status: 'draft',
      options: [
        {
          id: 'opt-3-a',
          code: 'A',
          label: 'Mengalihkan Perhatian',
          desc: 'Gunakan taktik bawah tanah dan sabotase intelijen untuk memecah perhatian musuh.',
          votesCount: 0
        },
        {
          id: 'opt-3-b',
          code: 'B',
          label: 'Menahan Diri',
          desc: 'Kunci amarah, simpan kekuatan rahasia hingga kartu truf dibuka di meja judi kekuasaan.',
          votesCount: 0
        }
      ]
    },
    {
      id: 'poll-scene-4',
      scene: 4,
      title: 'SCENE 4 — THE FINAL GODFATHER ACT',
      question: 'Bagaimana Radit akan menggunakan kekuasaan puncaknya untuk menuntaskan takdir pertunjukan?',
      status: 'draft',
      options: [
        {
          id: 'opt-4-a',
          code: 'A',
          label: 'Happy Ending: Keadilan',
          desc: 'Bongkar seluruh jaringan kriminal demi menegakkan hukum baru di kota.',
          votesCount: 0
        },
        {
          id: 'opt-4-b',
          code: 'B',
          label: 'Sad Ending: Balas Dendam',
          desc: 'Tumpas seluruh musuh dalam perang berdarah terbuka hingga hancur bersama.',
          votesCount: 0
        },
        {
          id: 'opt-4-c',
          code: 'C',
          label: 'Secret Ending: Rencana Balik Topeng',
          desc: 'Rebut takhta tertinggi Mafia dan kendalikan seluruh kota dari balik singgasana gelap.',
          votesCount: 0
        }
      ]
    }
  ],
  // Records: { [pollId]: { [voterToken]: optionId } }
  votes: {}
};

// Local Storage Helper
const STORAGE_KEY = 'MAFIA_VOTE_LOCAL_STATE';

class MafiaEngine {
  constructor() {
    this.listeners = [];
    this.state = this.loadState();

    // Dengarkan perubahan antar tab / window secara otomatis (Sync Real-time di browser)
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) {
        this.state = this.loadState();
        this.notify();
      }
    });

    // Supabase realtime channel jika client ada
    if (supabaseClient) {
      this.initSupabaseRealtime();
    }
  }

  loadState() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn("Error loading stored state, resetting to default", e);
    }
    this.saveState(DEFAULT_STATE);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  saveState(state) {
    this.state = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    this.notify();
  }

  subscribe(callback) {
    this.listeners.push(callback);
    callback(this.state);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify() {
    this.listeners.forEach(cb => cb(this.state));
  }

  // Generate / ambil UUID anonim penonton
  getVoterToken() {
    let token = localStorage.getItem('MAFIA_VOTER_TOKEN');
    if (!token) {
      token = 'don_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      localStorage.setItem('MAFIA_VOTER_TOKEN', token);
    }
    return token;
  }

  // Cek apakah penonton sudah vote di poll tertentu
  hasVoted(pollId) {
    const token = this.getVoterToken();
    return !!(this.state.votes[pollId] && this.state.votes[pollId][token]);
  }

  getUserVote(pollId) {
    const token = this.getVoterToken();
    if (this.state.votes[pollId]) {
      return this.state.votes[pollId][token] || null;
    }
    return null;
  }

  // Kirim suara (FR-04, FR-05, FR-08)
  submitVote(pollId, optionId) {
    const poll = this.state.polls.find(p => p.id === pollId);
    if (!poll) return { success: false, message: 'Sesi tidak ditemukan' };
    if (poll.status !== 'open') return { success: false, message: 'Voting sedang tidak dibuka!' };

    const token = this.getVoterToken();
    if (!this.state.votes[pollId]) {
      this.state.votes[pollId] = {};
    }

    if (this.state.votes[pollId][token]) {
      return { success: false, message: 'Anda sudah menggunakan hak suara pada adegan ini!' };
    }

    // Rekam suara
    this.state.votes[pollId][token] = optionId;
    
    // Update count pada option
    const option = poll.options.find(o => o.id === optionId);
    if (option) {
      option.votesCount = (option.votesCount || 0) + 1;
    }

    this.saveState(this.state);
    return { success: true, message: 'Keputusan Mafia berhasil dicatat!' };
  }

  // ADMIN CONTROLS (FR-01, FR-02, FR-03, FR-10)
  setPollStatus(pollId, newStatus) {
    const poll = this.state.polls.find(p => p.id === pollId);
    if (poll) {
      // Jika membuka sesi ini, tutup sesi lain agar hanya 1 yang aktif serentak (Aturan 1)
      if (newStatus === 'open') {
        this.state.polls.forEach(p => {
          if (p.id !== pollId && p.status === 'open') {
            p.status = 'closed';
          }
        });
      }
      poll.status = newStatus;
      this.saveState(this.state);
    }
  }

  // Reset Sesi Drama untuk Pertunjukan Baru
  resetShow(newTitle) {
    const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
    if (newTitle) {
      fresh.show.title = newTitle;
    }
    this.saveState(fresh);
  }

  // Ambil sesi aktif saat ini
  getActivePoll() {
    return this.state.polls.find(p => p.status === 'open') || null;
  }

  // Perhitungan Hasil Agregasi
  getPollResults(pollId) {
    const poll = this.state.polls.find(p => p.id === pollId);
    if (!poll) return null;

    let total = 0;
    poll.options.forEach(opt => {
      total += (opt.votesCount || 0);
    });

    const optionsWithPercent = poll.options.map(opt => {
      const count = opt.votesCount || 0;
      const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
      return {
        ...opt,
        count,
        percentage: Number(percentage)
      };
    });

    // Cari pemenang jika ditutup
    let maxVotes = -1;
    let winner = null;
    let isTie = false;

    if (total > 0) {
      optionsWithPercent.forEach(opt => {
        if (opt.count > maxVotes) {
          maxVotes = opt.count;
          winner = opt;
          isTie = false;
        } else if (opt.count === maxVotes && maxVotes > 0) {
          isTie = true;
        }
      });
    }

    return {
      poll,
      totalVotes: total,
      options: optionsWithPercent,
      winner: isTie ? null : winner,
      isTie
    };
  }

  // Supabase Realtime Handler (jika connect)
  initSupabaseRealtime() {
    // Sinkronisasi data awal dari Supabase jika ada
    supabaseClient
      .channel('public:polls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, payload => {
        console.log("Realtime poll update:", payload);
      })
      .subscribe();
  }
}

// Inisialisasi Single Instance Engine
window.mafiaEngine = new MafiaEngine();
